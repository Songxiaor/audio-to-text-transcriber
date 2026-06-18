#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const postprocessPath = resolve("douyin-stepasr-extension/postprocess.js");
const Postprocess = require(postprocessPath);

assert.equal(globalThis.StepAsrPostprocess, Postprocess, "postprocess API is exposed on globalThis for content scripts");

function stripStructuralWhitespace(value) {
  return String(value || "").replace(/\s+/g, "");
}

{
  const longText = [
    "第一步先确认素材来源和标题，避免后面整理的时候找不到上下文。",
    "第二步把转写结果放到记录区，不要覆盖原始转写文本。",
    "第三步检查句末标点是否已经能够表达自然停顿。",
    "第四步再把相邻短句聚合到同一个段落里。",
    "第五步如果段落已经太长，就在完整句子后面换段。",
    "第六步保留所有原始文字，只调整段落之间的空行。",
    "第七步复制和导出时要跟随当前查看版本。",
    "第八步最后再确认阅读起来不是每句话一段。"
  ].join("");
  const segmented = Postprocess.segmentTranscriptText(longText);
  const paragraphs = segmented.split(/\n{2,}/).filter(Boolean);

  assert(paragraphs.length >= 2, "long transcript is split into multiple paragraphs");
  assert(paragraphs.length < 8, "segmentation avoids one sentence per paragraph");
  assert.equal(
    stripStructuralWhitespace(segmented),
    stripStructuralWhitespace(longText),
    "segmentation preserves transcript content apart from structural whitespace"
  );
}

{
  const normalized = Postprocess.normalizeTranscriptPunctuation("今天, 我们  先看.. 这个方案!!! OK? \n\n 第二段 ; 继续: 收尾 .");

  assert(normalized.includes("今天，我们先看。这个方案！OK？"));
  assert(normalized.includes("第二段；继续：收尾。"));
  assert.equal(/ {2,}/.test(normalized), false, "extra spaces are removed");
  assert.equal(normalized.includes("!!!"), false, "duplicate punctuation is collapsed");
  assert.equal(normalized.includes(","), false, "English comma is normalized");
}

{
  const source = "呃，今天先看这个流程，那个，我们先保存。就是说，导出前要确认。然后呢，复制整理版。那个方案不要误删，嗯。";
  const cleaned = Postprocess.removeTranscriptFillers(source);

  assert.equal(cleaned.includes("呃"), false);
  assert.equal(cleaned.includes("嗯"), false);
  assert.equal(cleaned.includes("就是说"), false);
  assert.equal(cleaned.includes("然后呢"), false);
  assert.equal(cleaned.includes("那个，我们"), false);
  assert(cleaned.includes("那个方案不要误删"), "normal use of a filler-like word is preserved");
  assert(cleaned.includes("今天先看这个流程"));
  assert(cleaned.includes("导出前要确认"));
}

{
  const processed = Postprocess.processTranscriptText("嗯，今天, 先看第一句。第二句继续说明。第三句再补充重点。第四句收尾。", {
    segment: true,
    normalizePunctuation: true,
    removeFillers: true
  });

  assert.equal(processed.includes("嗯"), false);
  assert(processed.includes("今天，先看第一句。"));
  assert.equal(processed.includes(","), false);
}

console.log("Postprocess tests passed.");
