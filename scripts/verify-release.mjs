#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const extDir = join(root, "douyin-stepasr-extension");
const distDir = join(root, "dist");
const storeAssetsDir = join(root, "store-assets");
const signingKey = join(root, "signing-key", "stepaudio-douyin-transcriber.pem");
const artifactName = "audio-to-text-transcriber";
const mode = process.argv.includes("--dist") ? "dist" : "source";

const errors = [];
const checks = [];

function pass(message) {
  checks.push(message);
}

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
    return {};
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`${path} cannot be read: ${error.message}`);
    return "";
  }
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch (error) {
    fail(`${command} ${args.join(" ")} failed: ${(error.stderr || error.message || "").toString().trim()}`);
    return "";
  }
}

function pngSize(path) {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("not a png");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

const manifestPath = join(extDir, "manifest.json");
const rulesPath = join(extDir, "rules.json");
const manifest = readJson(manifestPath);
readJson(rulesPath);

assert(manifest.manifest_version === 3, "manifest_version is 3");
assert(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version || ""), `manifest version is valid: ${manifest.version}`);
assert(manifest.name === "Audio to Text Transcriber", "product name is generic and not platform/model named");
assert(!/douyin|stepaudio/i.test(manifest.name || ""), "product name does not include platform or model provider names");
assert(manifest.background?.service_worker === "background.js", "background service worker is background.js");
assert(manifest.side_panel?.default_path === "sidepanel.html", "side panel path is configured");
assert(!manifest.options_ui, "options page is not configured");
const douyinContentScript = (manifest.content_scripts || []).find(item =>
  (item.matches || []).some(match => match.includes("douyin.com"))
) || {};
const xiaohongshuContentScript = (manifest.content_scripts || []).find(item =>
  (item.matches || []).some(match => match.includes("xiaohongshu.com")) &&
  (item.js || []).includes("xiaohongshu-adapter.js")
) || {};
const xiaohongshuMainWorldContentScript = (manifest.content_scripts || []).find(item =>
  (item.matches || []).some(match => match.includes("xiaohongshu.com")) &&
  (item.js || []).includes("xiaohongshu-feed-hook.js")
) || {};
const contentScriptFiles = douyinContentScript.js || [];
assert(contentScriptFiles.indexOf("douyin-detector.js") > -1, "content script includes Douyin detector");
assert(contentScriptFiles.indexOf("douyin-detector.js") < contentScriptFiles.indexOf("content.js"), "Douyin detector loads before content script");
assert(contentScriptFiles.includes("platform-adapter-core.js") && contentScriptFiles.includes("douyin-adapter.js"), "Douyin content script includes platform adapter files");
assert((xiaohongshuContentScript.js || []).includes("xiaohongshu-adapter.js"), "Xiaohongshu content script includes platform adapter");
assert((xiaohongshuContentScript.matches || []).some(match => match.includes("xiaohongshu.com")), "Xiaohongshu content script match is present");
assert(xiaohongshuMainWorldContentScript.world === "MAIN", "Xiaohongshu feed hook runs in MAIN world");
assert(xiaohongshuMainWorldContentScript.run_at === "document_start", "Xiaohongshu feed hook runs at document_start");

const permissions = new Set(manifest.permissions || []);
for (const permission of ["storage", "scripting", "offscreen", "sidePanel", "clipboardRead", "clipboardWrite", "downloads"]) {
  assert(permissions.has(permission), `permission present: ${permission}`);
}
assert(!permissions.has("tabs"), "tabs permission is not requested");
assert(!permissions.has("permissions"), "unknown literal permissions permission is not requested");

const hosts = new Set(manifest.host_permissions || []);
assert(hosts.has("https://api.stepfun.com/*"), "StepFun Chinese Step Plan host permission is present");
assert(hosts.has("https://api.stepfun.ai/*"), "StepFun international Step Plan host permission is present");
assert(Array.from(hosts).some(host => host.includes("douyin.com")), "Douyin host permissions are present");
assert(Array.from(hosts).some(host => host.includes("xiaohongshu.com")), "Xiaohongshu host permissions are present");
assert(Array.from(hosts).some(host => host.includes("xhscdn.com")), "Xiaohongshu CDN host permissions are present");

