importScripts("platform-adapter-core.js", "douyin-extension-boot.js", "douyin-detector.js", "douyin-transcription-core.js", "stepaudio-client.js", "sync-core.js");

const DEFAULT_SETTINGS = {
  endpoint: "https://api.stepfun.com/step_plan/v1/audio/asr/sse",
  model: "stepaudio-2.5-asr",
  apiKey: "",
  language: "zh",
  enableItn: true,
  hotwords: "",
  prompt: "",
  convertToPcm: "auto"
};

const HISTORY_KEY = "stepasr_history";
const SETTINGS_KEY = "stepasr_settings";
const DETECTION_KEY = "stepasr_last_detection";
const API_TEST_KEY = "stepasr_last_api_test";
const ENDPOINT_MIGRATIONS = new Map([
  ["https://api.stepfun.ai/step_plan/v1/audio/asr/sse", DEFAULT_SETTINGS.endpoint]
]);
const MAX_HISTORY_ITEMS = 80;
const SIDE_PANEL_OPEN_PREFIX = "无法打开侧边栏";
const LARGE_REMOTE_MEDIA_BYTES = 32 * 1024 * 1024;
const MAX_STEPAUDIO_AUDIO_DATA_BYTES = 10 * 1024 * 1024;
const activeTranscriptions = new Map();

chrome.runtime.onInstalled.addListener(async details => {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get(SETTINGS_KEY);
  if (!stored) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }

  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {
    // Some Chromium-based browsers expose sidePanel partially during startup.
  }

  injectContentIntoOpenSupportedTabs().catch(() => {});

  if (details.reason === "install") {
    openSidePanel().catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  injectContentIntoOpenSupportedTabs().catch(() => {});
});

chrome.action?.onClicked?.addListener(tab => {
  openExtensionAction(tab?.id).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return false;

  if (message.type === "STEPASR_GET_SETTINGS") {
    getSettings().then(settings => sendResponse({ ok: true, settings }));
    return true;
  }

  if (message.type === "STEPASR_SAVE_SETTINGS") {
    saveSettings(message.payload)
      .then(settings => sendResponse({ ok: true, settings }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_GET_HISTORY") {
    getHistory().then(history => sendResponse({ ok: true, history }));
    return true;
  }

  if (message.type === "STEPASR_GET_LAST_DETECTION") {
    getLastDetection().then(detection => sendResponse({ ok: true, detection }));
    return true;
  }

  if (message.type === "STEPASR_GET_LAST_API_TEST") {
    getLastApiTest().then(apiTest => sendResponse({ ok: true, apiTest }));
    return true;
  }

  if (message.type === "STEPASR_CLEAR_HISTORY") {
    chrome.storage.local.set({ [HISTORY_KEY]: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "STEPASR_OPEN_PANEL") {
    const tabId = sender.tab?.id;
    const openPromise = openSidePanel(tabId);
    openPromise
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_TRANSCRIBE_MEDIA") {
    const requestId = String(message.payload?.requestId || "");
    const controller = new AbortController();
    if (requestId) activeTranscriptions.set(requestId, controller);
    transcribeMedia(message.payload, sender.tab, { signal: controller.signal })
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: controller.signal.aborted ? "转写已取消。" : normalizeError(error) }))
      .finally(() => {
        if (requestId) activeTranscriptions.delete(requestId);
      });
    return true;
  }

  if (message.type === "STEPASR_CANCEL_TRANSCRIPTION") {
    const requestId = String(message.payload?.requestId || "");
    const controller = activeTranscriptions.get(requestId);
    if (controller) {
      controller.abort();
      activeTranscriptions.delete(requestId);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "STEPASR_TRANSCRIBE_DOUYIN") {
    transcribeDouyin(message.payload, sender.tab)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_DOWNLOAD_MEDIA") {
    downloadMedia(message.payload, sender.tab)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_DOWNLOAD_DOUYIN_MEDIA") {
    downloadDouyinMedia(message.payload, sender.tab)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_DETECT_MEDIA") {
    detectMedia(message.payload, sender.tab)
      .then(context => sendResponse({ ok: true, context }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_DETECT_DOUYIN") {
    detectDouyinVideo(message.payload, sender.tab)
      .then(context => sendResponse({ ok: true, context }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_TEST_API") {
    testStepAudioApi(message.payload)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === "STEPASR_SYNC_FEISHU_RECORD") {
    syncFeishuRecord(message.payload)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  return false;
});

async function getSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = normalizeSettings(stored || {});
  if (stored && settings.endpoint !== stored.endpoint) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }
  return settings;
}

async function saveSettings(nextSettings = {}) {
  const endpoint = String(nextSettings.endpoint || DEFAULT_SETTINGS.endpoint).trim();
  validateEndpoint(endpoint);

  const settings = {
    ...DEFAULT_SETTINGS,
    ...nextSettings,
    endpoint,
    apiKey: StepAudioClient.normalizeApiKey(nextSettings.apiKey),
    model: String(nextSettings.model || DEFAULT_SETTINGS.model).trim(),
    language: String(nextSettings.language || DEFAULT_SETTINGS.language).trim() || "zh",
    hotwords: String(nextSettings.hotwords || "").trim(),
    prompt: String(nextSettings.prompt || "").trim(),
    convertToPcm: ["auto", "always", "never"].includes(nextSettings.convertToPcm) ? nextSettings.convertToPcm : "auto",
    enableItn: Boolean(nextSettings.enableItn)
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

function normalizeSettings(stored = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (ENDPOINT_MIGRATIONS.has(settings.endpoint)) {
    settings.endpoint = ENDPOINT_MIGRATIONS.get(settings.endpoint);
  }
  settings.apiKey = StepAudioClient.normalizeApiKey(settings.apiKey);
  return settings;
}

function buildSettings(input = {}) {
  const endpoint = String(input.endpoint || DEFAULT_SETTINGS.endpoint).trim();
  validateEndpoint(endpoint);
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    endpoint,
    apiKey: StepAudioClient.normalizeApiKey(input.apiKey),
    model: String(input.model || DEFAULT_SETTINGS.model).trim(),
    language: String(input.language || DEFAULT_SETTINGS.language).trim() || "zh",
    hotwords: String(input.hotwords || "").trim(),
    prompt: String(input.prompt || "").trim(),
    convertToPcm: ["auto", "always", "never"].includes(input.convertToPcm) ? input.convertToPcm : "auto",
    enableItn: Boolean(input.enableItn)
  };
}

function validateEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Endpoint 不是有效 URL。");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Endpoint 只支持 http 或 https。");
  }
}

function openSidePanel(tabId) {
  const validationError = getSidePanelOpenValidationError(tabId);
  if (validationError) return Promise.reject(new Error(validationError));

  let openResult;

  try {
    openResult = chrome.sidePanel.open({ tabId });
  } catch (error) {
    const detail = normalizeError(error);
    return Promise.reject(new Error(formatSidePanelOpenCallError(detail)));
  }

  return Promise.resolve(openResult).catch(error => {
    throw new Error(formatSidePanelOpenCallError(normalizeError(error)));
  });
}

function getSidePanelOpenValidationError(tabId) {
  if (!tabId) return `${SIDE_PANEL_OPEN_PREFIX}：没有拿到当前标签页。`;
  if (!chrome.sidePanel) return `${SIDE_PANEL_OPEN_PREFIX}：当前浏览器没有提供 chrome.sidePanel API。`;
  if (typeof chrome.sidePanel.open !== "function") {
    return `${SIDE_PANEL_OPEN_PREFIX}：当前浏览器不支持 chrome.sidePanel.open() 程序化打开侧边栏。`;
  }
  return "";
}

function formatSidePanelOpenCallError(detail) {
  const suffix = detail ? `：${detail}` : "。";
  return `${SIDE_PANEL_OPEN_PREFIX}：chrome.sidePanel.open() 调用失败${suffix}`;
}

function openExtensionAction(tabId) {
  return openSidePanel(tabId);
}

async function injectContentIntoOpenSupportedTabs() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) return;

  const tabs = await chrome.tabs.query({ url: DouyinExtensionBoot.SUPPORTED_TAB_URL_PATTERNS });
  const supportedTabs = tabs.filter(tab => tab.id && DouyinExtensionBoot.isSupportedPageUrl(tab.url || ""));

  await Promise.allSettled(supportedTabs.map(tab => injectContentIntoTab(tab.id, tab.url || "")));
}

async function injectContentIntoTab(tabId, tabUrl = "") {
  try {
    if (chrome.scripting.insertCSS) {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: DouyinExtensionBoot.CONTENT_CSS_FILES
      });
    }
  } catch {
    // CSS may already be injected or the tab may navigate during startup.
  }

  const mainWorldFiles = DouyinExtensionBoot.getMainWorldContentScriptFilesForUrl?.(tabUrl) || [];
  if (mainWorldFiles.length > 0) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        files: mainWorldFiles
      });
    } catch {
      // The manifest document_start hook handles normal Xiaohongshu loads.
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: DouyinExtensionBoot.getContentScriptFilesForUrl(tabUrl)
  });
}

