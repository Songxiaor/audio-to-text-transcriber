#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const extDir = join(root, "douyin-stepasr-extension");
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profileDir = mkdtempSync(join(tmpdir(), "stepasr-runtime-"));
const port = 49380 + Math.floor(Math.random() * 1000);

let chromeProcess;

try {
  chromeProcess = spawn(chromeBin, [
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--remote-debugging-port=${port}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"]
  });

  const extensionId = await waitForExtensionId();
  assert.match(extensionId, /^[a-p]{32}$/);

  const browserSocket = await connectToBrowser();
  const sidepanelUrl = `chrome-extension://${extensionId}/sidepanel.html`;
  await browserSocket.send("Target.createTarget", { url: sidepanelUrl });
  await browserSocket.close();

  const pageTarget = await waitForDebuggablePage(target => target.type === "page" && target.url === sidepanelUrl);
  const page = new CdpConnection(pageTarget.webSocketDebuggerUrl);
  await page.open();

  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await waitForDocument(page);

  const manifestVersion = await evaluate(page, "chrome.runtime.getManifest().version");
  assert.equal(manifestVersion, manifest.version);

  const initialSettings = await sendRuntimeMessage(page, { type: "STEPASR_GET_SETTINGS" });
  assert.equal(initialSettings.ok, true);
  assert.equal(initialSettings.settings.endpoint, "https://api.stepfun.com/step_plan/v1/audio/asr/sse");
  assert.equal(initialSettings.settings.model, "stepaudio-2.5-asr");

  const saveResponse = await sendRuntimeMessage(page, {
    type: "STEPASR_SAVE_SETTINGS",
    payload: {
      endpoint: "https://api.stepfun.ai/step_plan/v1/audio/asr/sse",
      apiKey: "subscription-token-without-sk-prefix",
      model: "stepaudio-2.5-asr",
      language: "zh",
      hotwords: "",
      prompt: "",
      convertToPcm: "auto",
      enableItn: true
    }
  });
  assert.equal(saveResponse.ok, true);

  const migratedSettings = await sendRuntimeMessage(page, { type: "STEPASR_GET_SETTINGS" });
  assert.equal(migratedSettings.ok, true);
  assert.equal(migratedSettings.settings.endpoint, "https://api.stepfun.com/step_plan/v1/audio/asr/sse");
  assert.equal(migratedSettings.settings.apiKey, "subscription-token-without-sk-prefix");

  const lastApiTest = await sendRuntimeMessage(page, { type: "STEPASR_GET_LAST_API_TEST" });
  assert.equal(lastApiTest.ok, true);
  assert.equal(lastApiTest.apiTest, null);

  const uiText = await evaluate(page, "document.body.innerText");
  assert.match(uiText, /StepAudio 文案转写/);
  assert.match(uiText, /测试 API/);
  assert.match(uiText, /复制诊断/);

  await page.close();
  console.log(JSON.stringify({
    ok: true,
    extensionId,
    version: manifestVersion,
    endpoint: migratedSettings.settings.endpoint
  }, null, 2));
} finally {
  if (chromeProcess && !chromeProcess.killed) {
    chromeProcess.kill("SIGTERM");
  }
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
}

async function waitForExtensionId() {
  const target = await waitForBrowserTarget(item => (
    ["service_worker", "background_page"].includes(item.type) &&
    item.url.startsWith("chrome-extension://") &&
    item.url.endsWith("/background.js")
  ));
  return new URL(target.url).hostname;
}

async function connectToBrowser() {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const connection = new CdpConnection(version.webSocketDebuggerUrl);
  await connection.open();
  return connection;
}

async function waitForBrowserTarget(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const browser = await connectToBrowser();
      const result = await browser.send("Target.getTargets");
      await browser.close();
      const target = (result.targetInfos || []).find(predicate);
      if (target) return target;
    } catch {
      await sleep(250);
      continue;
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for extension runtime target.");
}

async function waitForDebuggablePage(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    let targets = [];
    try {
      targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    } catch {
      await sleep(250);
      continue;
    }
    const target = targets.find(predicate);
    if (target) return target;
    await sleep(250);
  }
  throw new Error("Timed out waiting for debuggable page target.");
}

async function waitForDocument(page) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await evaluate(page, "document.readyState");
    if (state === "interactive" || state === "complete") return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for sidepanel document.");
}

async function sendRuntimeMessage(page, message) {
  return evaluate(page, `new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify(message)}, resolve))`);
}

async function evaluate(page, expression) {
  const response = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime evaluation failed.");
  }
  return response.result.value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.callbacks = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", event => this.handleMessage(event.data));
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
    });
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (!message.id || !this.callbacks.has(message.id)) return;
    const { resolve, reject } = this.callbacks.get(message.id);
    this.callbacks.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "CDP command failed."));
    else resolve(message.result || {});
  }

  close() {
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    this.socket.close();
    return Promise.resolve();
  }
}
