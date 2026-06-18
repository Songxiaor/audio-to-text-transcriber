const HISTORY_KEY = "stepasr_history";
const SETTINGS_SECTIONS_KEY = "stepasr_settings_sections";
const POSTPROCESS_KEY = "stepasr_postprocess";
const SYNC_SETTINGS_KEY = "stepasr_sync";
const SETTINGS_SECTION_NAMES = ["setup", "api", "sync", "diagnostics"];
const HISTORY_PREVIEW_LIMIT = 120;
const FEEDBACK_DELAY_MS = 1500;
const STATUS_VISIBLE_DELAY_SHORT_MS = 5200;
const STATUS_VISIBLE_DELAY_MEDIUM_MS = 8000;
const STATUS_VISIBLE_DELAY_LONG_MS = 12000;
const BULK_EXPORT_SEPARATOR = "\n\n---\n\n";
const DEFAULT_POSTPROCESS_STATE = Object.freeze({
  viewMode: "processed",
  segment: true,
  normalizePunctuation: true,
  removeFillers: false
});

const fields = {
  endpoint: document.getElementById("endpoint"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  language: document.getElementById("language"),
  hotwords: document.getElementById("hotwords"),
  prompt: document.getElementById("prompt"),
  convertToPcm: document.getElementById("convertToPcm"),
  enableItn: document.getElementById("enableItn")
};

const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const historySearch = document.getElementById("historySearch");
const historyPlatformFilter = document.getElementById("historyPlatformFilter");
const historyTagFilter = document.getElementById("historyTagFilter");
const historySummary = document.getElementById("historySummary");
const bulkActions = document.getElementById("bulkActions");
const bulkSummary = document.getElementById("bulkSummary");
const toggleBulkModeButton = document.getElementById("toggleBulkMode");
const selectAllVisibleButton = document.getElementById("selectAllVisible");
const clearSelectionButton = document.getElementById("clearSelection");
const copySelectedTextButton = document.getElementById("copySelectedText");
const sendSelectedObsidianButton = document.getElementById("sendSelectedObsidian");
const syncSelectedFeishuButton = document.getElementById("syncSelectedFeishu");
const exportSelectedTxtButton = document.getElementById("exportSelectedTxt");
const exportSelectedMdButton = document.getElementById("exportSelectedMd");
const exportSelectedJsonButton = document.getElementById("exportSelectedJson");
const deleteSelectedButton = document.getElementById("deleteSelected");
const exportAllTxtButton = document.getElementById("exportAllTxt");
const exportAllMdButton = document.getElementById("exportAllMd");
const clearHistoryButton = document.getElementById("clearHistory");
const exportAllJsonButton = document.getElementById("exportAllJson");
const importHistoryMergeButton = document.getElementById("importHistoryMerge");
const importHistoryReplaceButton = document.getElementById("importHistoryReplace");
const importHistoryFile = document.getElementById("importHistoryFile");
const historyMoreMenuButton = document.getElementById("historyMoreMenuButton");
const historyMoreMenu = document.getElementById("historyMoreMenu");
const postprocessControls = {
  viewOriginal: document.getElementById("postprocessViewOriginal"),
  viewProcessed: document.getElementById("postprocessViewProcessed"),
  segment: document.getElementById("postprocessSegment"),
  normalizePunctuation: document.getElementById("postprocessNormalizePunctuation"),
  removeFillers: document.getElementById("postprocessRemoveFillers"),
  hint: document.getElementById("postprocessHint")
};
const postprocessPanel = document.getElementById("postprocessPanel");
const postprocessPanelToggle = document.getElementById("postprocessPanelToggle");
const syncFields = {
  obsidianVault: document.getElementById("syncObsidianVault"),
  obsidianFolder: document.getElementById("syncObsidianFolder"),
  feishuAppId: document.getElementById("syncFeishuAppId"),
  feishuAppSecret: document.getElementById("syncFeishuAppSecret"),
  feishuBitableUrl: document.getElementById("syncFeishuBitableUrl"),
  feishuFieldTitle: document.getElementById("syncFeishuFieldTitle"),
  feishuFieldText: document.getElementById("syncFeishuFieldText"),
  feishuFieldAuthor: document.getElementById("syncFeishuFieldAuthor"),
  feishuFieldPlatform: document.getElementById("syncFeishuFieldPlatform"),
  feishuFieldLink: document.getElementById("syncFeishuFieldLink"),
  feishuFieldVideoId: document.getElementById("syncFeishuFieldVideoId"),
  feishuFieldWordCount: document.getElementById("syncFeishuFieldWordCount")
};
const saveButton = document.getElementById("save");
const checkButton = document.getElementById("checkSettings");
const copyDiagnosticsButton = document.getElementById("copyDiagnostics");
const versionBadge = document.getElementById("versionBadge");
const settingsSectionControls = new Map(SETTINGS_SECTION_NAMES.map(name => [
  name,
  {
    section: document.querySelector(`[data-settings-section="${name}"]`),
    toggle: document.querySelector(`[data-settings-section-toggle="${name}"]`),
    body: document.querySelector(`[data-settings-section-body="${name}"]`)
  }
]).filter(([, controls]) => controls.section && controls.toggle && controls.body));
const postprocessApi = globalThis.StepAsrPostprocess || {
  processTranscriptText: value => String(value || "")
};
const onboardingEl = document.getElementById("onboarding");
const dismissOnboardingBtn = document.getElementById("dismissOnboarding");
const statsBarEl = document.getElementById("statsBar");
const statsMonthlyEl = document.getElementById("statsMonthly");
const statsTotalEl = document.getElementById("statsTotal");
const syncCore = globalThis.StepAsrSyncCore;

let historyItems = [];
let skipNextHistoryRender = false;
let multiSelectMode = false;
let pendingImportMode = "merge";
let settingsSectionState = { setup: false, api: false, sync: false, diagnostics: false };
let postprocessState = { ...DEFAULT_POSTPROCESS_STATE };
let syncSettings = syncCore.normalizeSyncSettings();
let statusTimer = 0;
const selectedHistoryIds = new Set();
let isPostprocessPanelOpen = false;
let activeHistoryItemMenuButton = null;
let activeHistoryItemMenu = null;

saveButton.addEventListener("click", saveSettings);
clearHistoryButton.addEventListener("click", () => runHistoryMenuAction(confirmClearHistory));
document.getElementById("pasteApiKey").addEventListener("click", pasteApiKey);
document.getElementById("toggleApiKey").addEventListener("click", toggleApiKeyVisibility);
checkButton.addEventListener("click", checkSettings);
copyDiagnosticsButton.addEventListener("click", copyDiagnosticsReport);
fields.apiKey.addEventListener("paste", handleApiKeyPaste);
historySearch.addEventListener("input", () => renderHistory());
historyPlatformFilter.addEventListener("change", () => renderHistory());
historyTagFilter.addEventListener("change", () => renderHistory());
toggleBulkModeButton.addEventListener("click", () => setMultiSelectMode(!multiSelectMode));
historyMoreMenuButton.addEventListener("click", event => {
  event.stopPropagation();
  toggleHistoryMenu();
});
historyMoreMenu.addEventListener("click", event => event.stopPropagation());
exportAllTxtButton.addEventListener("click", () => runHistoryMenuAction(() => exportAllHistory("txt")));
exportAllMdButton.addEventListener("click", () => runHistoryMenuAction(() => exportAllHistory("md")));
selectAllVisibleButton.addEventListener("click", selectAllVisibleHistory);
clearSelectionButton.addEventListener("click", clearSelectedHistory);
copySelectedTextButton.addEventListener("click", () => copySelectedHistoryText(copySelectedTextButton));
sendSelectedObsidianButton.addEventListener("click", () => sendSelectedHistoryToObsidian(sendSelectedObsidianButton));
syncSelectedFeishuButton.addEventListener("click", () => syncSelectedHistoryToFeishu(syncSelectedFeishuButton));
exportSelectedTxtButton.addEventListener("click", () => exportSelectedHistory("txt"));
exportSelectedMdButton.addEventListener("click", () => exportSelectedHistory("md"));
exportSelectedJsonButton.addEventListener("click", () => exportSelectedHistory("json"));
deleteSelectedButton.addEventListener("click", deleteSelectedHistory);
exportAllJsonButton.addEventListener("click", () => runHistoryMenuAction(exportAllHistoryJson));
importHistoryMergeButton.addEventListener("click", () => runHistoryMenuAction(() => requestHistoryImport("merge")));
importHistoryReplaceButton.addEventListener("click", () => runHistoryMenuAction(() => requestHistoryImport("replace")));
importHistoryFile.addEventListener("change", importHistoryFromFile);
postprocessControls.viewOriginal.addEventListener("click", () => setPostprocessViewMode("original"));
postprocessControls.viewProcessed.addEventListener("click", () => setPostprocessViewMode("processed"));
postprocessControls.segment.addEventListener("change", () => setPostprocessOption("segment", postprocessControls.segment.checked));
postprocessControls.normalizePunctuation.addEventListener("change", () => setPostprocessOption("normalizePunctuation", postprocessControls.normalizePunctuation.checked));
postprocessControls.removeFillers.addEventListener("change", () => setPostprocessOption("removeFillers", postprocessControls.removeFillers.checked));
postprocessPanelToggle.addEventListener("click", togglePostprocessPanel);
for (const [name, controls] of settingsSectionControls) {
  controls.toggle.addEventListener("click", () => toggleSettingsSection(name));
}
document.addEventListener("click", event => {
  const target = event.target;
  if (target instanceof Element && !target.closest(".history-menu-wrap") && !target.closest(".history-item-menu-wrap")) {
    closeHistoryMenu();
    closeHistoryItemMenu();
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeHistoryMenu();
    closeHistoryItemMenu();
    if (multiSelectMode) setMultiSelectMode(false);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
    copyFocusedHistoryCard(event);
  }
});

for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

applySettingsSectionState();
applyPostprocessState();
setPostprocessPanelExpanded(false);
renderVersionBadge();
loadSettings();
loadSyncSettings();
loadPostprocessPreferences();
loadHistory();

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === "STEPASR_PANEL_STATUS") {
    const status = message.payload?.status || "";
    setStatus(status);
    if (status.includes("转写完成")) loadHistory();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[SETTINGS_SECTIONS_KEY]) {
    const nextState = normalizeSettingsSectionState(changes[SETTINGS_SECTIONS_KEY].newValue);
    if (nextState) {
      settingsSectionState = { ...settingsSectionState, ...nextState };
      applySettingsSectionState();
    }
  }
  if (changes[POSTPROCESS_KEY]) {
    postprocessState = normalizePostprocessState(changes[POSTPROCESS_KEY].newValue);
    applyPostprocessState();
    renderHistory();
  }
  if (changes[SYNC_SETTINGS_KEY]) {
    syncSettings = syncCore.normalizeSyncSettings(changes[SYNC_SETTINGS_KEY].newValue);
    applySyncSettings();
  }
  if (!changes[HISTORY_KEY]) return;
  historyItems = normalizeHistory(changes[HISTORY_KEY].newValue);
  pruneSelectedHistoryIds();
  if (skipNextHistoryRender) {
    skipNextHistoryRender = false;
    return;
  }
  renderHistory();
});