const optionalHosts = new Set(manifest.optional_host_permissions || []);
assert(optionalHosts.has("http://127.0.0.1/*"), "local custom endpoint optional permission is present");
assert(optionalHosts.has("http://localhost/*"), "localhost custom endpoint optional permission is present");

for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
  const absolute = join(extDir, iconPath);
  assert(existsSync(absolute), `icon exists: ${iconPath}`);
  if (existsSync(absolute) && iconPath.endsWith(".png")) {
    try {
      const actual = pngSize(absolute);
      assert(actual.width === Number(size) && actual.height === Number(size), `icon ${iconPath} is ${size}x${size}`);
    } catch (error) {
      fail(`icon ${iconPath} cannot be checked: ${error.message}`);
    }
  }
}

for (const file of ["background.js", "content.js", "diagnostics.js", "douyin-adapter.js", "douyin-detector.js", "douyin-extension-boot.js", "douyin-transcription-core.js", "offscreen.js", "platform-adapter-core.js", "sidepanel.js", "stepaudio-client.js", "xiaohongshu-adapter.js", "xiaohongshu-feed-hook.js"]) {
  run("node", ["--check", join(extDir, file)]);
  pass(`syntax ok: ${file}`);
}

run("node", [join(root, "scripts", "test-diagnostics.mjs")], { cwd: root });
pass("Diagnostics unit tests pass");
run("node", [join(root, "scripts", "test-douyin-extension-boot.mjs")], { cwd: root });
pass("Douyin extension boot unit tests pass");
run("node", [join(root, "scripts", "test-douyin-detector.mjs")], { cwd: root });
pass("Douyin detector unit tests pass");
run("node", [join(root, "scripts", "test-douyin-transcription-core.mjs")], { cwd: root });
pass("Douyin transcription core unit tests pass");
run("node", [join(root, "scripts", "test-xiaohongshu-adapter.mjs")], { cwd: root });
pass("Xiaohongshu adapter unit tests pass");
run("node", [join(root, "scripts", "test-xiaohongshu-feed-hook.mjs")], { cwd: root });
pass("Xiaohongshu feed hook unit tests pass");
run("node", [join(root, "scripts", "test-stepaudio-client.mjs")], { cwd: root });
pass("StepAudio client unit tests pass");
run("node", [join(root, "scripts", "verify-ui-layout.mjs")], { cwd: root });
pass("UI layout checks pass");