async function transcribeMedia(payload = {}, tab, options = {}) {
  const platform = normalizePlatform(payload, tab);
  if (platform === "douyin") {
    return transcribeDouyin(toDouyinPayload(payload), tab, options);
  }
  if (platform === "xiaohongshu") {
    return transcribeXiaohongshu(payload, tab, options);
  }
  throw new Error("当前页面暂不支持转写。");
}

async function transcribeDouyin(payload, tab, options = {}) {
  const settings = await getSettings();
  if (payload?.awemeId) {
    await saveLastDetection(makeDetectionContextFromPayload(payload, tab, "content-script"), tab);
  }
  const transcriptionStatus = makeTranscriptionStatusSender(tab?.id);

  return DouyinTranscriptionCore.runTranscriptionWorkflow({
    payload: payload || {},
    tab,
    settings
  }, {
    getPageContext: async tabId => {
      const context = await getDouyinPageContext(tabId);
      await saveLastDetection(context, tab);
      return context;
    },
    getAwemeDetail: getDouyinAwemeDetail,
    getPageMedia: getDouyinPageMedia,
    fetchMediaFile,
    convertMediaToPcm: async (mediaFile, options) => {
      if (tab?.id) transcriptionStatus(tab.id, "正在准备/转换音频…");
      return convertMediaToPcm(mediaFile, options);
    },
    resolveAudioChunk: resolveConvertedAudioChunk,
    releaseAudioChunks: releaseConvertedAudioChunks,
    callStepAudioAsr: StepAudioClient.callStepAudioAsr,
    sendTranscriptionDelta,
    signal: options.signal,
    saveHistoryItem,
    sendStatus: transcriptionStatus,
    now: () => Date.now(),
    randomHex: () => Math.random().toString(16).slice(2)
  });
}

async function transcribeXiaohongshu(payload = {}, tab, options = {}) {
  const settings = await getSettings();
  const transcriptionStatus = makeTranscriptionStatusSender(tab?.id);
  const normalizedPayload = {
    ...payload,
    platform: "xiaohongshu",
    id: payload.id || payload.noteId || payload.mediaId || "",
    noteId: payload.noteId || payload.id || payload.mediaId || ""
  };

  await saveLastDetection(normalizedPayload, tab);

  return DouyinTranscriptionCore.runTranscriptionWorkflow({
    payload: normalizedPayload,
    tab,
    settings
  }, {
    getPageContext: async tabId => {
      const context = await getXiaohongshuPageContext(tabId);
      await saveLastDetection(context, tab);
      return context;
    },
    fetchMediaFile,
    convertMediaToPcm: async (mediaFile, options) => {
      if (tab?.id) transcriptionStatus(tab.id, "正在准备/转换音频…");
      return convertMediaToPcm(mediaFile, options);
    },
    resolveAudioChunk: resolveConvertedAudioChunk,
    releaseAudioChunks: releaseConvertedAudioChunks,
    callStepAudioAsr: StepAudioClient.callStepAudioAsr,
    sendTranscriptionDelta,
    signal: options.signal,
    saveHistoryItem,
    sendStatus: transcriptionStatus,
    now: () => Date.now(),
    randomHex: () => Math.random().toString(16).slice(2)
  });
}

