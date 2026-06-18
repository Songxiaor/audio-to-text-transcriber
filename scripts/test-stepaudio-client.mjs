#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const clientPath = resolve("douyin-stepasr-extension/stepaudio-client.js");
const StepAudioClient = require(clientPath);

function sseResponse(text, init = {}) {
  return new Response(text, {
    status: init.status || 200,
    headers: {
      "Content-Type": "text/event-stream",
      ...(init.headers || {})
    }
  });
}

const settings = {
  endpoint: "https://api.stepfun.com/step_plan/v1/audio/asr/sse",
  apiKey: "sk-test-valid123",
  model: "stepaudio-2.5-asr",
  language: "zh",
  hotwords: "阶跃星辰, StepAudio\n抖音",
  prompt: "should not be sent",
  enableItn: true
};

const audio = {
  data: "AAAA",
  format: {
    type: "pcm",
    codec: "pcm_s16le",
    rate: 16000,
    bits: 16,
    channel: 1
  }
};

const body = StepAudioClient.buildAsrRequestBody(audio, settings);
assert.equal(body.audio.data, audio.data);
assert.deepEqual(body.audio.input.format, audio.format);
assert.equal(body.audio.input.transcription.model, "stepaudio-2.5-asr");
assert.equal(body.audio.input.transcription.language, "zh");
assert.equal(body.audio.input.transcription.enable_itn, true);
assert.equal(body.audio.input.transcription.enable_timestamp, false);
assert.deepEqual(body.audio.input.transcription.hotwords, ["阶跃星辰", "StepAudio", "抖音"]);
assert.equal(Object.hasOwn(body.audio.input.transcription, "prompt"), false);

assert.equal(StepAudioClient.normalizeApiKey("Bearer sk-test-123"), "sk-test-123");
assert.equal(StepAudioClient.normalizeApiKey("Authorization: Bearer sk-test-456"), "sk-test-456");
assert.equal(StepAudioClient.normalizeApiKey('"sk-test-789"'), "sk-test-789");
assert.equal(StepAudioClient.normalizeApiKey("plain-non-step-token"), "plain-non-step-token");
assert.equal(StepAudioClient.isOfficialStepFunEndpoint(settings.endpoint), true);
assert.equal(StepAudioClient.isOfficialStepFunEndpoint("https://api.stepfun.ai/step_plan/v1/audio/asr/sse"), true);

const silent = StepAudioClient.createSilentPcmBase64(350);
assert.equal(Buffer.from(silent, "base64").byteLength, 11200);

const parsed = await StepAudioClient.readSseResult(sseResponse([
  'data: {"type":"transcript.text.delta","delta":"你"}\n\n',
  'data: {"type":"transcript.text.delta","delta":"好"}\n\n',
  'data: {"type":"transcript.text.done","text":"你好"}'
].join("")));
assert.deepEqual(parsed, { text: "你好", error: "" });

const errorParsed = await StepAudioClient.readSseResult(sseResponse(
  'data: {"type":"error","message":"bad auth"}\n\n'
));
assert.deepEqual(errorParsed, { text: "", error: "bad auth" });

assert.match(
  StepAudioClient.normalizeApiError(401, '{"error":{"message":"Incorrect API key provided","type":"invalid_api_key"}}'),
  /服务端拒绝|鉴权/
);
assert.match(
  StepAudioClient.normalizeApiError(403, '{"error":{"message":"permission denied","type":"forbidden"}}'),
  /权限不足/
);
assert.match(
  StepAudioClient.normalizeApiError(429, '{"error":{"message":"quota exceeded","type":"rate_limit"}}'),
  /额度不足|限流/
);
assert.match(
  StepAudioClient.normalizeApiError(200, "audio data size 12582912 bytes exceeds maximum allowed size 10485760 bytes"),
  /超过 10MB 请求限制/
);
assert.match(
  StepAudioClient.normalizeApiError(400, '{"error":{"message":"bad format","type":"invalid_request_error"}}'),
  /请求参数/
);
assert.match(
  StepAudioClient.normalizeApiError(502, "bad gateway"),
  /服务暂时不可用/
);

let capturedRequest = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, request) => {
  capturedRequest = { url, request };
  return sseResponse('data: {"type":"transcript.text.done","text":"测试成功"}\n\n');
};