const background = readText(join(extDir, "background.js"));
assert(background.includes("https://api.stepfun.com/step_plan/v1/audio/asr/sse"), "background uses Chinese Step Plan endpoint by default");
assert(background.includes("ENDPOINT_MIGRATIONS") && background.includes("api.stepfun.ai/step_plan"), "background migrates previous ai endpoint settings to com endpoint");
assert(background.includes("STEPASR_GET_LAST_API_TEST") && background.includes("stepasr_last_api_test"), "background stores latest API test diagnostics");
assert(background.includes("STEPASR_TEST_API"), "API connectivity test message is implemented");
assert(background.includes('importScripts("platform-adapter-core.js", "douyin-extension-boot.js", "douyin-detector.js", "douyin-transcription-core.js", "stepaudio-client.js", "sync-core.js")'), "background imports shared platform core, boot, detector, transcription core, StepAudio client, and sync core");
assert(background.includes("StepAudioClient.callStepAudioAsr"), "background uses tested StepAudio client");
assert(background.includes("DouyinTranscriptionCore.runTranscriptionWorkflow"), "background uses tested transcription workflow");
assert(background.includes("resolveConvertedAudioChunk") && background.includes("STEPASR_GET_PCM_CHUNK"), "background retrieves large PCM chunks from offscreen one at a time");
assert(background.includes("fetchRemoteAudioChunk") && background.includes('"Range"'), "background range-fetches large remote audio chunks");
assert(background.includes("STEPASR_DOWNLOAD_DOUYIN_MEDIA") && background.includes("chrome.downloads.download"), "background implements media downloads");
assert(background.includes("buildDownloadFilename") && background.includes("conflictAction"), "background creates safe media download filenames");
assert(background.includes("getDouyinPageMedia") && background.includes("extractDouyinMediaInPage"), "background has page media fallback when Douyin detail fails");
assert(background.includes("STEPASR_GET_LAST_DETECTION") && background.includes("stepasr_last_detection"), "background stores latest detection diagnostics");
assert(background.includes('details.reason === "install"'), "first install side panel attempt is install-only");
assert(background.includes("chrome.action?.onClicked") && background.includes("openExtensionAction"), "extension action click opens side panel entry point");
assert(!background.includes("chrome.tabs.create"), "background does not open extension pages as normal tabs");
assert(background.includes("injectContentIntoOpenSupportedTabs"), "background injects widget into already-open supported tabs");
assert(background.includes("chrome.runtime.onStartup.addListener"), "background retries supported tab injection on browser startup");
assert(background.includes('files: ["douyin-detector.js"]'), "background injects detector before page ID scan");
const boot = readText(join(extDir, "douyin-extension-boot.js"));
assert(boot.includes("CONTENT_SCRIPT_FILES") && boot.includes("isDouyinPageUrl") && boot.includes("isXiaohongshuPageUrl"), "Boot module defines injection files and platform URL filters");
const detector = readText(join(extDir, "douyin-detector.js"));
assert(detector.includes("modal_id") && detector.includes("safeDecode"), "Douyin detector handles modal IDs and encoded URLs");
const xiaohongshuAdapter = readText(join(extDir, "xiaohongshu-adapter.js"));
assert(xiaohongshuAdapter.includes("__INITIAL_STATE__") && xiaohongshuAdapter.includes("originVideoKey"), "Xiaohongshu adapter parses initial state and origin video keys");
const xiaohongshuFeedHook = readText(join(extDir, "xiaohongshu-feed-hook.js"));
assert(xiaohongshuFeedHook.includes("postMessage") && xiaohongshuFeedHook.includes("XMLHttpRequest"), "Xiaohongshu feed hook captures page network note payloads");
const transcriptionCore = readText(join(extDir, "douyin-transcription-core.js"));
assert(transcriptionCore.includes("pickMedia") && transcriptionCore.includes("pickMediaByKind") && transcriptionCore.includes("prepareAudioForAsr"), "Douyin transcription core exposes media and ASR preparation helpers");
assert(transcriptionCore.includes("STEP_AUDIO_MAX_AUDIO_DATA_BYTES") && transcriptionCore.includes("transcribePreparedAudio"), "Douyin transcription core guards StepAudio data size limits and chunked ASR");
assert(transcriptionCore.includes("buildRemoteAudioChunks") && transcriptionCore.includes("remoteChunkable"), "Douyin transcription core supports remote large-audio chunk references");
assert(transcriptionCore.includes("collectMediaCandidatesFromText") && transcriptionCore.includes("pickPageMedia"), "Douyin transcription core exposes page media fallback helpers");
assert(transcriptionCore.includes("runTranscriptionWorkflow") && transcriptionCore.includes("runDirectMediaWorkflow") && transcriptionCore.includes("saveHistoryItem"), "Transcription core exposes testable workflow orchestration");
const stepAudioClient = readText(join(extDir, "stepaudio-client.js"));
assert(stepAudioClient.includes("enable_timestamp: false"), "ASR request uses official timestamp field");
assert(stepAudioClient.includes("normalizeApiError") && stepAudioClient.includes("invalid_api_key"), "StepAudio client classifies API errors");
assert(stepAudioClient.includes("STEP_AUDIO_MAX_AUDIO_DATA_BYTES") && stepAudioClient.includes("validateAudioDataSize"), "StepAudio client preflights StepAudio audio data size limit");
assert(stepAudioClient.includes("normalizeApiKey") && !stepAudioClient.includes("格式不像 StepFun"), "StepAudio client normalizes API keys without blocking subscription tokens");
assert(stepAudioClient.includes("STEP_PLAN_ASR_ENDPOINTS") && stepAudioClient.includes("shouldRetryWithMirrorEndpoint"), "StepAudio client retries official Step Plan mirror endpoints");
const offscreen = readText(join(extDir, "offscreen.js"));
assert(offscreen.includes("pcmSessions") && offscreen.includes("STEPASR_GET_PCM_CHUNK") && offscreen.includes("STEPASR_RELEASE_PCM_SESSION"), "offscreen stores converted PCM chunks and exposes chunk retrieval");
assert(background.includes("StepAudioClient.normalizeApiKey"), "background stores normalized API keys");
assert(!background.includes("prompt: settings.prompt"), "ASR request does not send unsupported prompt field");
assert(!stepAudioClient.includes("prompt: settings.prompt"), "StepAudio client does not send unsupported prompt field");