function makeTranscriptionStatusSender(defaultTabId) {
  return (tabId, status) => {
    sendStatus(tabId || defaultTabId, normalizeTranscriptionStatus(status));
  };
}

function sendTranscriptionDelta(tabId, delta, text) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: "STEPASR_TRANSCRIPTION_DELTA",
    payload: {
      delta: String(delta || ""),
      text: String(text || "")
    }
  }).catch(() => {});
}

function normalizeTranscriptionStatus(status) {
  const text = String(status || "");
  if (!text) return "";
  if (text.includes("转写完成")) return "转写完成。";
  const chunkMatch = text.match(/正在调用 StepAudio ASR（(\d+)\/(\d+)）/);
  if (chunkMatch) return `正在调用 StepAudio 识别（${chunkMatch[1]}/${chunkMatch[2]}）…`;
  if (text.includes("正在调用 StepAudio")) return "正在调用 StepAudio 识别…";
  if (text.includes("正在准备 ASR") || text.includes("正在下载音频资源")) return "正在准备/转换音频…";
  if (
    text.includes("正在读取抖音视频详情") ||
    text.includes("正在识别当前视频 ID") ||
    text.includes("已识别视频 ID") ||
    text.includes("详情接口不可用")
  ) {
    return "正在提取音频地址…";
  }
  return text;
}

async function downloadMedia(payload = {}, tab) {
  const platform = normalizePlatform(payload, tab);
  if (platform === "douyin") {
    return downloadDouyinMedia(toDouyinPayload(payload), tab);
  }
  if (platform === "xiaohongshu") {
    return downloadXiaohongshuMedia(payload, tab);
  }
  throw new Error("当前页面暂不支持下载。");
}

async function downloadDouyinMedia(payload = {}, tab) {
  if (!tab?.id) throw new Error("没有拿到当前标签页。");
  const requestedKind = payload.mediaKind === "audio" ? "audio" : "video";
  const label = requestedKind === "audio" ? "音频" : "视频";

  sendStatus(tab.id, payload.awemeId ? `正在读取${label}地址...` : "正在识别当前视频 ID...");
  const context = payload.awemeId ? makeDetectionContextFromPayload(payload, tab, "content-script") : await getDouyinPageContext(tab.id);
  await saveLastDetection(context, tab);

  const awemeId = payload.awemeId || context.awemeId;
  if (!awemeId) {
    throw new Error("没有识别到当前视频 ID。请先点“检测视频 ID”，如果仍失败，复制诊断信息继续排查。");
  }

  sendStatus(tab.id, `已识别视频 ID：${awemeId}，正在解析${label}资源...`);
  const media = await resolveDouyinMedia(tab.id, awemeId, requestedKind);
  const filename = buildDownloadFilename({
    awemeId,
    media,
    title: payload.title || context.title || "",
    requestedKind
  });

  const downloadId = await chrome.downloads.download({
    url: media.url,
    filename,
    saveAs: true,
    conflictAction: "uniquify"
  });

  sendStatus(tab.id, `${label}下载已提交。`);
  return {
    downloadId,
    filename,
    mediaKind: media.kind,
    mediaSource: media.source || ""
  };
}

async function downloadXiaohongshuMedia(payload = {}, tab) {
  if (!tab?.id) throw new Error("没有拿到当前标签页。");
  const requestedKind = payload.mediaKind === "audio" ? "audio" : "video";
  const label = requestedKind === "audio" ? "音频" : "视频";

  sendStatus(tab.id, `正在解析小红书${label}地址...`);
  const context = await resolveXiaohongshuContext(payload, tab);
  await saveLastDetection(context, tab);
  if (context.errorCode === "no-video") {
    throw new Error(context.message || "当前笔记没有视频可转写。");
  }

  const media = DouyinTranscriptionCore.pickPageMedia(context.mediaCandidates || [], requestedKind);
  const filename = buildDownloadFilename({
    platform: "xiaohongshu",
    mediaId: context.id || context.noteId || payload.id || payload.noteId || "",
    media,
    title: payload.title || context.title || "",
    requestedKind
  });

  const downloadId = await chrome.downloads.download({
    url: media.url,
    filename,
    saveAs: true,
    conflictAction: "uniquify"
  });

  sendStatus(tab.id, `${label}下载已提交。`);
  return {
    downloadId,
    filename,
    mediaKind: media.kind,
    mediaSource: media.source || ""
  };
}

async function resolveDouyinMedia(tabId, awemeId, requestedKind = "auto") {
  let detailError = "";
  try {
    const detail = await getDouyinAwemeDetail(tabId, awemeId);
    return DouyinTranscriptionCore.pickMediaByKind(detail, requestedKind);
  } catch (error) {
    detailError = normalizeError(error);
  }

  return getDouyinPageMedia(tabId, detailError, requestedKind);
}

async function testStepAudioApi(payload = {}) {
  const settings = buildSettings(payload);

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
    const message = result.warning
      ? `API 已连通，但测试音频返回服务提示：${result.warning.slice(0, 120)}`
      : result.text
      ? `API 连通，测试音频返回：${result.text.slice(0, 80)}`
      : "API 连通。测试音频是静音，返回空文本是正常的。";
    await saveLastApiTest(buildApiTestRecord(settings, { ok: true, message, endpoint: result.endpoint }));
    return { message };
  } catch (error) {
    const errorMessage = normalizeError(error);
    await saveLastApiTest(buildApiTestRecord(settings, {
      ok: false,
      error: errorMessage,
      endpoint: error?.endpoint
    }));
    throw error;
  }
}

