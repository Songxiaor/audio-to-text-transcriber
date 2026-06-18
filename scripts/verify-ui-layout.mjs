#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const extDir = join(root, "douyin-stepasr-extension");
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
const tmpDir = mkdtempSync(join(tmpdir(), "stepasr-ui-"));
const require = createRequire(import.meta.url);

let browserContext;

async function main() {
  try {
    const playwright = loadPlaywright();
    const sidepanelUrl = makeSidepanelHarness();
    const contentUrl = makeContentHarness();
    browserContext = await launchExtensionContext(playwright.chromium);

    for (const width of [320, 360, 400, 600]) {
      await verifySidepanelAtWidth(sidepanelUrl, width);
    }
    await verifyFloatingWidget(contentUrl);

    console.log(`UI layout verification passed with ${playwright.name} ${playwright.version}.`);
  } finally {
    if (browserContext) await browserContext.close();
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
}

function loadPlaywright() {
  const candidates = [
    { name: "playwright", moduleId: "playwright" },
    { name: "playwright-core", moduleId: "playwright-core" },
    {
      name: "playwright-core",
      moduleId: "/Users/song/.stepfun/stepclaw/node_modules/playwright-core"
    }
  ];

  for (const candidate of candidates) {
    try {
      const module = require(candidate.moduleId);
      const pkg = require(join(candidate.moduleId, "package.json"));
      if (module.chromium) return { ...candidate, chromium: module.chromium, version: pkg.version };
    } catch {
      // Try the next local installation candidate.
    }
  }

  throw new Error(
    "Playwright is required for UI layout verification. Install it with `npm install --save-dev playwright` and `npx playwright install chromium`."
  );
}

async function launchExtensionContext(chromium) {
  try {
    const executablePath = resolveChromiumExecutablePath(chromium);
    const context = await chromium.launchPersistentContext(join(tmpDir, "profile"), {
      ...(executablePath ? { executablePath } : { channel: "chromium" }),
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      viewport: null,
      args: [
        `--disable-extensions-except=${extDir}`,
        `--load-extension=${extDir}`,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check"
      ]
    });
    await waitForExtensionServiceWorker(context);
    return context;
  } catch (error) {
    if (String(error.message || error).includes("Executable doesn't exist")) {
      throw new Error(
        "Playwright Chromium / Chrome for Testing is not installed. Run `npx playwright install chromium`, then rerun `node scripts/verify-ui-layout.mjs`.",
        { cause: error }
      );
    }
    throw error;
  }
}

function resolveChromiumExecutablePath(chromium) {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    getPlaywrightExecutablePath(chromium),
    ...findBrowserExecutables(
      join(homedir(), ".agent-browser", "browsers"),
      join("Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")
    ),
    ...findBrowserExecutables(
      join(homedir(), ".cloakbrowser"),
      join("Chromium.app", "Contents", "MacOS", "Chromium")
    ),
    ...findBrowserExecutables(
      join(homedir(), ".chromium-browser-snapshots", "chromium"),
      join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
    )
  ].filter(Boolean);

  return candidates.find(candidate => existsSync(candidate));
}

function getPlaywrightExecutablePath(chromium) {
  try {
    return chromium.executablePath();
  } catch {
    return "";
  }
}

function findBrowserExecutables(baseDir, suffix) {
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(baseDir, entry.name, suffix));
  } catch {
    return [];
  }
}

async function waitForExtensionServiceWorker(context) {
  const existingWorker = context.serviceWorkers().find(worker => worker.url().startsWith("chrome-extension://"));
  if (existingWorker) return existingWorker;

  const worker = await context.waitForEvent("serviceworker", { timeout: 8000 });
  if (!worker.url().startsWith("chrome-extension://")) {
    throw new Error(`Unexpected service worker loaded while waiting for extension: ${worker.url()}`);
  }
  return worker;
}