function activateTab(name) {
  document.body.classList.toggle("has-settings-actions", name === "settings");

  for (const tab of document.querySelectorAll("[data-tab]")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  for (const view of document.querySelectorAll("[data-view]")) {
    const active = view.dataset.view === name;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  }
}

function toggleHistoryMenu() {
  if (historyMoreMenu.hidden) openHistoryMenu();
  else closeHistoryMenu();
}

function openHistoryMenu() {
  historyMoreMenu.hidden = false;
  historyMoreMenuButton.setAttribute("aria-expanded", "true");
}

function closeHistoryMenu() {
  historyMoreMenu.hidden = true;
  historyMoreMenuButton.setAttribute("aria-expanded", "false");
}

function toggleHistoryItemMenu(button, menu) {
  if (menu.hidden) {
    openHistoryItemMenu(button, menu);
    return;
  }
  closeHistoryItemMenu();
}

function openHistoryItemMenu(button, menu) {
  closeHistoryMenu();
  closeHistoryItemMenu();
  activeHistoryItemMenuButton = button;
  activeHistoryItemMenu = menu;
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function closeHistoryItemMenu() {
  if (!activeHistoryItemMenu) return;
  activeHistoryItemMenu.hidden = true;
  activeHistoryItemMenuButton?.setAttribute("aria-expanded", "false");
  activeHistoryItemMenu = null;
  activeHistoryItemMenuButton = null;
}

function togglePostprocessPanel() {
  setPostprocessPanelExpanded(!isPostprocessPanelOpen);
}

function setPostprocessPanelExpanded(expanded) {
  isPostprocessPanelOpen = Boolean(expanded);
  if (postprocessPanel) {
    postprocessPanel.hidden = !isPostprocessPanelOpen;
  }
  if (!postprocessPanelToggle) return;
  postprocessPanelToggle.setAttribute("aria-expanded", String(isPostprocessPanelOpen));
  postprocessPanelToggle.setAttribute("aria-pressed", String(isPostprocessPanelOpen));
  postprocessPanelToggle.setAttribute("aria-label", isPostprocessPanelOpen ? "收起后处理选项" : "展开后处理选项");
}

function runHistoryMenuAction(action) {
  closeHistoryMenu();
  action();
}

async function loadPostprocessPreferences() {
  let storedState = null;
  try {
    const stored = await chrome.storage.local.get(POSTPROCESS_KEY);
    storedState = stored?.[POSTPROCESS_KEY];
  } catch {
    storedState = null;
  }

  postprocessState = normalizePostprocessState(storedState);
  applyPostprocessState();
  renderHistory();
}

function normalizePostprocessState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_POSTPROCESS_STATE };
  }

  return {
    viewMode: value.viewMode === "original" ? "original" : "processed",
    segment: typeof value.segment === "boolean" ? value.segment : DEFAULT_POSTPROCESS_STATE.segment,
    normalizePunctuation: typeof value.normalizePunctuation === "boolean"
      ? value.normalizePunctuation
      : DEFAULT_POSTPROCESS_STATE.normalizePunctuation,
    removeFillers: typeof value.removeFillers === "boolean" ? value.removeFillers : DEFAULT_POSTPROCESS_STATE.removeFillers
  };
}

function applyPostprocessState() {
  postprocessControls.segment.checked = postprocessState.segment;
  postprocessControls.normalizePunctuation.checked = postprocessState.normalizePunctuation;
  postprocessControls.removeFillers.checked = postprocessState.removeFillers;
  postprocessControls.viewOriginal.classList.toggle("is-active", postprocessState.viewMode === "original");
  postprocessControls.viewProcessed.classList.toggle("is-active", postprocessState.viewMode === "processed");
  postprocessControls.viewOriginal.setAttribute("aria-pressed", String(postprocessState.viewMode === "original"));
  postprocessControls.viewProcessed.setAttribute("aria-pressed", String(postprocessState.viewMode === "processed"));
  postprocessControls.hint.textContent = getPostprocessHint();
}

function setPostprocessViewMode(viewMode) {
  if (!["original", "processed"].includes(viewMode) || postprocessState.viewMode === viewMode) return;
  postprocessState = { ...postprocessState, viewMode };
  applyPostprocessState();
  persistPostprocessPreferences();
  renderHistory();
}

function setPostprocessOption(key, checked) {
  if (!["segment", "normalizePunctuation", "removeFillers"].includes(key)) return;
  postprocessState = { ...postprocessState, [key]: Boolean(checked), viewMode: "processed" };
  applyPostprocessState();
  persistPostprocessPreferences();
  renderHistory();
}

async function persistPostprocessPreferences() {
  try {
    await chrome.storage.local.set({ [POSTPROCESS_KEY]: { ...postprocessState } });
  } catch (error) {
    setStatus(error?.message || "转写稿后处理偏好保存失败。");
  }
}

function getPostprocessHint() {
  const label = getCurrentTextVersionLabel();
  if (postprocessState.viewMode === "original") {
    return "当前复制 / TXT / MD 导出使用原文；JSON 备份始终保留原始记录。";
  }
  const rules = getEnabledPostprocessRuleLabels();
  const suffix = rules.length ? `已启用：${rules.join("、")}。` : "未启用处理规则。";
  return `当前复制 / TXT / MD 导出使用${label}；JSON 备份始终保留原始记录。${suffix}`;
}

function renderVersionBadge() {
  try {
    const manifest = chrome.runtime.getManifest();
    if (versionBadge && manifest?.version) {
      versionBadge.textContent = `v${manifest.version}`;
      versionBadge.hidden = false;
      return;
    }
  } catch {
    // Hide the badge if the runtime manifest is unavailable.
  }
  if (versionBadge) versionBadge.hidden = true;
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "STEPASR_GET_SETTINGS" });
  if (!response?.ok) {
    await initializeSettingsSections(false);
    return;
  }
  const settings = response.settings;
  fields.endpoint.value = settings.endpoint || "";
  fields.apiKey.value = settings.apiKey || "";
  fields.model.value = settings.model || "";
  fields.language.value = settings.language || "zh";
  fields.hotwords.value = settings.hotwords || "";
  fields.prompt.value = settings.prompt || "";
  fields.convertToPcm.value = settings.convertToPcm || "auto";
  fields.enableItn.checked = Boolean(settings.enableItn);
  await initializeSettingsSections(Boolean(fields.apiKey.value.trim()));
}

async function initializeSettingsSections(apiKeyConfigured) {
  const defaultState = getDefaultSettingsSectionState(apiKeyConfigured);
  let storedState = null;

  try {
    const stored = await chrome.storage.local.get(SETTINGS_SECTIONS_KEY);
    storedState = normalizeSettingsSectionState(stored?.[SETTINGS_SECTIONS_KEY]);
  } catch {
    storedState = null;
  }

  settingsSectionState = apiKeyConfigured && storedState ? { ...defaultState, ...storedState } : defaultState;
  applySettingsSectionState();
}