const sidepanel = readText(join(extDir, "sidepanel.html")) + readText(join(extDir, "sidepanel.js"));
assert(sidepanel.includes("测试 API") || sidepanel.includes("STEPASR_TEST_API"), "settings UI exposes API test");
assert(sidepanel.includes("首次使用") && sidepanel.includes("点击浮窗「转写」"), "settings UI documents first-use flow");
assert(sidepanel.includes("diagnostics.js") && sidepanel.includes("copyDiagnosticsReport"), "settings UI exposes sanitized diagnostics report");
assert(sidepanel.includes("STEPASR_GET_LAST_DETECTION"), "settings UI includes latest video detection diagnostics");
assert(sidepanel.includes("STEPASR_GET_LAST_API_TEST"), "settings UI includes latest API test diagnostics");
assert(sidepanel.includes("versionBadge") && sidepanel.includes("getManifest"), "settings UI displays installed extension version");
assert(sidepanel.includes("recordsTab") && sidepanel.includes("historySearch"), "side panel defaults to searchable transcription records");
assert(sidepanel.includes("STEPASR_GET_HISTORY") && sidepanel.includes("STEPASR_CLEAR_HISTORY"), "side panel reads and clears local history");
assert(sidepanel.includes("copyToClipboard") && sidepanel.includes("deleteHistoryItem") && sidepanel.includes("updateHistoryItem"), "history cards support copy, delete, and inline edit");
const diagnostics = readText(join(extDir, "diagnostics.js"));
assert(diagnostics.includes("apiKeyConfigured") && !diagnostics.includes("apiKey:"), "diagnostics reports API key status without serializing the key");
assert(diagnostics.includes("[lastDetection]") && diagnostics.includes("safePageUrl"), "diagnostics reports latest detection without URL query strings");
assert(diagnostics.includes("[lastApiTest]") && diagnostics.includes("safeDiagnosticText"), "diagnostics reports latest API test without secrets");
const content = readText(join(extDir, "content.js"));
assert(content.includes("data-stepasr-download-audio") && content.includes("data-stepasr-download-video"), "content widget exposes audio and video download actions");
assert(content.includes("data-stepasr-version") && content.includes("getManifest"), "content widget displays installed extension version");
assert(content.includes("stepasr-collapsed") && content.includes("data-stepasr-toggle"), "content widget starts as a compact collapsible trigger");

const buildScript = readText(join(root, "build-package.sh"));
assert(buildScript.includes("--pack-extension-key=\"$SIGNING_KEY\""), "build script reuses stable signing key");
assert(buildScript.includes("$NAME-latest.zip") && buildScript.includes("$NAME-latest.crx"), "build script creates stable latest artifacts");
assert(existsSync(signingKey), "stable signing key exists");
if (existsSync(signingKey)) {
  const keyMode = statSync(signingKey).mode & 0o777;
  assert(keyMode === 0o600, "stable signing key permission is 600");
  run("openssl", ["rsa", "-in", signingKey, "-check", "-noout"]);
  pass("stable signing key is valid RSA");
}

for (const file of ["README.md", "PUBLISHING.md", "PRIVACY.md", "USER_INSTALL.md"]) {
  const path = join(extDir, file);
  assert(existsSync(path), `${file} exists`);
}
assert(existsSync(join(root, "scripts", "live-test-stepaudio.mjs")), "live StepAudio smoke test script exists");
assert(existsSync(join(root, "scripts", "generate-store-assets.mjs")), "store asset generator script exists");
assert(existsSync(join(root, "scripts", "verify-ui-layout.mjs")), "UI layout verification script exists");