async function syncFeishuRecord(payload = {}) {
  const syncApi = getSyncCore();
  const settings = syncApi.normalizeFeishuSettings(payload.settings || payload.feishu || {});
  const missing = syncApi.getMissingFeishuConfigKeys(settings);
  if (missing.length) {
    throw new Error(`飞书同步缺配置：请在同步设置里填写 ${missing.join("、")}。`);
  }

  const record = syncApi.buildSyncRecordData(payload.record || {});
  const body = syncApi.buildFeishuFieldsPayload(record, settings.field_mapping);
  const token = await requestFeishuTenantAccessToken(settings);
  const result = await createFeishuBitableRecord(settings, token, body);
  const recordId = result?.record?.record_id || result?.record_id || "";
  return {
    message: "飞书同步成功。",
    recordId
  };
}

function getSyncCore() {
  if (!globalThis.StepAsrSyncCore) throw new Error("同步模块未加载。");
  return globalThis.StepAsrSyncCore;
}

async function requestFeishuTenantAccessToken(settings) {
  let response;
  let json;
  try {
    response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        app_id: settings.app_id,
        app_secret: settings.app_secret
      })
    });
    json = await readJsonResponse(response);
  } catch (error) {
    throw new Error(`飞书网络错误：无法请求 tenant_access_token（${normalizeError(error)}）。`);
  }

  if (!response.ok || json?.code !== 0 || !json?.tenant_access_token) {
    throw new Error(formatFeishuTokenError(response, json));
  }

  return json.tenant_access_token;
}

async function createFeishuBitableRecord(settings, tenantAccessToken, body) {
  const appToken = encodeURIComponent(settings.app_token);
  const tableId = encodeURIComponent(settings.table_id);
  let response;
  let json;

  try {
    response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tenantAccessToken}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(body)
    });
    json = await readJsonResponse(response);
  } catch (error) {
    throw new Error(`飞书网络错误：无法写入多维表格记录（${normalizeError(error)}）。`);
  }

  if (!response.ok || json?.code !== 0) {
    throw new Error(formatFeishuRecordError(response, json));
  }

  return json?.data || {};
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      code: response.ok ? 0 : response.status,
      msg: text.slice(0, 240)
    };
  }
}

function formatFeishuTokenError(response, json = {}) {
  const code = json?.code ?? `HTTP ${response?.status || "unknown"}`;
  const msg = json?.msg || json?.message || response?.statusText || "无返回信息";
  return `飞书鉴权失败：app_id 或 app_secret 可能不正确（token 接口 code=${code}，msg=${msg}）。`;
}

function formatFeishuRecordError(response, json = {}) {
  const code = json?.code ?? `HTTP ${response?.status || "unknown"}`;
  const msg = json?.msg || json?.message || response?.statusText || "无返回信息";
  return `飞书记录写入失败：code=${code}，msg=${msg}。请检查 app_token、table_id 和字段名映射。`;
}

async function detectMedia(payload = {}, tab) {
  const platform = normalizePlatform(payload, tab);
  if (platform === "douyin") {
    return detectDouyinVideo(toDouyinPayload(payload), tab);
  }
  if (platform === "xiaohongshu") {
    const context = await resolveXiaohongshuContext(payload, tab);
    await saveLastDetection(context, tab);
    return context;
  }
  throw new Error("当前页面暂不支持检测。");
}

async function detectDouyinVideo(payload = {}, tab) {
  if (!tab?.id) throw new Error("没有拿到当前标签页。");

  let context;
  if (payload.awemeId) {
    context = makeDetectionContextFromPayload(payload, tab, "content-script");
    await saveLastDetection(context, tab);
    return context;
  }

  context = await getDouyinPageContext(tab.id);
  await saveLastDetection(context, tab);
  if (!context.awemeId) {
    return context;
  }
  return context;
}

function normalizePlatform(payload = {}, tab = {}) {
  const explicit = String(payload.platform || "").toLowerCase();
  if (explicit) return explicit;

  const url = payload.pageUrl || tab.url || "";
  if (DouyinExtensionBoot.isDouyinPageUrl(url)) return "douyin";
  if (DouyinExtensionBoot.isXiaohongshuPageUrl(url)) return "xiaohongshu";
  return "unknown";
}

function toDouyinPayload(payload = {}) {
  return {
    ...payload,
    awemeId: payload.awemeId || (payload.platform === "douyin" ? payload.id || payload.mediaId || "" : "")
  };
}

async function resolveXiaohongshuContext(payload = {}, tab = {}) {
  const hasUsablePayloadCandidates = Array.isArray(payload.mediaCandidates) && payload.mediaCandidates.length > 0;
  if (hasUsablePayloadCandidates || payload.errorCode === "no-video") {
    return {
      ...payload,
      platform: "xiaohongshu",
      id: payload.id || payload.noteId || payload.mediaId || "",
      noteId: payload.noteId || payload.id || payload.mediaId || "",
      pageUrl: payload.pageUrl || tab.url || ""
    };
  }

  if (!tab?.id) throw new Error("没有拿到当前标签页。");
  const context = await getXiaohongshuPageContext(tab.id);
  return {
    ...context,
    platform: "xiaohongshu",
    id: context.id || context.noteId || payload.id || payload.noteId || payload.mediaId || "",
    noteId: context.noteId || context.id || payload.noteId || payload.id || payload.mediaId || "",
    title: context.title || payload.title || "",
    pageUrl: context.pageUrl || payload.pageUrl || tab.url || ""
  };
}