function getDefaultSettingsSectionState(apiKeyConfigured) {
  return {
    setup: !apiKeyConfigured,
    api: !apiKeyConfigured,
    sync: false,
    diagnostics: false
  };
}

function normalizeSettingsSectionState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = {};
  let hasState = false;
  for (const name of SETTINGS_SECTION_NAMES) {
    if (typeof value[name] !== "boolean") continue;
    state[name] = value[name];
    hasState = true;
  }
  return hasState ? state : null;
}

function applySettingsSectionState() {
  for (const [name, controls] of settingsSectionControls) {
    const expanded = Boolean(settingsSectionState[name]);
    controls.section.classList.toggle("is-open", expanded);
    controls.section.classList.toggle("is-collapsed", !expanded);
    controls.toggle.setAttribute("aria-expanded", String(expanded));
    controls.body.hidden = !expanded;
  }
}

function toggleSettingsSection(name) {
  settingsSectionState = {
    ...settingsSectionState,
    [name]: !settingsSectionState[name]
  };
  applySettingsSectionState();
  persistSettingsSectionState();
}

async function persistSettingsSectionState() {
  try {
    await chrome.storage.local.set({ [SETTINGS_SECTIONS_KEY]: { ...settingsSectionState } });
  } catch (error) {
    setStatus(error?.message || "设置分区状态保存失败。");
  }
}

async function saveSettings() {
  const payload = getSettingsPayload();
  let syncSaved = false;

  try {
    await saveSyncSettings();
    syncSaved = true;
    await ensureEndpointPermission(payload.endpoint);
    const response = await chrome.runtime.sendMessage({ type: "STEPASR_SAVE_SETTINGS", payload });
    if (response?.ok) {
      setStatus("设置已保存，同步设置也已保存。");
      flashButtonText(saveButton, "已保存 ✓");
    } else {
      const errorText = response?.error || "保存失败。";
      setStatus(syncSaved ? `同步设置已保存；StepAudio 设置保存失败：${errorText}` : errorText);
    }
  } catch (error) {
    const errorText = error?.message || "保存失败。";
    setStatus(syncSaved ? `同步设置已保存；StepAudio 设置保存失败：${errorText}` : errorText);
  }
}

async function loadSyncSettings() {
  try {
    const stored = await chrome.storage.local.get(SYNC_SETTINGS_KEY);
    syncSettings = syncCore.normalizeSyncSettings(stored?.[SYNC_SETTINGS_KEY]);
  } catch {
    syncSettings = syncCore.normalizeSyncSettings();
  }
  applySyncSettings();
}

async function saveSyncSettings() {
  syncSettings = syncCore.normalizeSyncSettings(getSyncSettingsPayload({ validateBitableUrl: true }));
  await chrome.storage.local.set({ [SYNC_SETTINGS_KEY]: syncSettings });
  return syncSettings;
}

function applySyncSettings() {
  const settings = syncCore.normalizeSyncSettings(syncSettings);
  syncFields.obsidianVault.value = settings.obsidian.vault;
  syncFields.obsidianFolder.value = settings.obsidian.folder;
  syncFields.feishuAppId.value = settings.feishu.app_id;
  syncFields.feishuAppSecret.value = settings.feishu.app_secret;
  syncFields.feishuBitableUrl.value = settings.feishu.bitable_url;
  syncFields.feishuFieldTitle.value = settings.feishu.field_mapping.title;
  syncFields.feishuFieldText.value = settings.feishu.field_mapping.text;
  syncFields.feishuFieldAuthor.value = settings.feishu.field_mapping.author;
  syncFields.feishuFieldPlatform.value = settings.feishu.field_mapping.platform;
  syncFields.feishuFieldLink.value = settings.feishu.field_mapping.link;
  syncFields.feishuFieldVideoId.value = settings.feishu.field_mapping.video_id;
  syncFields.feishuFieldWordCount.value = settings.feishu.field_mapping.word_count;
}

async function checkSettings() {
  const payload = getSettingsPayload();
  const originalText = checkButton.textContent;

  try {
    if (!payload.endpoint.trim()) throw new Error("Endpoint 不能为空。");
    if (!payload.apiKey.trim()) throw new Error("API Key 不能为空。");
    new URL(payload.endpoint);
    await ensureEndpointPermission(payload.endpoint);

    checkButton.disabled = true;
    checkButton.textContent = "测试中...";
    setStatus("正在测试 StepAudio API...");

    const response = await chrome.runtime.sendMessage({ type: "STEPASR_TEST_API", payload });
    setStatus(response?.ok ? response.message || "StepAudio API 连通。" : response?.error || "API 测试失败。");
  } catch (error) {
    setStatus(error?.message || "API 测试失败。");
  } finally {
    checkButton.disabled = false;
    checkButton.textContent = originalText;
  }
}

function getSettingsPayload() {
  return {
    endpoint: fields.endpoint.value,
    apiKey: fields.apiKey.value,
    model: fields.model.value,
    language: fields.language.value,
    hotwords: fields.hotwords.value,
    prompt: fields.prompt.value,
    convertToPcm: fields.convertToPcm.value,
    enableItn: fields.enableItn.checked
  };
}

function getSyncSettingsPayload(options = {}) {
  const feishuBitable = getFeishuBitablePayload(options);
  return {
    obsidian: {
      vault: syncFields.obsidianVault.value,
      folder: syncFields.obsidianFolder.value
    },
    feishu: {
      app_id: syncFields.feishuAppId.value,
      app_secret: syncFields.feishuAppSecret.value,
      bitable_url: feishuBitable.bitable_url,
      app_token: feishuBitable.app_token,
      table_id: feishuBitable.table_id,
      field_mapping: {
        title: syncFields.feishuFieldTitle.value,
        text: syncFields.feishuFieldText.value,
        author: syncFields.feishuFieldAuthor.value,
        platform: syncFields.feishuFieldPlatform.value,
        link: syncFields.feishuFieldLink.value,
        video_id: syncFields.feishuFieldVideoId.value,
        word_count: syncFields.feishuFieldWordCount.value
      }
    }
  };
}

function getFeishuBitablePayload(options = {}) {
  const existing = syncCore.normalizeSyncSettings(syncSettings).feishu;
  const rawInput = syncFields.feishuBitableUrl.value;
  const bitableUrl = String(rawInput || "").trim();
  if (!bitableUrl) {
    return {
      bitable_url: "",
      app_token: existing.app_token,
      table_id: existing.table_id
    };
  }

  const parsed = syncCore.parseBitableUrl(bitableUrl);
  if (!parsed.ok) {
    if (options.validateBitableUrl) throw new Error(parsed.message || syncCore.BITABLE_URL_ERROR_MESSAGE);
    return {
      bitable_url: bitableUrl,
      app_token: "",
      table_id: ""
    };
  }

  return {
    bitable_url: bitableUrl,
    app_token: parsed.appToken,
    table_id: parsed.tableId
  };
}

async function pasteApiKey() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      setStatus("剪贴板里没有可粘贴的文本。");
      return;
    }
    fields.apiKey.value = text.trim();
    fields.apiKey.dispatchEvent(new Event("input", { bubbles: true }));
    setStatus("API Key 已从剪贴板粘贴。");
  } catch {
    setStatus("浏览器拒绝读取剪贴板，请先点输入框后用 Cmd+V。");
  }
}

function toggleApiKeyVisibility() {
  const button = document.getElementById("toggleApiKey");
  const revealed = fields.apiKey.classList.toggle("is-revealed");
  button.textContent = revealed ? "隐藏" : "显示";
}

function handleApiKeyPaste(event) {
  const text = event.clipboardData?.getData("text");
  if (!text) return;
  event.preventDefault();
  insertText(fields.apiKey, text.trim());
  setStatus("API Key 已粘贴。");
}

function insertText(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const cursor = start + text.length;
  input.setSelectionRange(cursor, cursor);
}

async function ensureEndpointPermission(endpoint) {
  const origin = toOriginPattern(endpoint);
  let requestError = null;

  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (granted) return;
  } catch (error) {
    requestError = error;
  }

  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (hasPermission) return;

  if (requestError) {
    throw new Error(`请求 API 域名访问权限失败：${origin}（${requestError.message || "浏览器拒绝授权请求。"}）`);
  }
  throw new Error(`缺少 API 域名访问权限：${origin}`);
}

function toOriginPattern(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Endpoint 不是有效 URL。");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Endpoint 只支持 http 或 https。");
  }

  return `${url.protocol}//${url.host}/*`;
}

async function loadHistory() {
  const response = await chrome.runtime.sendMessage({ type: "STEPASR_GET_HISTORY" });
  historyItems = normalizeHistory(response?.history);
  renderHistory();
}

async function clearHistory() {
  await chrome.runtime.sendMessage({ type: "STEPASR_CLEAR_HISTORY" });
  historyItems = [];
  selectedHistoryIds.clear();
  renderHistory();
  setStatus("历史已清空。");
}