const readme = readText(join(extDir, "README.md"));
const publishing = readText(join(extDir, "PUBLISHING.md"));
const privacy = readText(join(extDir, "PRIVACY.md"));
const userInstall = readText(join(extDir, "USER_INSTALL.md"));
for (const [label, text] of [["README", readme], ["PUBLISHING", publishing], ["PRIVACY", privacy], ["USER_INSTALL", userInstall]]) {
  assert(text.includes("Audio to Text Transcriber"), `${label} uses generic product name`);
  assert(!text.includes("StepAudio Audio Transcriber") && !text.includes("StepAudio Douyin Transcriber"), `${label} does not use old model/platform product name`);
}
assert(readme.includes(`当前版本：${manifest.version}`), "README version matches manifest");
assert(userInstall.includes(`v${manifest.version}`), "USER_INSTALL version matches manifest");
assert(readme.includes(`dist/${artifactName}-<version>.zip`), "README documents generic artifact name");
assert(userInstall.includes(`dist/${artifactName}-latest.crx`), "USER_INSTALL documents generic latest CRX name");
assert(readme.includes("测试 API"), "README documents API test");
assert(readme.includes("signing-key/stepaudio-douyin-transcriber.pem"), "README documents stable signing key");
assert(publishing.includes("Signing Key"), "PUBLISHING documents signing key");
assert(publishing.includes("downloads") && publishing.includes("Privacy Tab Draft"), "PUBLISHING documents downloads permission and privacy tab fields");
assert(publishing.toLowerCase().includes("single purpose") && publishing.includes("Store Review Risk Checklist"), "PUBLISHING documents store review requirements");
assert(publishing.includes(`dist/${artifactName}-<version>.zip`), "PUBLISHING documents generic upload artifact name");
assert(publishing.includes("store-assets/screenshot-01-floating-panel.png") && publishing.includes("440x280"), "PUBLISHING documents store assets");
assert(privacy.includes("Test API"), "PRIVACY documents API test data flow");
assert(privacy.includes("Download audio") && privacy.includes("Authorization"), "PRIVACY documents download flow and API key transmission");
assert(privacy.includes("Feishu") && privacy.includes("app_secret") && privacy.includes("sync action"), "PRIVACY documents optional Feishu sync data flow");
assert(userInstall.includes("source cannot be verified") && userInstall.includes(`v${manifest.version}`), "USER_INSTALL documents local install warning and version check");
assert(readme.includes("https://api.stepfun.com/step_plan/v1/audio/asr/sse"), "README documents Chinese Step Plan endpoint");
assert(privacy.includes("https://api.stepfun.com/step_plan/v1/audio/asr/sse"), "PRIVACY documents Chinese Step Plan endpoint");

const storeAssets = [
  ["screenshot-01-floating-panel.png", 1280, 800],
  ["screenshot-02-settings-api-test.png", 1280, 800],
  ["screenshot-03-detection-diagnostics.png", 1280, 800],
  ["screenshot-04-downloads.png", 1280, 800],
  ["screenshot-05-history.png", 1280, 800],
  ["promo-small-440x280.png", 440, 280]
];
assert(existsSync(join(storeAssetsDir, "README.md")), "store assets README exists");
for (const [file, width, height] of storeAssets) {
  const path = join(storeAssetsDir, file);
  assert(existsSync(path), `store asset exists: ${file}`);
  if (existsSync(path)) {
    try {
      const actual = pngSize(path);
      assert(actual.width === width && actual.height === height, `store asset ${file} is ${width}x${height}`);
    } catch (error) {
      fail(`store asset ${file} cannot be checked: ${error.message}`);
    }
  }
}