function makeDetectionContextFromPayload(payload = {}, tab = {}, source = "content-script") {
  return {
    platform: "douyin",
    id: payload.awemeId || "",
    mediaId: payload.awemeId || "",
    awemeId: payload.awemeId || "",
    source,
    title: payload.title || "",
    pageUrl: payload.pageUrl || tab.url || "",
    diagnostics: {
      pageUrl: payload.pageUrl || tab.url || "",
      title: payload.title || "",
      videoCount: null,
      visibleVideoCount: null,
      linkCandidateCount: null,
      candidateCount: payload.awemeId ? 1 : 0,
      hasOgUrl: null,
      hasCanonical: null,
      topCandidates: payload.awemeId
        ? [
          {
            id: payload.awemeId,
            score: 100,
            source
          }
        ]
        : []
    }
  };
}

async function getDouyinPageContext(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["douyin-detector.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: extractDouyinContextInPage
  });

  const value = result?.result;
  if (!value?.ok) {
    throw new Error(value?.error || "读取当前页面视频 ID 失败。");
  }

  return value.context || {};
}

async function getXiaohongshuPageContext(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    files: ["platform-adapter-core.js", "xiaohongshu-adapter.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: extractXiaohongshuContextInPage
  });

  const value = result?.result;
  if (!value?.ok) {
    throw new Error(value?.error || "读取当前小红书页面失败。");
  }

  return value.context || {};
}

async function getDouyinAwemeDetail(tabId, awemeId) {
  if (!awemeId) throw new Error("没有识别到抖音视频 ID。");

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: fetchDouyinAwemeDetailInPage,
    args: [awemeId]
  });

  const value = result?.result;
  if (!value?.ok) {
    throw new Error(value?.error || "读取抖音视频详情失败。");
  }
  return value.detail;
}

async function getDouyinPageMedia(tabId, detailError, requestedKind = "auto") {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["douyin-transcription-core.js"]
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: extractDouyinMediaInPage,
    args: [requestedKind]
  });

  const value = result?.result;
  if (!value?.ok) {
    throw new Error(`详情接口失败：${detailError || "未知错误"}；页面媒体兜底也失败：${value?.error || "没有返回媒体地址"}`);
  }
  return value.media;
}

function buildDownloadFilename(input = {}) {
  const platform = input.platform || "douyin";
  const defaultId = platform === "xiaohongshu" ? "xiaohongshu-note" : "douyin-video";
  const mediaId = String(input.awemeId || input.mediaId || defaultId).replace(/[^\dA-Za-z_-]/g, "");
  const kind = input.requestedKind === "audio" ? "audio" : "video";
  const title = sanitizeFilename(input.title || (platform === "xiaohongshu" ? "xiaohongshu" : "douyin"));
  const ext = inferDownloadExtension(input.media?.url || "", input.media?.kind || kind);
  return `stepaudio/${title || platform}-${mediaId}-${kind}.${ext}`;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~[\]`^]+/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
}

function inferDownloadExtension(url, kind) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match && ["mp3", "m4a", "aac", "wav", "ogg", "mp4", "m4v", "mov", "webm"].includes(match[1])) {
      return match[1];
    }
  } catch {
    // Fall through to kind-based defaults.
  }

  return kind === "audio" ? "mp3" : "mp4";
}

async function fetchMediaFile(url) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`下载音频失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = parseContentLength(response.headers.get("content-length"));
  const guessedFormat = DouyinTranscriptionCore.guessAudioFormat(url, contentType);
  if (contentLength > LARGE_REMOTE_MEDIA_BYTES && (guessedFormat.type === "mp3" || guessedFormat.type === "unknown")) {
    await response.body?.cancel?.().catch(() => {});
    return {
      buffer: null,
      base64: "",
      contentType,
      url,
      guessedFormat,
      bytes: contentLength,
      remoteChunkable: guessedFormat.type === "mp3",
      remoteOnly: guessedFormat.type === "unknown"
    };
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error("下载到的音频为空。");

  return {
    buffer,
    base64: arrayBufferToBase64(buffer),
    contentType,
    url,
    guessedFormat,
    bytes: buffer.byteLength
  };
}

function parseContentLength(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function convertMediaToPcm(mediaFile, options = {}) {
  await ensureOffscreenDocument();
  const legacyBase64 = typeof mediaFile === "string" ? mediaFile : "";
  const normalized = legacyBase64
    ? { base64: legacyBase64, contentType: options.mimeType || "" }
    : (mediaFile || {});
  const base64DataBytes = String(normalized.base64 || "").replace(/\s/g, "").length;
  const payload = {
    mimeType: normalized.contentType || normalized.mimeType || "",
    chunkTargetDataBytes: options.chunkTargetDataBytes,
    maxAudioDataBytes: options.maxAudioDataBytes
  };

  if (normalized.url && (!normalized.base64 || base64DataBytes > 32 * 1024 * 1024)) {
    payload.url = normalized.url;
  } else {
    payload.base64 = normalized.base64 || "";
  }

  return chrome.runtime.sendMessage({
    type: "STEPASR_CONVERT_TO_PCM",
    payload
  }).then(response => {
    if (!response?.ok) throw new Error(response?.error || "音频转码失败。");
    return response;
  });
}

async function resolveConvertedAudioChunk(chunk) {
  if (chunk?.url && Number.isFinite(chunk.rangeStart) && Number.isFinite(chunk.rangeEnd)) {
    return fetchRemoteAudioChunk(chunk);
  }
  if (!chunk?.sessionId) return chunk;
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    type: "STEPASR_GET_PCM_CHUNK",
    payload: {
      sessionId: chunk.sessionId,
      index: chunk.index
    }
  }).then(response => {
    if (!response?.ok) throw new Error(response?.error || "读取音频分片失败。");
    return response;
  });
}

