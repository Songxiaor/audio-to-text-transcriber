#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const require = createRequire(import.meta.url);
const StepAudioClient = require(resolve("douyin-stepasr-extension/stepaudio-client.js"));

const apiKey = StepAudioClient.normalizeApiKey(process.env.STEPFUN_API_KEY || await readHiddenSecret("StepFun API Key: "));
if (!apiKey) {
  console.error("StepFun API Key is required. Set STEPFUN_API_KEY or run this script in an interactive terminal.");
  process.exit(2);
}

const settings = {
  endpoint: process.env.STEPFUN_ENDPOINT || "https://api.stepfun.com/step_plan/v1/audio/asr/sse",
  apiKey,
  model: process.env.STEPFUN_MODEL || "stepaudio-2.5-asr",
  language: process.env.STEPFUN_LANGUAGE || "zh",
  hotwords: "",
  enableItn: true
};

const audio = {
  data: StepAudioClient.createSilentPcmBase64(350),
  format: {
    type: "pcm",
    codec: "pcm_s16le",
    rate: 16000,
    bits: 16,
    channel: 1
  }
};

try {
  const result = await StepAudioClient.callStepAudioAsr(audio, settings, { allowEmpty: true, probe: true });
  console.log(JSON.stringify({
    ok: true,
    configuredEndpoint: settings.endpoint,
    usedEndpoint: result.endpoint || settings.endpoint,
    model: settings.model,
    textLength: result.text.length,
    warning: result.warning || ""
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    configuredEndpoint: settings.endpoint,
    failedEndpoint: error?.endpoint || settings.endpoint,
    model: settings.model,
    error: error?.message || String(error)
  }, null, 2));
  process.exit(1);
}

async function readHiddenSecret(prompt) {
  if (!process.stdin.isTTY) return "";

  let restoreEcho = false;
  let rl;
  process.stderr.write(prompt);
  try {
    execFileSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
    restoreEcho = true;
    rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    return (await rl.question("")).trim();
  } finally {
    rl?.close();
    if (restoreEcho) {
      try {
        execFileSync("stty", ["echo"], { stdio: ["inherit", "ignore", "ignore"] });
      } catch {
        // Leave terminal recovery to the parent shell if stty is unavailable.
      }
    }
    process.stderr.write("\n");
  }
}
