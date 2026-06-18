#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const backgroundSource = readFileSync("douyin-stepasr-extension/background.js", "utf8");
const contentSource = readFileSync("douyin-stepasr-extension/content.js", "utf8");
const contentCssSource = readFileSync("douyin-stepasr-extension/content.css", "utf8");
const sidepanelSource = readFileSync("douyin-stepasr-extension/sidepanel.js", "utf8");
const sidepanelCssSource = readFileSync("douyin-stepasr-extension/sidepanel.css", "utf8");

function loadBackground(sidePanel, sender = { tab: { id: 7 } }) {
  const state = {
    calls: [],
    onMessage: null,
    responses: []
  };
  const sidePanelMock = sidePanel && typeof sidePanel.open === "function"
    ? {
        ...sidePanel,
        open(options) {
          state.calls.push(options);
          return sidePanel.open(options);
        }
      }
    : sidePanel;
  const chrome = {
    action: {
      onClicked: {
        addListener() {}
      }
    },
    downloads: {
      download: () => Promise.resolve(1)
    },
    runtime: {
      onInstalled: {
        addListener() {}
      },
      onMessage: {
        addListener(listener) {
          state.onMessage = listener;
        }
      },
      onStartup: {
        addListener() {}
      },
      sendMessage: () => Promise.resolve()
    },
    scripting: {
      executeScript: () => Promise.resolve(),
      insertCSS: () => Promise.resolve()
    },
    sidePanel: sidePanelMock,
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve()
      }
    },
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve()
    }
  };
  const context = {
    chrome,
    clearTimeout,
    console,
    importScripts() {},
    Promise,
    setTimeout,
    URL
  };

  vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
  assert.equal(typeof state.onMessage, "function", "background message listener is registered");
  const keepAlive = state.onMessage(
    { type: "STEPASR_OPEN_PANEL" },
    sender,
    response => state.responses.push(response)
  );
  return { keepAlive, state };
}

async function waitForResponse(state) {
  for (let index = 0; index < 5 && state.responses.length === 0; index += 1) {
    await Promise.resolve();
  }
  assert.equal(state.responses.length, 1, "sendResponse called once");
  return state.responses[0];
}

{
  const sidePanel = {
    open() {
      return Promise.resolve();
    }
  };
  const success = loadBackground(sidePanel);
  assert.equal(success.keepAlive, true);
  assert.equal(success.state.calls.length, 1, "sidePanel.open is called before handler returns");
  assert.equal(success.state.calls[0].tabId, 7);
  const response = await waitForResponse(success.state);
  assert.equal(response.ok, true);
}

{
  const missingTab = loadBackground({
    open() {
      return Promise.resolve();
    }
  }, { tab: {} });
  assert.equal(missingTab.keepAlive, true);
  assert.deepEqual(missingTab.state.calls, []);
  const response = await waitForResponse(missingTab.state);
  assert.equal(response.ok, false);
  assert.match(response.error, /没有拿到当前标签页/);
}

{
  const missingApi = loadBackground(undefined);
  assert.equal(missingApi.keepAlive, true);
  const response = await waitForResponse(missingApi.state);
  assert.equal(response.ok, false);
  assert.match(response.error, /没有提供 chrome\.sidePanel API/);
}

{
  const missingOpen = loadBackground({});
  assert.equal(missingOpen.keepAlive, true);
  const response = await waitForResponse(missingOpen.state);
  assert.equal(response.ok, false);
  assert.match(response.error, /不支持 chrome\.sidePanel\.open\(\) 程序化打开侧边栏/);
}

{
  const thrown = loadBackground({
    open() {
      throw new Error("user gesture required");
    }
  });
  assert.equal(thrown.keepAlive, true);
  const response = await waitForResponse(thrown.state);
  assert.equal(response.ok, false);
  assert.match(response.error, /chrome\.sidePanel\.open\(\) 调用失败：user gesture required/);
}

{
  const rejected = loadBackground({
    open() {
      return Promise.reject(new Error("user activation missing"));
    }
  });
  assert.equal(rejected.keepAlive, true);
  const response = await waitForResponse(rejected.state);
  assert.equal(response.ok, false);
  assert.match(response.error, /chrome\.sidePanel\.open\(\) 调用失败：user activation missing/);
}

assert.equal(backgroundSource.includes("chrome.tabs.create"), false, "background must not fallback to an extension tab");
assert.match(contentSource, /OPEN_PANEL_FALLBACK_GUIDE = "当前浏览器不支持从这里打开，请点击浏览器工具栏的扩展图标打开侧边栏"/);
assert(contentSource.includes('showToast("正在打开侧边栏...", TOAST_OPENING_DELAY_MS)'));
assert(contentSource.includes('showToast(formatOpenPanelError(response?.error || "无法打开侧边栏。"), TOAST_LONG_DELAY_MS)'));
assert(contentSource.includes('title="打开侧边栏"'));
assert(contentSource.includes(">打开侧边栏</button>"));
assert(contentSource.includes("formatOpenPanelError(chrome.runtime.lastError.message)"));
assert(contentSource.includes('root?.querySelector(".stepasr-toast")'));
assert(contentSource.includes('(root || document.documentElement).appendChild(toast)'));
assert(contentCssSource.includes(".stepasr-widget .stepasr-toast"));
assert(contentCssSource.includes("bottom: calc(100% + 8px)"));
assert(contentCssSource.includes("pointer-events: none"));
assert(contentSource.includes("writeClipboardText(copyText)"));
assert(contentSource.includes("formatClipboardWriteError(error)"));
assert(sidepanelSource.includes('document.body.classList.toggle("has-settings-actions", name === "settings")'));
assert(sidepanelSource.includes("STATUS_VISIBLE_DELAY_MS = 5200"));
assert(sidepanelCssSource.includes("body.has-settings-actions .status"));
assert(sidepanelCssSource.includes("bottom: var(--status-settings-bottom)"));
assert(sidepanelCssSource.includes(".settings-actions"));
assert(sidepanelCssSource.includes("z-index: 20"));
assert(sidepanelCssSource.includes("pointer-events: none"));
assert(sidepanelSource.includes("writeClipboardText(report)"));
assert(sidepanelSource.includes("async function copyToClipboard"));
assert(sidepanelSource.includes("formatClipboardWriteError(error)"));
assert(sidepanelSource.includes("async function openHistoryPageUrl"));
assert(sidepanelSource.includes('typeof chrome.tabs?.create !== "function"'));
{
  const ensurePermissionSource = sidepanelSource.slice(
    sidepanelSource.indexOf("async function ensureEndpointPermission"),
    sidepanelSource.indexOf("function toOriginPattern")
  );
  assert(ensurePermissionSource.includes("chrome.permissions.request"));
  assert(ensurePermissionSource.includes("chrome.permissions.contains"));
  assert(
    ensurePermissionSource.indexOf("chrome.permissions.request") < ensurePermissionSource.indexOf("chrome.permissions.contains"),
    "endpoint permission request must be attempted before contains awaits can lose user gesture"
  );
}

console.log("Side panel open tests passed.");
