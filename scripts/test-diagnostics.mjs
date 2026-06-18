#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const diagnosticsPath = resolve("douyin-stepasr-extension/diagnostics.js");
const Diagnostics = require(diagnosticsPath);

assert.equal(
  Diagnostics.safeEndpoint("https://api.stepfun.com/step_plan/v1/audio/asr/sse?token=secret#frag"),
  "https://api.stepfun.com/step_plan/v1/audio/asr/sse"
);
assert.equal(
  Diagnostics.safeDiagnosticText("Authorization: Bearer fake-secret-token-12345678901234567890"),
  "Authorization: Bearer [redacted]"
);
assert.equal(
  Diagnostics.safePageUrl("https://www.douyin.com/video/7534444444444444444?modal_id=secret#frag"),
  "https://www.douyin.com/video/7534444444444444444"
);
assert.equal(Diagnostics.safeEndpoint("ftp://example.com/a"), "invalid");
assert.equal(Diagnostics.countListItems("阶跃星辰, StepAudio\n抖音"), 3);

const report = Diagnostics.buildDiagnosticsReport({
  generatedAt: "2026-05-29T15:30:00.000Z",
  manifest: {
    name: "StepAudio Douyin Transcriber",
    version: "0.1.20",
    manifest_version: 3
  },
  settings: {
    endpoint: "https://api.stepfun.com/step_plan/v1/audio/asr/sse?token=endpoint-secret",
    model: "stepaudio-2.5-asr",
    language: "zh",
    apiKey: "sk-should-never-leak",
    enableItn: true,
    convertToPcm: "auto",
    hotwords: "敏感热词, 品牌词",
    prompt: "敏感提示词"
  },
  permissions: {
    endpointPermission: true,
    stepFunComPermission: true,
    stepFunAiPermission: true,
    officialStepFunPermission: true,
    douyinHostPermission: false
  },
  lastApiTest: {
    testedAt: "2026-05-29T15:22:00.000Z",
    ok: false,
    endpoint: "https://api.stepfun.ai/step_plan/v1/audio/asr/sse?token=api-test-secret",
    model: "stepaudio-2.5-asr",
    language: "zh",
    convertToPcm: "auto",
    apiKeyConfigured: true,
    apiKeyLength: 64,
    message: "Authorization: Bearer fake-secret-token-12345678901234567890",
    error: "server returned fake-secret-token-abcdef12345678901234567890"
  },
  history: [
    {
      text: "这段转写正文不应该出现在诊断里",
      createdAt: "2026-05-29T15:20:00.000Z",
      awemeId: "7534444444444444444",
      mediaKind: "audio",
      format: { type: "mp3" }
    }
  ],
  lastDetection: {
    detectedAt: "2026-05-29T15:21:00.000Z",
    awemeId: "7535555555555555555",
    source: "active-video-dom",
    pageUrl: "https://www.douyin.com/video/7535555555555555555?secret=query",
    titleLength: 8,
    diagnostics: {
      pageUrl: "https://www.douyin.com/video/7535555555555555555?secret=query",
      videoCount: 2,
      visibleVideoCount: 1,
      linkCandidateCount: 3,
      candidateCount: 4,
      hasOgUrl: true,
      hasCanonical: false,
      topCandidates: [
        {
          id: "7535555555555555555",
          score: 92,
          hits: 2,
          source: "active-video-dom"
        }
      ]
    }
  },
  environment: {
    userAgent: "UnitTest/1.0",
    platform: "macOS",
    language: "zh-CN"
  }
});

assert(report.includes("extensionVersion: 0.1.20"));
assert(report.includes("apiKeyConfigured: true"));
assert(report.includes("hotwordCount: 2"));
assert(report.includes("promptConfigured: true"));
assert(report.includes("endpointPermission: granted"));
assert(report.includes("stepFunComPermission: granted"));
assert(report.includes("stepFunAiPermission: granted"));
assert(report.includes("douyinHostPermission: missing"));
assert(report.includes("apiTestOk: false"));
assert(report.includes("apiTestEndpoint: https://api.stepfun.ai/step_plan/v1/audio/asr/sse"));
assert(report.includes("apiTestKeyConfigured: true"));
assert(report.includes("apiTestKeyLength: 64"));
assert(report.includes("detectedAwemeId: 7535555555555555555"));
assert(report.includes("detectedPageUrl: https://www.douyin.com/video/7535555555555555555"));
assert(report.includes("detectedTitleLength: 8"));
assert(report.includes("detectedTopCandidates: 7535555555555555555:92:2:active-video-dom"));
assert(report.includes("historyCount: 1"));
assert(report.includes("latestAwemeId: 7534444444444444444"));

for (const forbidden of [
  "sk-should-never-leak",
	  "endpoint-secret",
	  "api-test-secret",
	  "fake-secret-token",
	  "敏感热词",
  "品牌词",
  "敏感提示词",
  "这段转写正文不应该出现在诊断里",
  "secret=query"
]) {
  assert.equal(report.includes(forbidden), false, `report leaked: ${forbidden}`);
}

console.log("Diagnostics tests passed.");
