#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("douyin-stepasr-extension/manifest.json", "utf8"));
const contentSource = readFileSync("douyin-stepasr-extension/content.js", "utf8");
const contentCssSource = readFileSync("douyin-stepasr-extension/content.css", "utf8");
const bootSource = readFileSync("douyin-stepasr-extension/douyin-extension-boot.js", "utf8");

function assertLoadsPostprocessBeforeContent(files, label) {
  assert(files.includes("postprocess.js"), `${label} loads postprocess.js`);
  assert(files.includes("content.js"), `${label} loads content.js`);
  assert(
    files.indexOf("postprocess.js") < files.indexOf("content.js"),
    `${label} loads postprocess.js before content.js`
  );
}

assert.equal(manifest.version, "0.1.47");

const douyinContentScript = manifest.content_scripts.find(item =>
  item.js?.includes("douyin-adapter.js")
);
const xiaohongshuContentScript = manifest.content_scripts.find(item =>
  item.js?.includes("xiaohongshu-adapter.js")
);

assertLoadsPostprocessBeforeContent(douyinContentScript.js, "Douyin manifest content script");
assertLoadsPostprocessBeforeContent(xiaohongshuContentScript.js, "Xiaohongshu manifest content script");
assert(bootSource.includes('"postprocess.js", "content.js"'), "programmatic injection lists keep postprocess before content");

assert(contentSource.includes('POSTPROCESS_KEY = "stepasr_postprocess"'), "content reads the shared postprocess preference key");
assert(contentSource.includes("globalThis.StepAsrPostprocess"), "content uses the shared browser global postprocess API");
assert(contentSource.includes("data-stepasr-postprocess-toggle"), "content widget renders a compact postprocess view toggle");
assert(contentSource.includes('data-stepasr-view="original"'), "content widget exposes original view");
assert(contentSource.includes('data-stepasr-view="processed"'), "content widget exposes processed view");
assert(contentSource.includes("function getCurrentResultDisplayText()"), "content computes display text without overwriting raw result text");
assert(contentSource.includes('state.resultKind !== "transcript"'), "content skips postprocessing diagnostics");
assert(contentSource.includes("postprocessApi.processTranscriptText"), "content applies postprocess rules to transcript display text");
assert(contentSource.includes("function getCurrentTextVersionLabel()"), "content labels copy feedback by current text version");
assert(contentSource.includes("chrome.storage.onChanged.addListener"), "content listens for postprocess preference changes");
assert(contentSource.includes("changes[POSTPROCESS_KEY]"), "content refreshes when shared postprocess preferences change");
assert(contentSource.includes("chrome.storage.local.set({ [POSTPROCESS_KEY]"), "content view toggle writes back to shared preferences");
assert(contentSource.includes("writeClipboardText(copyText)"), "content copy uses the current displayed text");
assert(contentCssSource.includes(".stepasr-postprocess-toggle"), "content CSS styles the compact postprocess toggle");
assert(contentCssSource.includes(".stepasr-view-button.is-active"), "content CSS styles active original/processed view");

console.log("Content postprocess tests passed.");