function confirmClearHistory() {
  if (!historyItems.length) {
    setStatus("暂无可清空的历史记录。");
    return;
  }
  const confirmed = window.confirm(`确认清空全部 ${historyItems.length} 条转写记录吗？此操作不可撤销。`);
  if (!confirmed) return;
  clearHistory();
}

async function deleteHistoryItem(id) {
  const next = historyItems.filter(item => item.id !== id);
  selectedHistoryIds.delete(id);
  await saveHistory(next);
  setStatus("记录已删除。");
}

async function updateHistoryItem(id, text, options = {}) {
  const updatedItem = await patchHistoryItem(id, { text: text.trim() }, options);
  setStatus("记录已保存。");
  return updatedItem;
}

async function updateHistoryTags(id, tags) {
  const updatedItem = await patchHistoryItem(id, { tags: normalizeTags(tags) });
  setStatus("标签已更新。");
  return updatedItem;
}

async function patchHistoryItem(id, patch, options = {}) {
  let updatedItem = null;
  const next = historyItems.map(item => {
    if (item.id !== id) return item;
    updatedItem = normalizeHistoryItem({
      ...item,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    return updatedItem;
  });
  if (!updatedItem) throw new Error("没有找到这条记录。");
  await saveHistory(next, options);
  return updatedItem;
}

async function saveHistory(next, options = {}) {
  historyItems = normalizeHistory(next);
  if (options.render === false) {
    skipNextHistoryRender = true;
  }
  await chrome.storage.local.set({ [HISTORY_KEY]: historyItems });
  if (options.render === false) {
    setTimeout(() => {
      skipNextHistoryRender = false;
    }, 200);
  }
  if (options.render !== false) renderHistory();
}

async function copyDiagnosticsReport() {
  const originalText = copyDiagnosticsButton.textContent;
  let shouldRestore = true;

  try {
    copyDiagnosticsButton.disabled = true;
    copyDiagnosticsButton.textContent = "生成中";

    const [{ settings }, { history }, { detection }, { apiTest }] = await Promise.all([
      chrome.runtime.sendMessage({ type: "STEPASR_GET_SETTINGS" }),
      chrome.runtime.sendMessage({ type: "STEPASR_GET_HISTORY" }),
      chrome.runtime.sendMessage({ type: "STEPASR_GET_LAST_DETECTION" }),
      chrome.runtime.sendMessage({ type: "STEPASR_GET_LAST_API_TEST" })
    ]);
    const permissions = await getDiagnosticPermissions(settings || {});
    const report = StepAsrDiagnostics.buildDiagnosticsReport({
      manifest: chrome.runtime.getManifest(),
      settings,
      history,
      lastDetection: detection,
      lastApiTest: apiTest,
      permissions,
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      }
    });

    await writeClipboardText(report);
    setStatus("诊断报告已复制。");
    shouldRestore = false;
    await flashButtonText(copyDiagnosticsButton, "已复制 ✓", originalText);
  } catch (error) {
    setStatus(formatClipboardWriteError(error));
  } finally {
    copyDiagnosticsButton.disabled = false;
    if (shouldRestore) copyDiagnosticsButton.textContent = originalText;
  }
}

async function getDiagnosticPermissions(settings) {
  const endpointOrigin = getOptionalOrigin(settings.endpoint);
  const [endpointPermission, stepFunComPermission, stepFunAiPermission, douyinHostPermission, xiaohongshuHostPermission, xiaohongshuCdnPermission] = await Promise.all([
    endpointOrigin ? chrome.permissions.contains({ origins: [endpointOrigin] }) : Promise.resolve(false),
    chrome.permissions.contains({ origins: ["https://api.stepfun.com/*"] }),
    chrome.permissions.contains({ origins: ["https://api.stepfun.ai/*"] }),
    chrome.permissions.contains({ origins: ["*://*.douyin.com/*"] }),
    chrome.permissions.contains({ origins: ["*://*.xiaohongshu.com/*"] }),
    chrome.permissions.contains({ origins: ["*://*.xhscdn.com/*"] })
  ]);

  return {
    endpointPermission,
    stepFunComPermission,
    stepFunAiPermission,
    officialStepFunPermission: stepFunComPermission || stepFunAiPermission,
    douyinHostPermission,
    xiaohongshuHostPermission,
    xiaohongshuCdnPermission
  };
}

function getOptionalOrigin(endpoint) {
  try {
    return toOriginPattern(endpoint);
  } catch {
    return "";
  }
}

function normalizeHistory(history) {
  return Array.isArray(history) ? history.filter(Boolean).map(normalizeHistoryItem) : [];
}

function normalizeHistoryItem(item, index = 0) {
  const record = item && typeof item === "object" ? item : { text: String(item || "") };
  const platform = normalizeHistoryPlatform(record.platform) || inferHistoryPlatformFromPageUrl(record.pageUrl);
  return {
    ...record,
    id: String(record.id || createSyntheticHistoryId(record, index)),
    platform,
    cover: normalizeHistoryCover(record.cover),
    author: String(record.author || "").trim(),
    tags: normalizeTags(record.tags)
  };
}

function renderHistory() {
  closeHistoryItemMenu();
  const term = historySearch.value.trim().toLowerCase();
  renderTagFilterOptions();
  const selectedPlatform = historyPlatformFilter.value;
  const selectedTag = historyTagFilter.value;
  const hasFilters = Boolean(term || selectedPlatform || selectedTag);
  const visible = historyItems.filter(item => (
    (!term || historyMatches(item, term)) &&
    (!selectedPlatform || item.platform === selectedPlatform) &&
    (!selectedTag || normalizeTags(item.tags).includes(selectedTag))
  ));
  pruneSelectedHistoryIds();

  historyEl.innerHTML = "";
  historyEl.classList.toggle("empty", visible.length === 0);
  historyEl.classList.toggle("is-selecting", multiSelectMode);
  const totalCharacters = historyItems.reduce((sum, item) => sum + countCharacters(item.text || ""), 0);
  historySummary.textContent = historyItems.length
    ? `共 ${formatCount(historyItems.length)} 条 · 约 ${formatCount(totalCharacters)} 字${hasFilters ? `，匹配 ${formatCount(visible.length)} 条` : ""}。`
    : "暂无记录。";
  updateBulkControls(visible);

  if (!visible.length) {
    historyEl.textContent = hasFilters ? "没有匹配的转写记录。" : "暂无历史。转写完成后会显示在这里。";
    return;
  }

  for (const item of visible) {
    historyEl.appendChild(createHistoryCard(item));
  }
}

function renderTagFilterOptions() {
  const currentValue = historyTagFilter.value;
  const tags = getAllTags();
  historyTagFilter.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "全部标签";
  historyTagFilter.appendChild(allOption);

  for (const tag of tags) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    historyTagFilter.appendChild(option);
  }

  historyTagFilter.value = tags.includes(currentValue) ? currentValue : "";
}

function createHistoryCover(item) {
  if (!item.cover) return null;
  const wrap = document.createElement("div");
  wrap.className = "history-cover-wrap";
  const img = document.createElement("img");
  img.className = "history-cover";
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => {
    wrap.hidden = true;
  }, { once: true });
  wrap.appendChild(img);
  return wrap;
}