if (mode === "dist") {
  const version = manifest.version;
  const zipPath = join(distDir, `${artifactName}-${version}.zip`);
  const crxPath = join(distDir, `${artifactName}-${version}.crx`);
  const pemPath = join(distDir, `${artifactName}-${version}.pem`);
  const latestZipPath = join(distDir, `${artifactName}-latest.zip`);
  const latestCrxPath = join(distDir, `${artifactName}-latest.crx`);
  const latestPemPath = join(distDir, `${artifactName}-latest.pem`);

  assert(existsSync(zipPath), `ZIP exists: ${zipPath}`);
  assert(existsSync(crxPath), `CRX exists: ${crxPath}`);
  assert(existsSync(pemPath), `version PEM exists: ${pemPath}`);
  assert(existsSync(latestZipPath), `latest ZIP exists: ${latestZipPath}`);
  assert(existsSync(latestCrxPath), `latest CRX exists: ${latestCrxPath}`);
  assert(existsSync(latestPemPath), `latest PEM exists: ${latestPemPath}`);

  if (existsSync(zipPath)) {
    run("unzip", ["-t", zipPath]);
    pass("ZIP integrity ok");
    const zipManifestText = run("unzip", ["-p", zipPath, "manifest.json"]);
    try {
      const zipManifest = JSON.parse(zipManifestText);
      assert(zipManifest.version === version, "ZIP manifest version matches source");
      assert(zipManifest.host_permissions?.includes("https://api.stepfun.com/*"), "ZIP contains StepFun Chinese Step Plan host permission");
      assert(zipManifest.host_permissions?.includes("https://api.stepfun.ai/*"), "ZIP contains StepFun international Step Plan host permission");
    } catch (error) {
      fail(`ZIP manifest cannot be parsed: ${error.message}`);
    }

    const zipList = run("unzip", ["-l", zipPath]);
    assert(!zipList.includes("signing-key/"), "ZIP does not include signing-key directory");
    assert(!zipList.includes(".pem"), "ZIP does not include PEM files");
    assert(!zipList.includes("_metadata/"), "ZIP does not include browser-generated _metadata");
    assert(!zipList.includes("PROGRESS.md"), "ZIP does not include internal progress notes");
    assert(!zipList.includes("PUBLISHING.md"), "ZIP does not include publishing operator notes");
    assert(zipList.includes("diagnostics.js"), "ZIP includes sanitized diagnostics module");
    assert(zipList.includes("stepaudio-client.js"), "ZIP includes shared StepAudio client");
    assert(zipList.includes("platform-adapter-core.js"), "ZIP includes platform adapter core");
    assert(zipList.includes("douyin-adapter.js"), "ZIP includes Douyin platform adapter");
    assert(zipList.includes("xiaohongshu-adapter.js"), "ZIP includes Xiaohongshu platform adapter");
    assert(zipList.includes("xiaohongshu-feed-hook.js"), "ZIP includes Xiaohongshu feed hook");
    assert(zipList.includes("douyin-extension-boot.js"), "ZIP includes shared Douyin extension boot module");
    assert(zipList.includes("douyin-detector.js"), "ZIP includes shared Douyin detector");
    assert(zipList.includes("douyin-transcription-core.js"), "ZIP includes shared Douyin transcription core");
  }

  if (existsSync(crxPath)) {
    const fileInfo = run("file", [crxPath]);
    assert(fileInfo.includes("Google Chrome extension"), "CRX file type is Chrome extension");
  }

  if (existsSync(pemPath) && existsSync(signingKey)) {
    const stableHash = run("shasum", ["-a", "256", signingKey]).split(/\s+/)[0];
    const distHash = run("shasum", ["-a", "256", pemPath]).split(/\s+/)[0];
    assert(stableHash === distHash, "dist PEM matches stable signing key");
    if (existsSync(latestPemPath)) {
      const latestHash = run("shasum", ["-a", "256", latestPemPath]).split(/\s+/)[0];
      assert(stableHash === latestHash, "latest PEM matches stable signing key");
    }
  }

  if (existsSync(zipPath) && existsSync(latestZipPath)) {
    const versionHash = run("shasum", ["-a", "256", zipPath]).split(/\s+/)[0];
    const latestHash = run("shasum", ["-a", "256", latestZipPath]).split(/\s+/)[0];
    assert(versionHash === latestHash, "latest ZIP matches versioned ZIP");
  }

  if (existsSync(crxPath) && existsSync(latestCrxPath)) {
    const versionHash = run("shasum", ["-a", "256", crxPath]).split(/\s+/)[0];
    const latestHash = run("shasum", ["-a", "256", latestCrxPath]).split(/\s+/)[0];
    assert(versionHash === latestHash, "latest CRX matches versioned CRX");
  }
}

for (const message of checks) {
  console.log(`ok - ${message}`);
}

if (errors.length) {
  console.error("\nRelease verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release verification passed (${mode}) for ${manifest.version}.`);
