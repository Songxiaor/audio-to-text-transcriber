#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const backgroundSource = readFileSync("douyin-stepasr-extension/background.js", "utf8");
const sidepanelHtml = readFileSync("douyin-stepasr-extension/sidepanel.html", "utf8");
const sidepanelSource = readFileSync("douyin-stepasr-extension/sidepanel.js", "utf8");
const sidepanelCss = readFileSync("douyin-stepasr-extension/sidepanel.css", "utf8");

const context = {
  chrome: {
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
        addListener() {}
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
    sidePanel: {
      open: () => Promise.resolve()
    },
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
  },
  clearTimeout,
  console,
  importScripts() {},
  Promise,
  setTimeout,
  URL
};

vm.runInNewContext(backgroundSource, context, { filename: "background.js" });

assert.equal(typeof context.inferHistoryPlatformFromPageUrl, "function");
assert.equal(context.inferHistoryPlatformFromPageUrl("https://www.douyin.com/video/7535555555555555555"), "douyin");
assert.equal(context.inferHistoryPlatformFromPageUrl("https://foo.douyin.com/share/video/7535555555555555555"), "douyin");
assert.equal(context.inferHistoryPlatformFromPageUrl("https://www.xiaohongshu.com/explore/65abc123def4567890123456"), "xiaohongshu");
assert.equal(context.inferHistoryPlatformFromPageUrl("https://example.com/video/1"), "");
assert.equal(context.inferHistoryPlatformFromPageUrl("not-a-url but has douyin.com"), "douyin");

const normalized = context.normalizeHistoryItemForStorage({
  text: "历史记录",
  pageUrl: "https://www.xiaohongshu.com/explore/65abc123def4567890123456",
  cover: "//sns-img-qc.xhscdn.com/cover.jpg",
  author: "  作者  "
});
assert.equal(normalized.platform, "xiaohongshu");
assert.equal(normalized.cover, "https://sns-img-qc.xhscdn.com/cover.jpg");
assert.equal(normalized.author, "作者");

assert(sidepanelHtml.includes('id="historyPlatformFilter"'));
assert(sidepanelHtml.includes("全部平台"));
assert(sidepanelSource.includes('historyPlatformFilter.addEventListener("change"'));
assert(sidepanelSource.includes('img.referrerPolicy = "no-referrer"'));
assert(sidepanelSource.includes('img.addEventListener("error"'));
assert(sidepanelSource.includes("inferHistoryPlatformFromPageUrl(record.pageUrl)"));
assert(sidepanelSource.includes("约 ${formatCount(totalCharacters)} 字"));
assert(sidepanelCss.includes(".history-card-head.has-cover"));
assert(sidepanelCss.includes(".history-cover"));

console.log("History management metadata tests passed.");