function createHistoryCard(item) {
  const card = document.createElement("article");
  card.className = "history-item";
  card.tabIndex = 0;
  card.dataset.historyId = item.id;
  card.classList.toggle("is-selected", selectedHistoryIds.has(item.id));
  let fullText = getHistoryDisplayText(item);
  let shouldCollapseText = countCharacters(fullText) > HISTORY_PREVIEW_LIMIT;
  let textExpanded = false;

  const selectRow = document.createElement("label");
  selectRow.className = "history-select";
  selectRow.hidden = !multiSelectMode;
  const selectBox = document.createElement("input");
  selectBox.type = "checkbox";
  selectBox.checked = selectedHistoryIds.has(item.id);
  const selectText = document.createElement("span");
  selectText.textContent = "选择这条记录";
  selectRow.append(selectBox, selectText);

  const meta = document.createElement("div");
  meta.className = "history-meta";

  const title = document.createElement("div");
  title.className = "history-title";
  title.textContent = item.title || getPlatformDefaultTitle(item.platform);

  const time = document.createElement("time");
  time.dateTime = item.createdAt || "";
  time.textContent = formatTime(item.createdAt);
  meta.append(title, time);

  const sub = document.createElement("div");
  sub.className = "history-sub";
  sub.textContent = formatHistorySubline(item);

  // v0.3.0: Preview (first 2 lines)
  const preview = document.createElement("div");
  preview.className = "history-preview";
  const previewText = getHistoryDisplayText(item);
  preview.textContent = sliceCharacters(previewText, 160).trim() + (countCharacters(previewText) > 160 ? "…" : "");

  const header = document.createElement("div");
  header.className = "history-card-head";
  const headerMain = document.createElement("div");
  headerMain.className = "history-card-main";
  headerMain.append(meta, sub, preview);
  const cover = createHistoryCover(item);
  if (cover) {
    header.classList.add("has-cover");
    header.append(cover);
  }
  header.append(headerMain);

  const tags = document.createElement("div");
  tags.className = "history-tags";
  const addTagButton = makeButton("+ 标签", "ghost", "compact-button");
  const tagEditor = document.createElement("div");
  tagEditor.className = "tag-editor";
  tagEditor.hidden = true;
  const tagInput = document.createElement("input");
  tagInput.type = "text";
  tagInput.autocomplete = "off";
  tagInput.spellcheck = false;
  tagInput.placeholder = "添加标签";
  const addTag = makeButton("添加", "ghost");
  tagEditor.append(tagInput, addTag);

  const text = document.createElement("button");
  text.className = "history-text";
  text.type = "button";
  text.title = postprocessState.viewMode === "processed" ? "点击编辑原文；当前显示整理版" : "点击编辑文案";

  const textToggle = makeButton("展开", "ghost", "history-toggle");
  textToggle.hidden = !shouldCollapseText;

  const editor = document.createElement("div");
  editor.className = "history-editor";
  editor.hidden = true;
  const textarea = document.createElement("textarea");
  textarea.rows = 7;
  textarea.value = item.text || "";
  const editorActions = document.createElement("div");
  editorActions.className = "history-actions";
  const saveEdit = makeButton("保存", "primary");
  const cancelEdit = makeButton("取消", "secondary");
  editorActions.append(saveEdit, cancelEdit);
  editor.append(textarea, editorActions);

  const actions = document.createElement("div");
  actions.className = "history-actions";
  const copyText = makeButton("复制文案");
  const edit = makeButton("编辑");
  const moreMenuWrap = document.createElement("div");
  moreMenuWrap.className = "history-item-menu-wrap history-menu-wrap";
  const moreMenuButton = makeButton("更多 ▾", "secondary", "history-item-more");
  const moreMenuId = `historyItemMenu-${item.id}`;
  const moreMenu = document.createElement("div");
  moreMenu.className = "history-item-menu history-menu";
  moreMenu.id = moreMenuId;
  moreMenu.hidden = true;
  moreMenu.setAttribute("role", "menu");
  moreMenuButton.setAttribute("aria-expanded", "false");
  moreMenuButton.setAttribute("aria-controls", moreMenuId);
  moreMenuButton.setAttribute("aria-haspopup", "menu");

  const copyLink = makeMenuItem("复制链接");
  const openVideo = makeMenuItem("打开");
  const sendObsidian = makeMenuItem("发送到 Obsidian");
  const syncFeishu = makeMenuItem("同步到飞书");
  const exportTxt = makeMenuItem("导出 TXT");
  const exportMd = makeMenuItem("导出 MD");
  const remove = makeMenuItem("删除", "danger");
  const menuDivider = document.createElement("div");
  menuDivider.className = "history-menu-separator";
  actions.append(copyText, edit, moreMenuWrap);
  moreMenuWrap.append(moreMenuButton, moreMenu);
  moreMenu.append(openVideo, copyLink, sendObsidian, syncFeishu, exportTxt, exportMd, menuDivider, remove);
  renderTags();
  renderTextPreview();

  selectBox.addEventListener("change", () => {
    if (selectBox.checked) selectedHistoryIds.add(item.id);
    else selectedHistoryIds.delete(item.id);
    card.classList.toggle("is-selected", selectBox.checked);
    updateBulkControls(getVisibleHistoryItems());
  });
  text.addEventListener("click", () => openEditor());
  textToggle.addEventListener("click", () => {
    textExpanded = !textExpanded;
    renderTextPreview();
  });
  addTagButton.addEventListener("click", showTagEditor);
  addTag.addEventListener("click", addCardTag);
  tagInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCardTag();
  });
  edit.addEventListener("click", () => openEditor());
  cancelEdit.addEventListener("click", () => closeEditor());
  saveEdit.addEventListener("click", async () => {
    const originalText = saveEdit.textContent;
    try {
      saveEdit.disabled = true;
      const updatedItem = await updateHistoryItem(item.id, textarea.value, { render: false });
      if (updatedItem) Object.assign(item, updatedItem);
      setCardText(item.text || "");
      await flashButtonText(saveEdit, "已保存 ✓", originalText);
      closeEditor();
    } catch (error) {
      setStatus(error?.message || "保存失败。");
    } finally {
      saveEdit.disabled = false;
      saveEdit.textContent = originalText;
    }
  });
  copyText.addEventListener("click", () => copyToClipboard(getHistoryDisplayText(item), `${getCurrentTextVersionLabel()}文案已复制。`, copyText));
  moreMenu.addEventListener("click", event => event.stopPropagation());
  moreMenuButton.addEventListener("click", event => {
    event.stopPropagation();
    toggleHistoryItemMenu(moreMenuButton, moreMenu);
  });
  copyLink.addEventListener("click", () => {
    closeHistoryItemMenu();
    copyToClipboard(item.pageUrl || "", item.pageUrl ? "链接已复制。" : "这条记录没有来源链接。", copyLink);
  });
  sendObsidian.addEventListener("click", () => {
    closeHistoryItemMenu();
    sendHistoryItemToObsidian(item, sendObsidian);
  });
  syncFeishu.addEventListener("click", () => {
    closeHistoryItemMenu();
    syncHistoryItemToFeishu(item, syncFeishu);
  });
  exportTxt.addEventListener("click", () => {
    closeHistoryItemMenu();
    exportHistoryItem(item, "txt");
  });
  exportMd.addEventListener("click", () => {
    closeHistoryItemMenu();
    exportHistoryItem(item, "md");
  });
  openVideo.addEventListener("click", () => {
    closeHistoryItemMenu();
    openHistoryPageUrl(item.pageUrl);
  });
  remove.addEventListener("click", () => {
    closeHistoryItemMenu();
    deleteHistoryItem(item.id);
  });

  card.append(selectRow, header, tags, addTagButton, tagEditor, text, textToggle, editor, actions);
  return card;

  function makeMenuItem(label, variant = "") {
    const button = makeButton(label, variant, "history-menu-item");
    button.setAttribute("role", "menuitem");
    return button;
  }

  function showTagEditor() {
    addTagButton.hidden = true;
    tagEditor.hidden = false;
    tagInput.focus();
  }

  function hideTagEditor() {
    addTagButton.hidden = false;
    tagEditor.hidden = true;
  }

  async function addCardTag() {
    const tag = normalizeTag(tagInput.value);
    if (!tag) {
      setStatus("请输入标签。");
      return;
    }
    const currentTags = normalizeTags(item.tags);
    if (currentTags.includes(tag)) {
      setStatus("标签已存在。");
      tagInput.value = "";
      return;
    }
    tagInput.disabled = true;
    addTag.disabled = true;
    try {
      await updateHistoryTags(item.id, [...currentTags, tag]);
      tagInput.value = "";
      hideTagEditor();
    } catch (error) {
      setStatus(error?.message || "添加标签失败。");
    } finally {
      tagInput.disabled = false;
      addTag.disabled = false;
    }
  }

  function renderTags() {
    tags.textContent = "";
    const itemTags = normalizeTags(item.tags);
    tags.hidden = itemTags.length === 0;
    for (const tag of itemTags) {
      const chip = document.createElement("span");
      chip.className = "history-tag";
      const label = document.createElement("span");
      label.textContent = tag;
      const removeTag = makeButton("移除", "ghost", "tag-remove");
      removeTag.title = `移除标签：${tag}`;
      removeTag.addEventListener("click", async () => {
        try {
          removeTag.disabled = true;
          await updateHistoryTags(item.id, normalizeTags(item.tags).filter(value => value !== tag));
        } catch (error) {
          setStatus(error?.message || "移除标签失败。");
        } finally {
          removeTag.disabled = false;
        }
      });
      chip.append(label, removeTag);
      tags.appendChild(chip);
    }
  }

  function setCardText(nextText) {
    fullText = getHistoryDisplayText({ ...item, text: nextText });
    shouldCollapseText = countCharacters(fullText) > HISTORY_PREVIEW_LIMIT;
    if (!shouldCollapseText) textExpanded = false;
    textarea.value = String(nextText || "");
    sub.textContent = formatHistorySubline(item);
    renderTextPreview();
  }

  function renderTextPreview() {
    const collapsed = shouldCollapseText && !textExpanded;
    text.textContent = collapsed ? `${sliceCharacters(fullText, HISTORY_PREVIEW_LIMIT).trimEnd()}…` : fullText;
    text.classList.toggle("is-collapsed", collapsed);
    text.classList.toggle("is-expanded", shouldCollapseText && textExpanded);
    textToggle.hidden = !shouldCollapseText;
    textToggle.textContent = textExpanded ? "收起" : "展开";
  }

  function openEditor() {
    text.hidden = true;
    textToggle.hidden = true;
    actions.hidden = true;
    editor.hidden = false;
    textarea.focus();
  }

  function closeEditor() {
    textarea.value = item.text || "";
    editor.hidden = true;
    text.hidden = false;
    textToggle.hidden = !shouldCollapseText;
    actions.hidden = false;
    renderTextPreview();
  }
}