async function fetchRemoteAudioChunk(chunk) {
  const response = await fetch(chunk.url, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Range": `bytes=${chunk.rangeStart}-${chunk.rangeEnd}`
    }
  });
  if (!response.ok) throw new Error(`读取远程音频分片失败：HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error("读取到的远程音频分片为空。");
  const data = arrayBufferToBase64(buffer);
  if (data.length > MAX_STEPAUDIO_AUDIO_DATA_BYTES) {
    throw new Error(`远程音频分片仍超过 StepAudio 10MB 请求限制（${data.length} bytes）。`);
  }
  return {
    data,
    format: chunk.format,
    index: chunk.index,
    total: chunk.total
  };
}

async function releaseConvertedAudioChunks(chunks = []) {
  const sessionIds = Array.from(new Set((chunks || []).map(chunk => chunk?.sessionId).filter(Boolean)));
  if (!sessionIds.length) return;
  await ensureOffscreenDocument();
  await Promise.allSettled(sessionIds.map(sessionId => chrome.runtime.sendMessage({
    type: "STEPASR_RELEASE_PCM_SESSION",
    payload: { sessionId }
  })));
}

async function ensureOffscreenDocument() {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Decode Douyin media into 16k PCM audio for StepAudio ASR."
  });
}

function fetchDouyinAwemeDetailInPage(awemeId) {
  const url = new URL("/aweme/v1/web/aweme/detail/", location.origin);
  url.searchParams.set("aweme_id", awemeId);
  url.searchParams.set("aid", "6383");
  url.searchParams.set("device_platform", "webapp");
  url.searchParams.set("version_name", "23.5.0");
  url.searchParams.set("os_name", "mac");

  return fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json, text/plain, */*"
    }
  })
    .then(async response => {
      const json = await response.json();
      if (!response.ok) {
        return { ok: false, error: json?.status_msg || `HTTP ${response.status}` };
      }
      const detail = json.aweme_detail || json.aweme || json.data?.aweme_detail || json.data || json;
      return { ok: true, detail };
    })
    .catch(error => ({ ok: false, error: error.message || String(error) }));
}

function extractDouyinMediaInPage(requestedKind = "auto") {
  try {
    const core = globalThis.DouyinTranscriptionCore;
    if (!core?.collectMediaCandidatesFromText || !core?.pickPageMedia) {
      return { ok: false, error: "页面媒体提取模块未加载。" };
    }

    const candidates = [];
    const addText = (text, score, source) => {
      candidates.push(...core.collectMediaCandidatesFromText(text, score, source));
    };
    const addUrl = (url, score, source) => {
      if (!url) return;
      candidates.push({
        url,
        kind: /audio|music|\.m(?:p3|4a)|\.aac|\.wav|\.ogg/i.test(url) ? "audio" : "video",
        score,
        source
      });
    };

    const videos = Array.from(document.querySelectorAll("video"));
    const activeVideo = getBestVisibleVideo(videos);
    if (activeVideo) {
      addUrl(activeVideo.currentSrc || activeVideo.src || "", 98, "active-video");
      for (const source of activeVideo.querySelectorAll?.("source") || []) {
        addUrl(source.src || "", 96, "active-video-source");
      }

      let container = activeVideo;
      for (let depth = 0; container && depth < 8; depth += 1) {
        if (container.innerHTML && container.innerHTML.length < 300000) {
          addText(container.innerHTML, 84 - depth, "active-video-dom");
        }
        container = container.parentElement;
      }
    }

    for (const video of videos) {
      addUrl(video.currentSrc || video.src || "", visibleAreaScore(video) > 0 ? 72 : 40, "video-element");
      for (const source of video.querySelectorAll?.("source") || []) {
        addUrl(source.src || "", visibleAreaScore(video) > 0 ? 70 : 38, "video-source");
      }
    }

    const scripts = Array.from(document.scripts)
      .map(script => script.textContent || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
    for (const text of scripts) {
      addText(text.slice(0, 900000), 64, "script");
    }

    try {
      const resources = performance.getEntriesByType("resource").map(entry => entry.name).join("\n");
      addText(resources, 42, "performance");
    } catch {
      // Performance API may be restricted.
    }

    const media = core.pickPageMedia(candidates, requestedKind);
    return {
      ok: true,
      media,
      diagnostics: {
        candidateCount: candidates.length,
        videoCount: videos.length
      }
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  function getBestVisibleVideo(videos) {
    let best = null;
    let bestScore = 0;
    for (const video of videos) {
      const score = visibleAreaScore(video) + ((video.currentTime || 0) > 0 ? 1000 : 0) + (!video.paused ? 2000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best;
  }

  function visibleAreaScore(element) {
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return visibleWidth * visibleHeight;
  }
}

function extractXiaohongshuContextInPage() {
  try {
    if (!globalThis.XiaohongshuAdapter?.detectCurrentMedia) {
      return { ok: false, error: "小红书平台适配器未加载。" };
    }

    return {
      ok: true,
      context: globalThis.XiaohongshuAdapter.detectCurrentMedia()
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

function extractDouyinContextInPage() {
  try {
    const candidates = [];
    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title ||
      "";

    if (globalThis.DouyinDetector?.detectFromSources) {
      return {
        ok: true,
        context: globalThis.DouyinDetector.detectFromSources(buildDouyinDetectorSources(title))
      };
    }

    addCandidates(candidates, location.href, 100, "location");

    for (const selector of ['meta[property="og:url"]', 'link[rel="canonical"]']) {
      const element = document.querySelector(selector);
      addCandidates(candidates, element?.content || element?.href || "", 92, selector);
    }

    const videos = Array.from(document.querySelectorAll("video"));
    const activeVideo = getBestVisibleVideo(videos);
    if (activeVideo) {
      let container = activeVideo;
      for (let depth = 0; container && depth < 10; depth += 1) {
        const links = container.querySelectorAll?.('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]');
        for (const link of links || []) addCandidates(candidates, link.href || "", 88 - depth, "active-video-link");

        if (container.innerHTML && container.innerHTML.length < 300000) {
          addCandidates(candidates, container.innerHTML, 84 - depth, "active-video-dom");
        }
        container = container.parentElement;
      }
    }

    const visibleLinks = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]'))
      .map(link => ({ link, score: visibleAreaScore(link) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    for (const item of visibleLinks) {
      addCandidates(candidates, item.link.href || "", item.score > 0 ? 78 : 55, "visible-link");
    }

    const scripts = Array.from(document.scripts)
      .map(script => script.textContent || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
    for (const text of scripts) {
      addCandidates(candidates, text.slice(0, 900000), 64, "script");
    }

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        if (/douyin|aweme|video|modal|feed/i.test(`${key} ${value.slice(0, 80)}`)) {
          addCandidates(candidates, value.slice(0, 300000), 45, "localStorage");
        }
      }
    } catch {
      // Storage may be unavailable in some embedded contexts.
    }

    try {
      const resources = performance.getEntriesByType("resource").map(entry => entry.name).join("\n");
      addCandidates(candidates, resources, 40, "performance");
    } catch {
      // Performance API may be restricted.
    }

    const rankedCandidates = rankCandidates(candidates);
    const best = rankedCandidates[0] || null;
    const visibleVideoCount = videos.filter(video => visibleAreaScore(video) > 0).length;

    return {
      ok: true,
      context: {
        awemeId: best?.id || "",
        source: best?.source || "",
        title: title.replace(/\s+-\s+抖音.*$/u, "").trim(),
        pageUrl: location.href,
        diagnostics: {
          pageUrl: location.href,
          title: title.replace(/\s+-\s+抖音.*$/u, "").trim(),
          videoCount: videos.length,
          visibleVideoCount,
          linkCandidateCount: document.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]').length,
          candidateCount: candidates.length,
          topCandidates: rankedCandidates.slice(0, 12),
          hasOgUrl: Boolean(document.querySelector('meta[property="og:url"]')?.content),
          hasCanonical: Boolean(document.querySelector('link[rel="canonical"]')?.href)
        }
      }
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }

  function buildDouyinDetectorSources(pageTitle) {
    const videos = Array.from(document.querySelectorAll("video"));
    const activeVideo = getBestVisibleVideo(videos);
    const activeLinks = [];
    const activeTexts = [];

    if (activeVideo) {
      activeTexts.push(activeVideo.currentSrc || activeVideo.src || activeVideo.poster || "");
      let container = activeVideo;
      for (let depth = 0; container && depth < 10; depth += 1) {
        const links = container.querySelectorAll?.('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]');
        for (const link of links || []) activeLinks.push(link.href || "");

        if (container.innerHTML && container.innerHTML.length < 300000) {
          activeTexts.push(container.innerHTML);
        }
        container = container.parentElement;
      }
    }

    const visibleLinks = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]'))
      .map(link => ({ href: link.href || "", score: visibleAreaScore(link) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const scripts = Array.from(document.scripts)
      .map(script => script.textContent || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12)
      .map(text => text.slice(0, 900000));

    const storage = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        if (/douyin|aweme|video|modal|feed/i.test(`${key} ${value.slice(0, 80)}`)) {
          storage.push({ key, value: value.slice(0, 300000) });
        }
      }
    } catch {
      // Storage may be unavailable in some embedded contexts.
    }

    let resources = [];
    try {
      resources = performance.getEntriesByType("resource").map(entry => entry.name);
    } catch {
      // Performance API may be restricted.
    }

    const ogUrl = document.querySelector('meta[property="og:url"]')?.content || "";
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";

    return {
      pageUrl: location.href,
      title: pageTitle,
      canonicalUrls: [ogUrl, canonical],
      activeLinks,
      activeTexts,
      visibleLinks,
      scripts,
      storage,
      resources,
      videoCount: videos.length,
      visibleVideoCount: videos.filter(video => visibleAreaScore(video) > 0).length,
      linkCandidateCount: visibleLinks.length,
      hasOgUrl: Boolean(ogUrl),
      hasCanonical: Boolean(canonical)
    };
  }

  function getBestVisibleVideo(videos) {
    let best = null;
    let bestScore = 0;
    for (const video of videos) {
      const score = visibleAreaScore(video) + ((video.currentTime || 0) > 0 ? 1000 : 0) + (!video.paused ? 2000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best;
  }

  function visibleAreaScore(element) {
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return visibleWidth * visibleHeight;
  }

  function addCandidates(target, text, score, source) {
    if (!text) return;
    const patterns = [
      { re: /\/video\/(\d{8,25})/g, bonus: 8 },
      { re: /\/note\/(\d{8,25})/g, bonus: 6 },
      { re: /(?:modal_id|aweme_id|awemeId|item_id|itemId|group_id|groupId|video_id|videoId)["'=:%?&/\\\s]+(\d{8,25})/g, bonus: 5 },
      { re: /"(?:aweme_id|awemeId|item_id|itemId|group_id|groupId|video_id|videoId)"\s*:\s*"?(\d{8,25})"?/g, bonus: 4 }
    ];

    for (const { re, bonus } of patterns) {
      let match;
      while ((match = re.exec(text))) {
        target.push({ id: match[1], score: score + bonus, source });
      }
    }
  }

  function rankCandidates(items) {
    const byId = new Map();
    for (const item of items) {
      if (!/^\d{8,25}$/.test(item.id)) continue;
      const existing = byId.get(item.id);
      if (!existing || item.score > existing.score) {
        byId.set(item.id, {
          id: item.id,
          score: item.score,
          source: item.source,
          hits: (existing?.hits || 0) + 1
        });
      } else if (existing) {
        existing.hits += 1;
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.score - a.score || b.hits - a.hits);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function saveHistoryItem(item) {
  const record = normalizeHistoryItemForStorage(item);
  const history = await getHistory();
  history.unshift(record);
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, MAX_HISTORY_ITEMS) });
}

function normalizeHistoryItemForStorage(item = {}) {
  const record = item && typeof item === "object" ? item : { text: String(item || "") };
  return {
    ...record,
    platform: normalizeHistoryPlatform(record.platform) || inferHistoryPlatformFromPageUrl(record.pageUrl),
    cover: normalizeHistoryImageUrl(record.cover),
    author: String(record.author || "").trim()
  };
}

function normalizeHistoryPlatform(platform) {
  const value = String(platform || "").trim();
  const lower = value.toLowerCase();
  if (lower === "douyin" || lower === "xiaohongshu" || lower === "bilibili") return lower;
  return value;
}

function inferHistoryPlatformFromPageUrl(pageUrl) {
  const raw = String(pageUrl || "").trim();
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) return "xiaohongshu";
  } catch {
    const lower = raw.toLowerCase();
    if (lower.includes("douyin.com")) return "douyin";
    if (lower.includes("xiaohongshu.com")) return "xiaohongshu";
  }
  return "";
}

function normalizeHistoryImageUrl(raw) {
  const value = String(raw || "")
    .trim()
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u003[dD]/g, "=")
    .replace(/\\u003[aA]/g, ":")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  if (!value || /^(?:blob|data|filesystem):/i.test(value)) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

async function getHistory() {
  const { [HISTORY_KEY]: history } = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

async function saveLastDetection(context = {}, tab = {}) {
  const diagnostics = sanitizeDetectionDiagnostics(context.diagnostics || {});
  const title = String(context.title || context.diagnostics?.title || "");
  const platform = context.platform || diagnostics.platform || (context.awemeId ? "douyin" : "");
  const mediaId = context.id || context.mediaId || context.noteId || context.awemeId || "";
  const detection = {
    detectedAt: new Date().toISOString(),
    platform,
    mediaId,
    awemeId: context.awemeId || (platform === "douyin" ? mediaId : ""),
    noteId: context.noteId || (platform === "xiaohongshu" ? mediaId : ""),
    source: context.source || "",
    pageUrl: context.pageUrl || diagnostics.pageUrl || tab.url || "",
    titleLength: title.length,
    errorCode: context.errorCode || diagnostics.errorCode || "",
    message: String(context.message || diagnostics.message || "").slice(0, 160),
    diagnostics
  };
  await chrome.storage.local.set({ [DETECTION_KEY]: detection });
}

async function getLastDetection() {
  const { [DETECTION_KEY]: detection } = await chrome.storage.local.get(DETECTION_KEY);
  return detection && typeof detection === "object" ? detection : null;
}

async function saveLastApiTest(record) {
  await chrome.storage.local.set({ [API_TEST_KEY]: record });
}

async function getLastApiTest() {
  const { [API_TEST_KEY]: apiTest } = await chrome.storage.local.get(API_TEST_KEY);
  return apiTest && typeof apiTest === "object" ? apiTest : null;
}

function buildApiTestRecord(settings = {}, result = {}) {
  const key = String(settings.apiKey || "");
  return {
    testedAt: new Date().toISOString(),
    ok: Boolean(result.ok),
    endpoint: sanitizeEndpointForStorage(result.endpoint || settings.endpoint),
    model: String(settings.model || ""),
    language: String(settings.language || ""),
    convertToPcm: String(settings.convertToPcm || ""),
    apiKeyConfigured: Boolean(key.trim()),
    apiKeyLength: key.length,
    message: String(result.message || "").slice(0, 240),
    error: String(result.error || "").slice(0, 240)
  };
}

function sanitizeEndpointForStorage(endpoint) {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "invalid";
  }
}

function sanitizeDetectionDiagnostics(diagnostics = {}) {
  const topCandidates = Array.isArray(diagnostics.topCandidates) ? diagnostics.topCandidates : [];
  const candidateSources = Array.isArray(diagnostics.candidateSources) ? diagnostics.candidateSources : [];
  return {
    platform: diagnostics.platform || "",
    pageUrl: diagnostics.pageUrl || "",
    title: String(diagnostics.title || "").slice(0, 160),
    noteId: String(diagnostics.noteId || ""),
    videoCount: numberOrNull(diagnostics.videoCount),
    visibleVideoCount: numberOrNull(diagnostics.visibleVideoCount),
    videoElementCount: numberOrNull(diagnostics.videoElementCount),
    skippedBlobVideoCount: numberOrNull(diagnostics.skippedBlobVideoCount),
    linkCandidateCount: numberOrNull(diagnostics.linkCandidateCount),
    candidateCount: numberOrNull(diagnostics.candidateCount),
    hasOgUrl: booleanOrNull(diagnostics.hasOgUrl),
    hasCanonical: booleanOrNull(diagnostics.hasCanonical),
    hasInitialState: booleanOrNull(diagnostics.hasInitialState),
    initialStateSource: String(diagnostics.initialStateSource || ""),
    noteFound: booleanOrNull(diagnostics.noteFound),
    noteSearchSource: String(diagnostics.noteSearchSource || ""),
    hasVideoObject: booleanOrNull(diagnostics.hasVideoObject),
    errorCode: String(diagnostics.errorCode || ""),
    message: String(diagnostics.message || "").slice(0, 160),
    candidateSources: candidateSources.slice(0, 12).map(item => ({
      kind: String(item.kind || ""),
      score: numberOrNull(item.score),
      source: String(item.source || ""),
      host: String(item.host || "")
    })),
    topCandidates: topCandidates.slice(0, 12).map(item => ({
      id: String(item.id || ""),
      score: numberOrNull(item.score),
      hits: numberOrNull(item.hits),
      source: String(item.source || "")
    }))
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrNull(value) {
  if (value === true || value === false) return value;
  return null;
}

function sendStatus(tabId, status) {
  chrome.tabs.sendMessage(tabId, { type: "STEPASR_STATUS", payload: { status } }).catch(() => {});
  chrome.runtime.sendMessage({ type: "STEPASR_PANEL_STATUS", payload: { status } }).catch(() => {});
}

function normalizeError(error) {
  return error?.message || String(error || "未知错误");
}