function makeSidepanelHarness() {
  const html = readFileSync(join(extDir, "sidepanel.html"), "utf8")
    .replace('href="sidepanel.css"', `href="${pathToFileURL(join(extDir, "sidepanel.css")).href}"`)
    .replace('<script src="diagnostics.js"></script>', `<script>${sidepanelChromeStub()}</script><script src="${pathToFileURL(join(extDir, "diagnostics.js")).href}"></script>`)
    .replace('<script src="postprocess.js"></script>', `<script src="${pathToFileURL(join(extDir, "postprocess.js")).href}"></script>`)
    .replace('<script src="sync-core.js"></script>', `<script src="${pathToFileURL(join(extDir, "sync-core.js")).href}"></script>`)
    .replace('<script src="sidepanel.js"></script>', `<script src="${pathToFileURL(join(extDir, "sidepanel.js")).href}"></script>`);
  const path = join(tmpDir, "sidepanel.html");
  writeFileSync(path, html, "utf8");
  return pathToFileURL(path).href;
}

function makeContentHarness() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; width: 100vw; height: 100vh; background: #111; }
      video { position: fixed; inset: 0; width: 100vw; height: 100vh; }
    </style>
    <link rel="stylesheet" href="${pathToFileURL(join(extDir, "content.css")).href}">
  </head>
  <body>
    <video></video>
    <script>${contentChromeStub()}</script>
    <script src="${pathToFileURL(join(extDir, "content.js")).href}"></script>
  </body>
</html>`;
  const path = join(tmpDir, "content.html");
  writeFileSync(path, html, "utf8");
  return pathToFileURL(path).href;
}

function sidepanelChromeStub() {
  return `
let sampleHistory = [
  {
    id: "1",
    title: "很长很长的抖音标题用于验证侧边栏不会被撑宽并且可以正常换行",
    text: "这是一条很长的转写文案，用来验证预览、搜索、编辑按钮、复制按钮和窄宽度布局都不会造成横向滚动。".repeat(4),
    pageUrl: "https://www.douyin.com/video/7535555555555555555?modal_id=long-query-should-not-overflow",
    awemeId: "7535555555555555555",
    mediaKind: "audio",
    format: { type: "mp3" },
    createdAt: "2026-05-30T00:00:00.000Z"
  },
  {
    id: "2",
    title: "短标题",
    text: "第二条记录。",
    pageUrl: "https://www.douyin.com/video/7536666666666666666",
    awemeId: "7536666666666666666",
    mediaKind: "video",
    format: { type: "pcm" },
    createdAt: "2026-05-30T00:05:00.000Z"
  }
];
window.chrome = {
  runtime: {
    getManifest: () => ({ version: "${manifest.version}", name: "StepAudio Douyin Transcriber", manifest_version: 3 }),
    onMessage: { addListener() {} },
    sendMessage(message) {
      if (message.type === "STEPASR_GET_SETTINGS") {
        return Promise.resolve({ ok: true, settings: {
          endpoint: "https://api.stepfun.com/step_plan/v1/audio/asr/sse",
          apiKey: "fake-key-not-real",
          model: "stepaudio-2.5-asr",
          language: "zh",
          hotwords: "",
          prompt: "",
          convertToPcm: "auto",
          enableItn: true
        }});
      }
      if (message.type === "STEPASR_GET_HISTORY") return Promise.resolve({ ok: true, history: sampleHistory });
      if (message.type === "STEPASR_CLEAR_HISTORY") { sampleHistory = []; return Promise.resolve({ ok: true }); }
      if (message.type === "STEPASR_GET_LAST_DETECTION") return Promise.resolve({ ok: true, detection: null });
      if (message.type === "STEPASR_GET_LAST_API_TEST") return Promise.resolve({ ok: true, apiTest: null });
      if (message.type === "STEPASR_SAVE_SETTINGS") return Promise.resolve({ ok: true, settings: message.payload });
      if (message.type === "STEPASR_TEST_API") return Promise.resolve({ ok: true, message: "API 连通。" });
      return Promise.resolve({ ok: true });
    }
  },
  permissions: {
    contains: () => Promise.resolve(true),
    request: () => Promise.resolve(true)
  },
  storage: {
    onChanged: { addListener() {} },
    local: {
      set(value) {
        if (Array.isArray(value.stepasr_history)) sampleHistory = value.stepasr_history;
        return Promise.resolve();
      }
    }
  },
  tabs: { create() {} }
};
`;
}

function contentChromeStub() {
  return `
