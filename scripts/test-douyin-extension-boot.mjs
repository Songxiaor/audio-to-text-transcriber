#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const bootPath = resolve("douyin-stepasr-extension/douyin-extension-boot.js");
const Boot = require(bootPath);

assert.deepEqual(Boot.CONTENT_SCRIPT_FILES, ["platform-adapter-core.js", "douyin-detector.js", "douyin-adapter.js", "postprocess.js", "content.js"]);
assert.deepEqual(Boot.DOUYIN_CONTENT_SCRIPT_FILES, ["platform-adapter-core.js", "douyin-detector.js", "douyin-adapter.js", "postprocess.js", "content.js"]);
assert.deepEqual(Boot.XIAOHONGSHU_MAIN_WORLD_SCRIPT_FILES, ["xiaohongshu-feed-hook.js"]);
assert.deepEqual(Boot.XIAOHONGSHU_CONTENT_SCRIPT_FILES, ["platform-adapter-core.js", "xiaohongshu-adapter.js", "postprocess.js", "content.js"]);
assert.deepEqual(Boot.CONTENT_CSS_FILES, ["content.css"]);
assert(Boot.DOUYIN_TAB_URL_PATTERNS.includes("*://*.douyin.com/*"));
assert(Boot.XIAOHONGSHU_TAB_URL_PATTERNS.includes("*://*.xiaohongshu.com/*"));
assert(Boot.SUPPORTED_TAB_URL_PATTERNS.includes("*://*.xiaohongshu.com/*"));

assert.equal(Boot.isDouyinPageUrl("https://www.douyin.com/video/7533333333333333333"), true);
assert.equal(Boot.isDouyinPageUrl("https://douyin.com/video/7533333333333333333"), true);
assert.equal(Boot.isDouyinPageUrl("https://live.douyin.com/123"), true);
assert.equal(Boot.isDouyinPageUrl("http://www.douyin.com/video/7533333333333333333"), true);
assert.equal(Boot.isDouyinPageUrl("chrome://extensions/"), false);
assert.equal(Boot.isDouyinPageUrl("https://notdouyin.com/video/7533333333333333333"), false);
assert.equal(Boot.isDouyinPageUrl("https://douyin.com.evil.example/video/7533333333333333333"), false);
assert.equal(Boot.isDouyinPageUrl("not a url"), false);

assert.equal(Boot.isXiaohongshuPageUrl("https://www.xiaohongshu.com/explore/65abc123def4567890123456?xsec_token=abc"), true);
assert.equal(Boot.isXiaohongshuPageUrl("https://xiaohongshu.com/discovery/item/65abc123def4567890123456"), true);
assert.equal(Boot.isXiaohongshuPageUrl("https://xiaohongshu.com.evil.example/explore/65abc123def4567890123456"), false);
assert.equal(Boot.isSupportedPageUrl("https://www.xiaohongshu.com/explore/65abc123def4567890123456"), true);
assert.deepEqual(Boot.getMainWorldContentScriptFilesForUrl("https://www.xiaohongshu.com/explore/65abc123def4567890123456"), Boot.XIAOHONGSHU_MAIN_WORLD_SCRIPT_FILES);
assert.deepEqual(Boot.getMainWorldContentScriptFilesForUrl("https://www.douyin.com/video/7533333333333333333"), []);
assert.equal(Boot.getContentScriptFilesForUrl("https://www.xiaohongshu.com/explore/65abc123def4567890123456"), Boot.XIAOHONGSHU_CONTENT_SCRIPT_FILES);
assert.equal(Boot.getContentScriptFilesForUrl("https://www.douyin.com/video/7533333333333333333"), Boot.DOUYIN_CONTENT_SCRIPT_FILES);

console.log("Douyin extension boot tests passed.");