function setMultiSelectMode(enabled) {
  multiSelectMode = enabled;
  if (!multiSelectMode) selectedHistoryIds.clear();
  renderHistory();
}

function selectAllVisibleHistory() {
  for (const item of getVisibleHistoryItems()) {
    selectedHistoryIds.add(item.id);
  }
  renderHistory();
}

function clearSelectedHistory() {
  selectedHistoryIds.clear();
  renderHistory();
}

function updateBulkControls(visibleItems) {
  const selectedItems = getSelectedHistoryItems();
  const selectedCount = selectedItems.length;
  const visibleSelectedCount = visibleItems.filter(item => selectedHistoryIds.has(item.id)).length;

  bulkActions.hidden = !multiSelectMode;
  toggleBulkModeButton.textContent = multiSelectMode ? "退出多选" : "多选";
  toggleBulkModeButton.classList.toggle("is-active", multiSelectMode);
  bulkSummary.textContent = `已选择 ${selectedCount} 条${multiSelectMode && visibleItems.length ? `，当前筛选中 ${visibleSelectedCount} 条` : ""}。`;
  exportAllTxtButton.disabled = historyItems.length === 0;
  exportAllMdButton.disabled = historyItems.length === 0;
  exportAllJsonButton.disabled = historyItems.length === 0;

  selectAllVisibleButton.disabled = !multiSelectMode || visibleItems.length === 0;
  clearSelectionButton.disabled = !multiSelectMode || selectedCount === 0;
  copySelectedTextButton.disabled = !multiSelectMode || selectedCount === 0;
  sendSelectedObsidianButton.disabled = !multiSelectMode || selectedCount === 0;
  syncSelectedFeishuButton.disabled = !multiSelectMode || selectedCount === 0;
  exportSelectedTxtButton.disabled = !multiSelectMode || selectedCount === 0;
  exportSelectedMdButton.disabled = !multiSelectMode || selectedCount === 0;
  exportSelectedJsonButton.disabled = !multiSelectMode || selectedCount === 0;
  deleteSelectedButton.disabled = !multiSelectMode || selectedCount === 0;
}

function getVisibleHistoryItems() {
  const term = historySearch.value.trim().toLowerCase();
  const selectedPlatform = historyPlatformFilter.value;
  const selectedTag = historyTagFilter.value;
  return historyItems.filter(item => (
    (!term || historyMatches(item, term)) &&
    (!selectedPlatform || item.platform === selectedPlatform) &&
    (!selectedTag || normalizeTags(item.tags).includes(selectedTag))
  ));
}

function getSelectedHistoryItems() {
  return historyItems.filter(item => selectedHistoryIds.has(item.id));
}

function copyFocusedHistoryCard(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
  const card = target instanceof Element ? target.closest(".history-item") : document.activeElement?.closest?.(".history-item");
  if (!card?.dataset.historyId) return;
  const item = historyItems.find(record => record.id === card.dataset.historyId);
  if (!item) return;
  event.preventDefault();
  copyToClipboard(getHistoryDisplayText(item), `${getCurrentTextVersionLabel()}文案已复制。`);
}

function pruneSelectedHistoryIds() {
  const validIds = new Set(historyItems.map(item => item.id));
  for (const id of Array.from(selectedHistoryIds)) {
    if (!validIds.has(id)) selectedHistoryIds.delete(id);
  }
}

function getHistoryDisplayText(item) {
  const originalText = String(item?.text || "");
  if (postprocessState.viewMode !== "processed") return originalText;
  return postprocessApi.processTranscriptText(originalText, {
    segment: postprocessState.segment,
    normalizePunctuation: postprocessState.normalizePunctuation,
    removeFillers: postprocessState.removeFillers
  });
}

function getCurrentTextVersionLabel() {
  return postprocessState.viewMode === "processed" ? "整理版" : "原文";
}

function getEnabledPostprocessRuleLabels() {
  const labels = [];
  if (postprocessState.segment) labels.push("智能分段");
  if (postprocessState.normalizePunctuation) labels.push("标点规范化");
  if (postprocessState.removeFillers) labels.push("去口水词");
  return labels;
}

async function copySelectedHistoryText(button) {
  const selectedItems = getSelectedHistoryItems();
  if (!selectedItems.length) {
    setStatus("请先选择记录。");
    return;
  }
  await copyToClipboard(formatBulkTextExport(selectedItems), `选中${getCurrentTextVersionLabel()}文案已复制。`, button);
}