window.chrome = {
  runtime: {
    getManifest: () => ({ version: "${manifest.version}" }),
    onMessage: { addListener() {} },
    sendMessage(message, callback) {
      if (typeof callback === "function") callback({ ok: true, text: "测试转写结果" });
      return Promise.resolve({ ok: true });
    }
  },
  storage: {
    onChanged: { addListener() {} },
    local: {
      get(defaults, callback) { callback(defaults); },
      set() {}
    }
  }
};
window.DouyinDetector = {
  detectFromSources() {
    return { awemeId: "7535555555555555555", diagnostics: null };
  }
};
`;
}

async function verifySidepanelAtWidth(url, width) {
  const page = await openPage(url, width, 760);
  await waitForReady(page);
  const recordState = await evaluate(page, `(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      clientWidth: root.clientWidth,
      activeRecords: document.querySelector('[data-view="records"]').classList.contains('is-active'),
      hasHistoryCards: document.querySelectorAll('.history-item').length,
      clearRight: document.getElementById('clearHistory').getBoundingClientRect().right
    };
  })()`);
  assert.equal(recordState.activeRecords, true, `records tab is default at ${width}px`);
  assert.equal(recordState.hasHistoryCards, 2, `history renders at ${width}px`);
  assert(recordState.scrollWidth <= recordState.clientWidth + 1, `records view has no horizontal overflow at ${width}px`);
  assert(recordState.clearRight <= width + 1, `clear button is visible at ${width}px`);

  await evaluate(page, `document.getElementById('settingsTab').click()`);
  const settingsState = await evaluate(page, `(() => {
    const root = document.documentElement;
    const body = document.body;
    const save = document.getElementById('save').getBoundingClientRect();
    const endpoint = document.getElementById('endpoint').getBoundingClientRect();
    return {
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      clientWidth: root.clientWidth,
      saveLeft: save.left,
      saveRight: save.right,
      saveBottom: save.bottom,
      endpointRight: endpoint.right,
      innerHeight: window.innerHeight
    };
  })()`);
  assert(settingsState.scrollWidth <= settingsState.clientWidth + 1, `settings view has no horizontal overflow at ${width}px`);
  assert(settingsState.saveLeft >= -1 && settingsState.saveRight <= width + 1, `save button is horizontally visible at ${width}px`);
  assert(settingsState.saveBottom <= settingsState.innerHeight + 1, `save button is vertically visible at ${width}px`);
  assert(settingsState.endpointRight <= width + 1, `endpoint input is visible at ${width}px`);
  await page.close();
}

async function verifyFloatingWidget(url) {
  const page = await openPage(url, 1280, 800);
  await waitForReady(page);
  const collapsed = await evaluate(page, `(() => {
    const root = document.getElementById('stepasr-widget');
    const card = document.querySelector('.stepasr-card');
    const pill = document.querySelector('.stepasr-pill');
    return {
      collapsed: root.classList.contains('stepasr-collapsed'),
      cardDisplay: getComputedStyle(card).display,
      pillDisplay: getComputedStyle(pill).display,
      width: Math.round(root.getBoundingClientRect().width)
    };
  })()`);
  assert.equal(collapsed.collapsed, true, "floating widget starts collapsed");
  assert.equal(collapsed.cardDisplay, "none", "floating card is hidden by default");
  assert.notEqual(collapsed.pillDisplay, "none", "floating pill is visible by default");
  assert(collapsed.width <= 180, "floating pill stays compact");

  await evaluate(page, `document.querySelector('[data-stepasr-toggle]').click()`);
  const expanded = await evaluate(page, `(() => {
    const root = document.getElementById('stepasr-widget');
    const result = document.querySelector('[data-stepasr-result]');
    return {
      collapsed: root.classList.contains('stepasr-collapsed'),
      width: Math.round(root.getBoundingClientRect().width),
      resultMaxHeight: getComputedStyle(result).maxHeight,
      zIndex: Number(getComputedStyle(root).zIndex)
    };
  })()`);
  assert.equal(expanded.collapsed, false, "floating widget expands");
  assert(expanded.width <= 300, "expanded floating widget stays compact");
  assert(expanded.zIndex >= 2147483000, "floating widget keeps high z-index");
  assert.notEqual(expanded.resultMaxHeight, "none", "floating result has max height");
  await page.close();
}

async function openPage(url, width, height) {
  const page = await browserContext.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

async function waitForReady(page) {
  await page.waitForFunction(
    () => document.readyState === "interactive" || document.readyState === "complete",
    null,
    { timeout: 8000 }
  );
}

async function evaluate(page, expression) {
  return page.evaluate(expression);
}

await main();
