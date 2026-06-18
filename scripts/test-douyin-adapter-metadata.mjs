#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

function setDocumentScripts(scripts = []) {
  globalThis.document = {
    title: "页面标题 - 抖音",
    scripts: scripts.map(text => ({ textContent: text })),
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

globalThis.location = {
  href: "https://www.douyin.com/video/7534444444444444444",
  hostname: "www.douyin.com"
};
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.localStorage = {
  length: 0,
  key: () => "",
  getItem: () => ""
};
globalThis.performance = {
  getEntriesByType: () => []
};

require(resolve("douyin-stepasr-extension/platform-adapter-core.js"));

setDocumentScripts([]);
globalThis.DouyinDetector = {
  detectFromSources(sources) {
    return {
      awemeId: "7534444444444444444",
      source: "test-detector",
      title: sources.title,
      pageUrl: sources.pageUrl,
      detail: {
        video: {
          cover: {
            url_list: ["https://p3.douyinpic.com/cover-primary.jpeg"]
          },
          origin_cover: {
            url_list: ["https://p3.douyinpic.com/cover-origin.jpeg"]
          }
        },
        author: {
          nickname: "抖音作者"
        }
      },
      diagnostics: {}
    };
  }
};

const DouyinAdapter = require(resolve("douyin-stepasr-extension/douyin-adapter.js"));
const detailDetection = DouyinAdapter.detectCurrentMedia();
assert.equal(detailDetection.platform, "douyin");
assert.equal(detailDetection.cover, "https://p3.douyinpic.com/cover-primary.jpeg");
assert.equal(detailDetection.author, "抖音作者");

setDocumentScripts([
  `window.__DATA__={"aweme_detail":{"aweme_id":"7534444444444444444","video":{"origin_cover":{"url_list":["//p9.douyinpic.com/origin-cover.webp"]}},"author":{"nickname":"脚本作者"}}};`
]);
globalThis.DouyinDetector = {
  detectFromSources(sources) {
    return {
      awemeId: "7534444444444444444",
      source: "test-script",
      title: sources.title,
      pageUrl: sources.pageUrl,
      diagnostics: {}
    };
  }
};

const scriptDetection = DouyinAdapter.detectCurrentMedia();
assert.equal(scriptDetection.platform, "douyin");
assert.equal(scriptDetection.cover, "https://p9.douyinpic.com/origin-cover.webp");
assert.equal(scriptDetection.author, "脚本作者");

console.log("Douyin adapter metadata tests passed.");