try {
  const success = await StepAudioClient.callStepAudioAsr(audio, settings);
  assert.equal(success.text, "测试成功");
  assert.equal(capturedRequest.url, settings.endpoint);
  assert.equal(capturedRequest.request.method, "POST");
  assert.equal(capturedRequest.request.headers.Authorization, "Bearer sk-test-valid123");
  assert.equal(capturedRequest.request.headers.Accept, "text/event-stream");
  const sentBody = JSON.parse(capturedRequest.request.body);
  assert.equal(sentBody.audio.input.transcription.model, "stepaudio-2.5-asr");
  assert.equal(Object.hasOwn(sentBody.audio.input.transcription, "prompt"), false);

  globalThis.fetch = async () => sseResponse('data: {"type":"error","message":"quota exceeded"}\n\n');
  await assert.rejects(
    () => StepAudioClient.callStepAudioAsr(audio, settings),
    /额度不足|限流/
  );

  await assert.rejects(
    () => StepAudioClient.callStepAudioAsr(audio, settings, { allowEmpty: true, probe: true }),
    /额度不足|限流/
  );

  globalThis.fetch = async () => sseResponse('data: {"type":"error","message":"no speech detected"}\n\n');
  const probe = await StepAudioClient.callStepAudioAsr(audio, settings, { allowEmpty: true, probe: true });
  assert.equal(probe.warning, "no speech detected");

  globalThis.fetch = async () => new Response('{"error":{"message":"Incorrect API key provided","type":"invalid_api_key"}}', { status: 401 });
  await assert.rejects(
    () => StepAudioClient.callStepAudioAsr(audio, settings),
    /服务端拒绝|鉴权/
  );

  const triedEndpoints = [];
  globalThis.fetch = async (url, request) => {
    triedEndpoints.push(url);
    capturedRequest = { url, request };
    if (url.includes("api.stepfun.ai")) {
      return new Response('{"error":{"message":"Incorrect API key provided","type":"invalid_api_key"}}', { status: 401 });
    }
    return sseResponse('data: {"type":"transcript.text.done","text":"镜像域名成功"}\n\n');
  };
  const mirrorResult = await StepAudioClient.callStepAudioAsr(audio, {
    ...settings,
    endpoint: "https://api.stepfun.ai/step_plan/v1/audio/asr/sse"
  });
  assert.equal(mirrorResult.text, "镜像域名成功");
  assert.deepEqual(triedEndpoints, [
    "https://api.stepfun.ai/step_plan/v1/audio/asr/sse",
    "https://api.stepfun.com/step_plan/v1/audio/asr/sse"
  ]);
  assert.equal(mirrorResult.endpoint, "https://api.stepfun.com/step_plan/v1/audio/asr/sse");

  globalThis.fetch = async (url, request) => {
    capturedRequest = { url, request };
    return sseResponse('data: {"type":"transcript.text.done","text":"测试成功"}\n\n');
  };
  const subscriptionKeyResult = await StepAudioClient.callStepAudioAsr(audio, { ...settings, apiKey: "subscription-token-without-sk-prefix" });
  assert.equal(subscriptionKeyResult.text, "测试成功");
  assert.equal(capturedRequest.request.headers.Authorization, "Bearer subscription-token-without-sk-prefix");

  await StepAudioClient.callStepAudioAsr(audio, { ...settings, apiKey: "Authorization: Bearer sk-normalized" });
  assert.equal(capturedRequest.request.headers.Authorization, "Bearer sk-normalized");

  let oversizedFetchCalled = false;
  globalThis.fetch = async () => {
    oversizedFetchCalled = true;
    return sseResponse('data: {"type":"transcript.text.done","text":"不应调用"}\n\n');
  };
  await assert.rejects(
    () => StepAudioClient.callStepAudioAsr({
      ...audio,
      data: "A".repeat((10 * 1024 * 1024) + 4)
    }, settings),
    /超过 StepAudio 10MB 请求限制/
  );
  assert.equal(oversizedFetchCalled, false);

  await assert.rejects(
    () => StepAudioClient.callStepAudioAsr({ ...audio, data: "" }, settings),
    /缺少 audio\.data/
  );
  assert.equal(oversizedFetchCalled, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("StepAudio client tests passed.");
