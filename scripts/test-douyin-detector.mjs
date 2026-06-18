#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const detectorPath = resolve("douyin-stepasr-extension/douyin-detector.js");
const DouyinDetector = require(detectorPath);

function detect(sources) {
  return DouyinDetector.detectFromSources({
    title: "测试标题 - 抖音",
    videoCount: 1,
    visibleVideoCount: 1,
    ...sources
  });
}

assert.deepEqual(
  DouyinDetector.collectIdsFromText("https://www.douyin.com/video/7521111111111111111").map(item => item.id),
  ["7521111111111111111"]
);

assert.equal(
  detect({ pageUrl: "https://www.douyin.com/?modal_id=7522222222222222222" }).awemeId,
  "7522222222222222222"
);

assert.equal(
  detect({ pageUrl: "https://www.douyin.com/?modal_id%3D7523333333333333333%26previous_page%3Dmain" }).awemeId,
  "7523333333333333333"
);

assert.equal(
  detect({ scripts: ['window.__ROUTER_DATA__={\\"aweme_id\\":\\"7524444444444444444\\"};'] }).awemeId,
  "7524444444444444444"
);

assert.equal(
  detect({ scripts: ['{"awemeId":"7525555555555555555","desc":"x"}'] }).awemeId,
  "7525555555555555555"
);

const activeBeatsUnrelatedScript = detect({
  scripts: ['{"aweme_id":"7526666666666666666"}'],
  activeTexts: ['<div data-aweme-id="7527777777777777777"></div>']
});
assert.equal(activeBeatsUnrelatedScript.awemeId, "7527777777777777777");
assert.equal(activeBeatsUnrelatedScript.source, "active-video-dom");

const visibleLinkBeatsHiddenLink = detect({
  visibleLinks: [
    { href: "https://www.douyin.com/video/7528888888888888888", score: 0 },
    { href: "https://www.douyin.com/video/7529999999999999999", score: 120000 }
  ]
});
assert.equal(visibleLinkBeatsHiddenLink.awemeId, "7529999999999999999");

const storageFallback = detect({
  storage: [
    { key: "douyin.feed.cache", value: '{"item_id":"7530000000000000000"}' }
  ]
});
assert.equal(storageFallback.awemeId, "7530000000000000000");

const duplicateHits = detect({
  scripts: [
    '{"aweme_id":"7531111111111111111"}',
    '{"aweme_id":"7531111111111111111"}'
  ]
});
assert.equal(duplicateHits.awemeId, "7531111111111111111");
assert.equal(duplicateHits.diagnostics.topCandidates[0].hits, 2);
assert.equal(duplicateHits.title, "测试标题");

console.log("Douyin detector tests passed.");