async function sendSelectedHistoryToObsidian(button) {
  const selectedItems = getSelectedHistoryItems();
  if (!selectedItems.length) {
    setStatus("请先选择记录。");
    return;
  }

  const obsidianSettings = getObsidianSyncSettingsOrPrompt();
  if (!obsidianSettings) return;

  const originalText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "发送中...";
    const records = selectedItems.map(buildCurrentSyncRecord);
    const title = `StepAudio 批量转写 ${formatFullTime(new Date().toISOString()) || makeTimestampForFilename()}`;
    const markdown = records.map(record => syncCore.buildObsidianMarkdown(record)).join(BULK_EXPORT_SEPARATOR);
    const url = syncCore.buildObsidianNewNoteUrl({
      title,
      text: records.map(record => record.text).join("\n\n"),
      wordCount: records.reduce((sum, record) => sum + record.wordCount, 0)
    }, obsidianSettings);
    await writeClipboardText(markdown);
    await openExternalProtocolUrl(url);
    setStatus(`已将 ${selectedItems.length} 条${getCurrentTextVersionLabel()}记录写入剪贴板，并尝试打开 Obsidian。`);
    await flashButtonText(button, "已发送 ✓", originalText);
  } catch (error) {
    setStatus(formatObsidianSyncError(error));
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function syncSelectedHistoryToFeishu(button) {
  const selectedItems = getSelectedHistoryItems();
  if (!selectedItems.length) {
    setStatus("请先选择记录。");
    return;
  }

  const feishuSettings = getFeishuSyncSettingsOrPrompt();
  if (!feishuSettings) return;

  const originalText = button.textContent;
  let successCount = 0;
  const failures = [];
  try {
    button.disabled = true;
    for (let index = 0; index < selectedItems.length; index += 1) {
      const item = selectedItems[index];
      setStatus(`正在同步飞书 ${index + 1}/${selectedItems.length}：${item.title || getPlatformDefaultTitle(item.platform)}`);
      const response = await sendFeishuSyncRecord(buildCurrentSyncRecord(item), feishuSettings);
      if (response?.ok) {
        successCount += 1;
      } else {
        failures.push({ item, error: response?.error || "同步失败。" });
      }
    }

    if (failures.length) {
      setStatus(`飞书同步完成：成功 ${successCount} 条，失败 ${failures.length} 条。首个错误：${failures[0].error}`);
    } else {
      setStatus(`飞书同步完成：成功 ${successCount} 条。`);
      await flashButtonText(button, "已同步 ✓", originalText);
    }
  } catch (error) {
    setStatus(`飞书同步中断：已成功 ${successCount} 条。${error?.message || "网络或浏览器消息失败。"}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function deleteSelectedHistory() {
  const selectedItems = getSelectedHistoryItems();
  if (!selectedItems.length) {
    setStatus("请先选择记录。");
    return;
  }
  const confirmed = window.confirm(`确认删除选中的 ${selectedItems.length} 条记录吗？`);
  if (!confirmed) return;
  const selectedIds = new Set(selectedItems.map(item => item.id));
  const next = historyItems.filter(item => !selectedIds.has(item.id));
  selectedHistoryIds.clear();
  await saveHistory(next);
  setStatus(`已删除 ${selectedItems.length} 条记录。`);
}

function exportSelectedHistory(format) {
  const selectedItems = getSelectedHistoryItems();
  if (!selectedItems.length) {
    setStatus("请先选择记录。");
    return;
  }
  exportHistoryItems(selectedItems, format, "stepasr-selected");
}

function exportAllHistoryJson() {
  exportAllHistory("json");
}

function exportAllHistory(format) {
  if (!historyItems.length) {
    setStatus("暂无可导出的历史记录。");
    return;
  }
  exportHistoryItems(historyItems, format, "stepasr-history");
}

function exportHistoryItem(item, format) {
  const prefix = makeHistoryItemFilenamePrefix(item);
  exportHistoryItems([item], format, prefix);
}

function exportHistoryItems(items, format, prefix) {
  const timestamp = makeTimestampForFilename();
  if (format === "json") {
    if (downloadTextFile(`${prefix}-${timestamp}.json`, JSON.stringify(items, null, 2), "application/json;charset=utf-8")) {
      setStatus(`已导出 ${items.length} 条 JSON（原始记录）。`);
    }
    return;
  }

  if (format === "md") {
    const content = items.map(formatHistoryItemMarkdown).join(BULK_EXPORT_SEPARATOR);
    if (downloadTextFile(`${prefix}-${timestamp}.md`, content, "text/markdown;charset=utf-8")) {
      setStatus(`已导出 ${items.length} 条 Markdown（${getCurrentTextVersionLabel()}）。`);
    }
    return;
  }

  const content = items.length === 1
    ? `${getHistoryDisplayText(items[0]).trim()}\n`
    : formatBulkTextExport(items);
  if (downloadTextFile(`${prefix}-${timestamp}.txt`, content, "text/plain;charset=utf-8")) {
    setStatus(`已导出 ${items.length} 条 TXT（${getCurrentTextVersionLabel()}）。`);
  }
}

async function sendHistoryItemToObsidian(item, button) {
  const obsidianSettings = getObsidianSyncSettingsOrPrompt();
  if (!obsidianSettings) return;

  const originalText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "发送中...";
    const record = buildCurrentSyncRecord(item);
    await writeClipboardText(syncCore.buildObsidianMarkdown(record));
    await openExternalProtocolUrl(syncCore.buildObsidianNewNoteUrl(record, obsidianSettings));
    setStatus(`已将${getCurrentTextVersionLabel()}文案写入剪贴板，并尝试打开 Obsidian。`);
    await flashButtonText(button, "已发送 ✓", originalText);
  } catch (error) {
    setStatus(formatObsidianSyncError(error));
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function syncHistoryItemToFeishu(item, button) {
  const feishuSettings = getFeishuSyncSettingsOrPrompt();
  if (!feishuSettings) return;

  const originalText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "同步中...";
    const response = await sendFeishuSyncRecord(buildCurrentSyncRecord(item), feishuSettings);
    if (response?.ok) {
      const suffix = response.recordId ? `（record_id: ${response.recordId}）` : "";
      setStatus(`飞书同步成功${suffix}。`);
      await flashButtonText(button, "已同步 ✓", originalText);
    } else {
      setStatus(response?.error || "飞书同步失败。");
    }
  } catch (error) {
    setStatus(`飞书同步失败：${error?.message || "浏览器消息失败。"}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function buildCurrentSyncRecord(item) {
  const text = getHistoryDisplayText(item).trim();
  return syncCore.buildSyncRecordData({
    title: item.title || getPlatformDefaultTitle(item.platform),
    text,
    author: item.author,
    platform: item.platform,
    link: item.pageUrl,
    videoId: item.mediaId || item.noteId || item.awemeId,
    wordCount: countCharacters(text)
  });
}

function getCurrentSyncSettings() {
  return syncCore.normalizeSyncSettings(getSyncSettingsPayload());
}

function getObsidianSyncSettingsOrPrompt() {
  const settings = getCurrentSyncSettings().obsidian;
  if (settings.vault) return settings;
  showSyncSettingsRequired("请先去设置里的「同步设置」填写 Obsidian vault 名称。");
  return null;
}

function getFeishuSyncSettingsOrPrompt() {
  const settings = getCurrentSyncSettings().feishu;
  const missing = syncCore.getMissingFeishuConfigKeys(settings);
  if (!missing.length) return settings;

  const bitableMissing = missing.includes("app_token") || missing.includes("table_id");
  const bitableInput = syncFields.feishuBitableUrl.value.trim();
  if (bitableMissing && bitableInput) {
    const parseResult = syncCore.parseBitableUrl(bitableInput);
    if (!parseResult.ok) {
      showSyncSettingsRequired(parseResult.message || syncCore.BITABLE_URL_ERROR_MESSAGE);
      return null;
    }
  }

  const missingLabels = missing
    .filter(key => key !== "app_token" && key !== "table_id")
    .map(key => key === "字段名映射" ? key : key);
  if (bitableMissing) {
    missingLabels.push("多维表格链接");
  }

  showSyncSettingsRequired(`飞书同步缺配置：请先去设置里的「同步设置」填写 ${missingLabels.join("、")}。`);
  return null;
}

function showSyncSettingsRequired(message) {
  activateTab("settings");
  settingsSectionState = { ...settingsSectionState, sync: true };
  applySettingsSectionState();
  persistSettingsSectionState();
  setStatus(message);
}

async function sendFeishuSyncRecord(record, feishuSettings) {
  return chrome.runtime.sendMessage({
    type: "STEPASR_SYNC_FEISHU_RECORD",
    payload: {
      record,
      settings: feishuSettings
    }
  });
}

async function openExternalProtocolUrl(url) {
  if (typeof chrome.tabs?.create === "function") {
    try {
      await chrome.tabs.create({ url });
      return;
    } catch {
      // Fall back to a direct link click for external protocol handlers.
    }
  }

  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatObsidianSyncError(error) {
  if (error?.message?.includes("writeText")) return formatClipboardWriteError(error);
  return `发送到 Obsidian 失败：${error?.message || "无法打开 obsidian:// 协议。"}`;
}

function requestHistoryImport(mode) {
  if (mode === "replace") {
    const confirmed = window.confirm("覆盖导入会替换当前全部转写记录，确认继续吗？");
    if (!confirmed) return;
  }
  pendingImportMode = mode;
  importHistoryFile.value = "";
  importHistoryFile.click();
}

async function importHistoryFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const records = extractHistoryRecords(payload);
    const result = buildHistoryImportResult(records, pendingImportMode);
    await saveHistory(result.history);
    selectedHistoryIds.clear();
    setStatus(formatImportStatus(result));
  } catch (error) {
    setStatus(error?.message || "导入 JSON 失败。");
  } finally {
    event.target.value = "";
  }
}

function extractHistoryRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["history", "records", "items", HISTORY_KEY]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  throw new Error("JSON 内没有可导入的历史记录数组。");
}

function buildHistoryImportResult(records, mode) {
  const normalized = normalizeHistory(records);
  if (!normalized.length) throw new Error("JSON 内没有可导入的有效记录。");

  const deduped = dedupeHistoryById(normalized);
  if (mode === "replace") {
    return {
      mode,
      history: sortHistoryByCreatedAt(deduped.items),
      sourceCount: records.length,
      uniqueCount: deduped.items.length,
      duplicateCount: deduped.duplicateCount,
      previousCount: historyItems.length,
      addedCount: deduped.items.length,
      updatedCount: 0
    };
  }

  const mergedById = new Map(historyItems.map(item => [item.id, item]));
  let addedCount = 0;
  let updatedCount = 0;

  for (const item of deduped.items) {
    if (mergedById.has(item.id)) {
      updatedCount += 1;
      mergedById.set(item.id, normalizeHistoryItem({ ...mergedById.get(item.id), ...item }));
    } else {
      addedCount += 1;
      mergedById.set(item.id, item);
    }
  }

  return {
    mode,
    history: sortHistoryByCreatedAt(Array.from(mergedById.values())),
    sourceCount: records.length,
    uniqueCount: deduped.items.length,
    duplicateCount: deduped.duplicateCount,
    previousCount: historyItems.length,
    addedCount,
    updatedCount
  };
}

function formatImportStatus(result) {
  if (result.mode === "replace") {
    return `覆盖导入完成：写入 ${result.uniqueCount} 条，文件内去重 ${result.duplicateCount} 条，原有 ${result.previousCount} 条已替换。`;
  }
  return `合并导入完成：新增 ${result.addedCount} 条，更新 ${result.updatedCount} 条，文件内去重 ${result.duplicateCount} 条。`;
}

function dedupeHistoryById(items) {
  const byId = new Map();
  let duplicateCount = 0;
  for (const item of items) {
    if (byId.has(item.id)) duplicateCount += 1;
    byId.set(item.id, item);
  }
  return { items: Array.from(byId.values()), duplicateCount };
}

function sortHistoryByCreatedAt(items) {
  return items
    .map((item, index) => ({ item, index, timestamp: Date.parse(item.createdAt || "") || 0 }))
    .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
    .map(entry => entry.item);
}

function downloadTextFile(filename, content, type) {
  let url = "";
  let link = null;
  try {
    const blob = new Blob([content], { type });
    url = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    return true;
  } catch (error) {
    setStatus(`导出失败：${error?.message || "浏览器拒绝创建下载。"}`);
    return false;
  } finally {
    if (link) link.remove();
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function formatBulkTextExport(items) {
  return items
    .map((item, index) => [
      `【${index + 1}. ${item.title || getPlatformDefaultTitle(item.platform)}】`,
      item.pageUrl ? `来源：${item.pageUrl}` : "",
      formatFullTime(item.createdAt) ? `时间：${formatFullTime(item.createdAt)}` : "",
      `版本：${getCurrentTextVersionLabel()}`,
      "",
      getHistoryDisplayText(item).trim()
    ].filter(line => line !== "").join("\n"))
    .join(BULK_EXPORT_SEPARATOR);
}

function formatHistoryItemMarkdown(item) {
  const tags = normalizeTags(item.tags);
  const ruleSummary = postprocessState.viewMode === "processed"
    ? getEnabledPostprocessRuleLabels().join("、") || "无"
    : "未应用";
  return [
    `# ${toMarkdownLine(item.title || getPlatformDefaultTitle(item.platform))}`,
    "",
    `- 平台：${formatPlatform(item.platform)}`,
    `- 来源链接：${item.pageUrl || "无"}`,
    `- 时间：${formatFullTime(item.createdAt) || "未知"}`,
    `- 内容 ID：${item.mediaId || item.noteId || item.awemeId || "无"}`,
    `- 媒体类型：${formatMediaKind(item.mediaKind) || "未知"}`,
    `- 标签：${tags.length ? tags.join("、") : "无"}`,
    `- 导出版本：${getCurrentTextVersionLabel()}`,
    `- 后处理：${ruleSummary}`,
    "",
    "## 正文",
    "",
    getHistoryDisplayText(item).trim(),
    ""
  ].join("\n");
}

function makeHistoryItemFilenamePrefix(item) {
  const idPart = sanitizeFilename(item.mediaId || item.noteId || item.awemeId || item.id || "record");
  const titlePart = sanitizeFilename(item.title || item.platform || "stepasr").slice(0, 36);
  return ["stepasr", idPart, titlePart].filter(Boolean).join("-");
}

function makeTimestampForFilename() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    ms
  ].join("");
}

function sanitizeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toMarkdownLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim().replace(/^#+\s*/, "");
}

function makeButton(label, variant = "secondary", extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = [variant, extraClass].filter(Boolean).join(" ");
  button.textContent = label;
  return button;
}

async function copyToClipboard(value, message, button) {
  if (!value) {
    setStatus(message);
    return;
  }
  try {
    await writeClipboardText(value);
    flashButtonText(button, "已复制 ✓");
    setStatus(message);
  } catch (error) {
    setStatus(formatClipboardWriteError(error));
  }
}

async function writeClipboardText(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持 navigator.clipboard.writeText。");
  }
  await navigator.clipboard.writeText(text);
}

function formatClipboardWriteError(error) {
  const detail = error?.message ? `（${error.message}）` : "";
  return `复制失败：浏览器拒绝写入剪贴板，请先点击按钮后重试，或手动选择文本复制。${detail}`;
}

async function openHistoryPageUrl(pageUrl) {
  if (!pageUrl) {
    setStatus("这条记录没有来源链接。");
    return;
  }
  if (typeof chrome.tabs?.create !== "function") {
    setStatus("当前浏览器不支持从侧边栏打开来源链接，请先复制链接后手动打开。");
    return;
  }

  try {
    await chrome.tabs.create({ url: pageUrl });
  } catch (error) {
    setStatus(`打开来源链接失败：${error?.message || "浏览器拒绝打开标签页。"} 请先复制链接后手动打开。`);
  }
}

function historyMatches(item, term) {
  return [
    item.title,
    item.text,
    item.author,
    item.platform,
    item.mediaId,
    item.noteId,
    item.awemeId,
    item.pageUrl,
    item.mediaKind,
    ...normalizeTags(item.tags)
  ].some(value => String(value || "").toLowerCase().includes(term));
}

function formatHistorySubline(item) {
  const parts = [];
  if (item.platform) parts.push(formatPlatform(item.platform));
  if (item.author) parts.push(item.author);
  parts.push(`${countCharacters(item.text || "")} 字`);
  const contentId = item.mediaId || item.noteId || item.awemeId;
  if (contentId) parts.push(`ID ${contentId}`);
  if (item.mediaKind) parts.push(formatMediaKind(item.mediaKind));
  if (item.format?.type) parts.push(item.format.type);
  return parts.join(" · ") || "转写记录";
}

function formatPlatform(platform) {
  if (platform === "xiaohongshu") return "小红书";
  if (platform === "douyin") return "抖音";
  if (platform === "bilibili") return "B站";
  return platform || "未知";
}

function getPlatformDefaultTitle(platform) {
  if (platform === "xiaohongshu") return "小红书笔记";
  if (platform === "bilibili") return "B站视频";
  return "抖音视频";
}

function getAllTags() {
  const tags = new Set();
  for (const item of historyItems) {
    for (const tag of normalizeTags(item.tags)) tags.add(tag);
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-CN"));
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

function normalizeHistoryCover(raw) {
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

function normalizeTags(tags) {
  const values = Array.isArray(tags)
    ? tags
    : String(tags || "").split(/[,，、;；\n]+/);
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    const tag = normalizeTag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

function normalizeTag(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function createSyntheticHistoryId(record, index) {
  return `legacy-${hashString([
    record.awemeId,
    record.mediaId,
    record.noteId,
    record.platform,
    record.pageUrl,
    record.mediaUrl,
    record.createdAt,
    record.title,
    record.text,
    index
  ].join("|"))}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function formatMediaKind(value) {
  if (value === "audio") return "音频";
  if (value === "video") return "视频";
  return String(value || "");
}

function countCharacters(value) {
  return Array.from(String(value || "")).length;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function sliceCharacters(value, limit) {
  return Array.from(String(value || "")).slice(0, limit).join("");
}

function flashButtonText(button, feedbackText, originalText, duration = FEEDBACK_DELAY_MS) {
  if (!button) return Promise.resolve();
  const restoreText = originalText || button.dataset.feedbackOriginal || button.textContent;
  clearTimeout(Number(button.dataset.feedbackTimer || 0));
  button.dataset.feedbackOriginal = restoreText;
  button.textContent = feedbackText;
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      button.textContent = button.dataset.feedbackOriginal || restoreText;
      delete button.dataset.feedbackTimer;
      delete button.dataset.feedbackOriginal;
      resolve();
    }, duration);
    button.dataset.feedbackTimer = String(timer);
  });
}

function setStatus(text) {
  clearTimeout(statusTimer);
  statusEl.textContent = text || "";
  statusEl.classList.toggle("is-visible", Boolean(text));
  if (!text) return;

  statusTimer = setTimeout(() => {
    if (statusEl.textContent === text) {
      statusEl.textContent = "";
      statusEl.classList.remove("is-visible");
    }
    statusTimer = 0;
  }, getStatusVisibleDelay(text));
}

function getStatusVisibleDelay(text) {
  const message = String(text || "");
  if (message.length > 50) return STATUS_VISIBLE_DELAY_LONG_MS;
  if (message.length > 20) return STATUS_VISIBLE_DELAY_MEDIUM_MS;
  return STATUS_VISIBLE_DELAY_SHORT_MS;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

// --- v0.3.0: Onboarding ---
const ONBOARDING_KEY = "stepasr_onboarded";

function initOnboarding() {
  if (!onboardingEl) return;
  chrome.storage.local.get({ [ONBOARDING_KEY]: false }, result => {
    if (result[ONBOARDING_KEY]) { onboardingEl.hidden = true; return; }
    onboardingEl.hidden = false;
    refreshOnboardingSteps();
  });
  dismissOnboardingBtn?.addEventListener("click", () => {
    onboardingEl.hidden = true;
    chrome.storage.local.set({ [ONBOARDING_KEY]: true });
  });
}

function refreshOnboardingSteps() {
  chrome.storage.local.get({ stepasr_settings: {}, stepasr_history: [], stepasr_last_api_test: null }, result => {
    const s = result.stepasr_settings || {};
    const h = Array.isArray(result.stepasr_history) ? result.stepasr_history : [];
    const t = result.stepasr_last_api_test;
    const hasKey = Boolean(s.apiKey);
    const apiOk = t && t.ok;
    const hasHistory = h.length > 0;
    const steps = onboardingEl.querySelectorAll(".onboarding-step");
    steps.forEach(step => {
      const n = Number(step.dataset.step);
      step.classList.remove("is-active", "is-done");
      if (n === 1 && hasKey) step.classList.add("is-done");
      else if (n === 2 && hasKey && apiOk) step.classList.add("is-done");
      else if (n === 3 && hasHistory) step.classList.add("is-done");
      else if (n === 1 && !hasKey) step.classList.add("is-active");
      else if (n === 2 && hasKey && !apiOk) step.classList.add("is-active");
      else if (n === 3 && hasKey && apiOk && !hasHistory) step.classList.add("is-active");
    });
    if (Array.from(steps).every(s => s.classList.contains("is-done"))) {
      onboardingEl.hidden = true;
      chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    }
  });
}

function updateStatsBar(items) {
  if (!statsBarEl) return;
  const list = Array.isArray(items) ? items : historyItems;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthly = list.filter(i => (i.createdAt || "") >= monthStart).length;
  statsMonthlyEl.textContent = "本月 " + monthly + " 条";
  statsTotalEl.textContent = "共 " + list.length + " 条";
  statsBarEl.hidden = false;
}

// Direct init - no function patching to avoid breaking event bindings
initOnboarding();

// Auto-update stats when history changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.stepasr_history) {
    historyItems = normalizeHistory(changes.stepasr_history.newValue || []);
    updateStatsBar(historyItems);
  }
  if (changes.stepasr_settings || changes.stepasr_last_api_test) {
    refreshOnboardingSteps();
  }
});
