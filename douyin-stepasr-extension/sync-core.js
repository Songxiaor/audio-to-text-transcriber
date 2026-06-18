(function attachStepAsrSyncCore(globalScope) {
  "use strict";

  const DEFAULT_FEISHU_FIELD_MAPPING = Object.freeze({
    title: "标题",
    text: "文案",
    author: "作者",
    platform: "平台",
    link: "链接",
    video_id: "视频ID",
    word_count: "字数"
  });

  const DEFAULT_SYNC_SETTINGS = Object.freeze({
    obsidian: Object.freeze({
      vault: "",
      folder: ""
    }),
    feishu: Object.freeze({
      app_id: "",
      app_secret: "",
      bitable_url: "",
      app_token: "",
      table_id: "",
      field_mapping: DEFAULT_FEISHU_FIELD_MAPPING
    })
  });

  const BITABLE_URL_ERROR_MESSAGE = "请粘贴包含 ?table= 的多维表格链接，并先在表格里选中目标数据表。";
  const BITABLE_WIKI_URL_ERROR_MESSAGE = "wiki 链接无法直接读取 app_token，请打开多维表格后复制 /base/ 链接。";

  const FEISHU_FIELD_VALUE_KEYS = Object.freeze([
    ["title", "title"],
    ["text", "text"],
    ["author", "author"],
    ["platform", "platform"],
    ["link", "link"],
    ["video_id", "videoId"],
    ["word_count", "wordCount"]
  ]);

  function normalizeSyncSettings(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      obsidian: normalizeObsidianSettings(source.obsidian),
      feishu: normalizeFeishuSettings(source.feishu)
    };
  }

  function normalizeObsidianSettings(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      vault: String(source.vault || "").trim(),
      folder: normalizeFolderPath(source.folder || source.path || "")
    };
  }

  function normalizeFeishuSettings(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const bitableUrl = String(source.bitable_url || source.bitableUrl || "").trim();
    const parsed = bitableUrl ? parseBitableUrl(bitableUrl) : null;
    return {
      app_id: String(source.app_id || source.appId || "").trim(),
      app_secret: String(source.app_secret || source.appSecret || "").trim(),
      bitable_url: bitableUrl,
      app_token: parsed?.ok ? parsed.appToken : String(source.app_token || source.appToken || "").trim(),
      table_id: parsed?.ok ? parsed.tableId : String(source.table_id || source.tableId || "").trim(),
      field_mapping: normalizeFeishuFieldMapping(source.field_mapping || source.fieldMapping)
    };
  }

  function parseBitableUrl(input) {
    const value = String(input || "").trim();
    if (!value) return makeBitableParseResult("", "", "empty", BITABLE_URL_ERROR_MESSAGE);

    const url = parsePotentialBitableUrl(value);
    if (url) return parseBitableUrlObject(url);

    const tokenPair = parseRawBitableTokenPair(value);
    if (tokenPair) return tokenPair;

    return makeBitableParseResult("", "", "invalid", BITABLE_URL_ERROR_MESSAGE);
  }

  function parsePotentialBitableUrl(value) {
    const trimmed = String(value || "").trim();
    const candidates = [];

    if (/^https?:\/\//i.test(trimmed)) {
      candidates.push(trimmed);
    } else if (/^[^/\s]+\/(?:base|wiki)\//i.test(trimmed)) {
      candidates.push(`https://${trimmed}`);
    } else if (/^\/?(?:base|wiki)\//i.test(trimmed)) {
      candidates.push(trimmed.startsWith("/") ? `https://feishu.cn${trimmed}` : `https://feishu.cn/${trimmed}`);
    }

    for (const candidate of candidates) {
      try {
        return new URL(candidate);
      } catch {
        return null;
      }
    }

    return null;
  }

  function parseBitableUrlObject(url) {
    if (!isSupportedBitableHost(url.hostname)) {
      return makeBitableParseResult("", "", "invalid_host", BITABLE_URL_ERROR_MESSAGE);
    }

    const segments = url.pathname.split("/").map(part => part.trim()).filter(Boolean);
    if (segments[0]?.toLowerCase() === "wiki") {
      return makeBitableParseResult("", "", "wiki_link", BITABLE_WIKI_URL_ERROR_MESSAGE);
    }

    const baseIndex = segments.findIndex(part => part.toLowerCase() === "base");
    if (baseIndex < 0) {
      return makeBitableParseResult("", "", "not_base", BITABLE_URL_ERROR_MESSAGE);
    }

    const appToken = String(segments[baseIndex + 1] || "").trim();
    if (!appToken) {
      return makeBitableParseResult("", "", "missing_app_token", BITABLE_URL_ERROR_MESSAGE);
    }

    const tableId = String(url.searchParams.get("table") || "").trim();
    if (!tableId) {
      return makeBitableParseResult(appToken, "", "missing_table", BITABLE_URL_ERROR_MESSAGE);
    }

    return makeBitableParseResult(appToken, tableId, "", "");
  }

  function parseRawBitableTokenPair(value) {
    const raw = String(value || "").trim();
    const appTokenMatch = raw.match(/(?:app[_-]?token|appToken)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
    const tableIdMatch = raw.match(/(?:table[_-]?id|tableId|table)\s*[:=]\s*([A-Za-z0-9_-]+)/i);
    if (appTokenMatch?.[1] && tableIdMatch?.[1]) {
      return makeBitableParseResult(appTokenMatch[1], tableIdMatch[1], "", "");
    }

    const parts = raw.split(/[\s,，;；|]+/).map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2 && isLikelyRawBitableTokenPair(parts[0], parts[1])) {
      return makeBitableParseResult(parts[0], parts[1], "", "");
    }

    return null;
  }

  function isLikelyRawBitableTokenPair(appToken, tableId) {
    return /^[A-Za-z0-9_-]{4,}$/.test(String(appToken || ""))
      && /^tbl[A-Za-z0-9_-]{2,}$/i.test(String(tableId || ""));
  }

  function isSupportedBitableHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "feishu.cn"
      || host.endsWith(".feishu.cn")
      || host === "larksuite.com"
      || host.endsWith(".larksuite.com");
  }

  function makeBitableParseResult(appToken, tableId, error, message) {
    return {
      ok: !error,
      appToken: String(appToken || "").trim(),
      tableId: String(tableId || "").trim(),
      error,
      message
    };
  }

  function normalizeFeishuFieldMapping(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const mapping = {};
    for (const key of Object.keys(DEFAULT_FEISHU_FIELD_MAPPING)) {
      const hasExplicitValue = Object.prototype.hasOwnProperty.call(source, key);
      const rawValue = hasExplicitValue ? source[key] : DEFAULT_FEISHU_FIELD_MAPPING[key];
      mapping[key] = String(rawValue || "").trim();
    }
    return mapping;
  }

  function buildSyncRecordData(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const text = normalizeLineBreaks(source.text || "").trim();
    const platform = formatPlatform(source.platform || source.platformLabel || "");
    const title = sanitizeMarkdownHeading(source.title || getPlatformDefaultTitle(source.platform));
    const videoId = String(source.videoId || source.mediaId || source.noteId || source.awemeId || "").trim();
    const wordCount = Number.isFinite(Number(source.wordCount))
      ? Math.max(0, Math.trunc(Number(source.wordCount)))
      : countCharacters(text);

    return {
      title,
      text,
      author: String(source.author || "").trim(),
      platform,
      link: String(source.link || source.pageUrl || "").trim(),
      videoId,
      wordCount
    };
  }

  function buildObsidianMarkdown(input = {}) {
    const record = buildSyncRecordData(input);
    return [
      `# ${record.title}`,
      "",
      "## 元信息",
      "",
      `- 作者：${record.author || "未知"}`,
      `- 平台：${record.platform || "未知"}`,
      `- 链接：${record.link || "无"}`,
      `- 视频ID：${record.videoId || "无"}`,
      `- 字数：${record.wordCount}`,
      "",
      "## 正文",
      "",
      record.text,
      ""
    ].join("\n");
  }

  function buildObsidianFilePath(input = {}, obsidianSettings = {}) {
    const record = buildSyncRecordData(input);
    const settings = normalizeObsidianSettings(obsidianSettings);
    const fileTitle = sanitizeObsidianPathSegment(record.title) || "未命名转写";
    return settings.folder ? `${settings.folder}/${fileTitle}` : fileTitle;
  }

  function buildObsidianNewNoteUrl(input = {}, obsidianSettings = {}) {
    const settings = normalizeObsidianSettings(obsidianSettings);
    if (!settings.vault) throw new Error("Obsidian vault 名称未配置。");

    const url = new URL("obsidian://new");
    url.searchParams.set("vault", settings.vault);
    url.searchParams.set("file", buildObsidianFilePath(input, settings));
    url.searchParams.set("clipboard", "true");
    return url.toString();
  }

  function buildFeishuFieldsPayload(input = {}, fieldMapping = {}) {
    const record = buildSyncRecordData(input);
    const mapping = normalizeFeishuFieldMapping(fieldMapping);
    const values = {
      title: record.title,
      text: record.text,
      author: record.author,
      platform: record.platform,
      link: record.link,
      videoId: record.videoId,
      wordCount: record.wordCount
    };
    const fields = {};

    for (const [mappingKey, valueKey] of FEISHU_FIELD_VALUE_KEYS) {
      const fieldName = mapping[mappingKey];
      if (!fieldName) continue;
      fields[fieldName] = valueKey === "wordCount" ? values[valueKey] : String(values[valueKey] || "");
    }

    return { fields };
  }

  function getMissingFeishuConfigKeys(input = {}) {
    const settings = normalizeFeishuSettings(input);
    const missing = [];
    if (!settings.app_id) missing.push("app_id");
    if (!settings.app_secret) missing.push("app_secret");
    if (!settings.app_token) missing.push("app_token");
    if (!settings.table_id) missing.push("table_id");
    if (!Object.values(settings.field_mapping).some(Boolean)) missing.push("字段名映射");
    return missing;
  }

  function sanitizeMarkdownHeading(value) {
    const line = normalizeLineBreaks(value)
      .split("\n")
      .map(part => part.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/^#+\s*/, "")
      .trim();
    return line || "未命名转写";
  }

  function sanitizeObsidianPathSegment(value) {
    return sanitizeMarkdownHeading(value)
      .replace(/[\\/:*?"<>|#^\[\]]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .replace(/^[.\s-]+|[.\s-]+$/g, "")
      .slice(0, 120)
      .trim();
  }

  function normalizeFolderPath(value) {
    return String(value || "")
      .split(/[\\/]+/)
      .map(part => sanitizeObsidianPathSegment(part))
      .filter(Boolean)
      .join("/");
  }

  function normalizeLineBreaks(value) {
    return String(value || "").replace(/\r\n?/g, "\n");
  }

  function formatPlatform(platform) {
    const value = String(platform || "").trim();
    const lower = value.toLowerCase();
    if (lower === "xiaohongshu") return "小红书";
    if (lower === "douyin") return "抖音";
    if (lower === "bilibili") return "B站";
    return value;
  }

  function getPlatformDefaultTitle(platform) {
    const lower = String(platform || "").toLowerCase();
    if (lower === "xiaohongshu") return "小红书笔记";
    if (lower === "bilibili") return "B站视频";
    return "抖音视频";
  }

  function countCharacters(value) {
    return Array.from(String(value || "")).length;
  }

  const api = {
    DEFAULT_SYNC_SETTINGS,
    DEFAULT_FEISHU_FIELD_MAPPING,
    FEISHU_FIELD_VALUE_KEYS,
    BITABLE_URL_ERROR_MESSAGE,
    BITABLE_WIKI_URL_ERROR_MESSAGE,
    normalizeSyncSettings,
    normalizeObsidianSettings,
    normalizeFeishuSettings,
    normalizeFeishuFieldMapping,
    parseBitableUrl,
    buildSyncRecordData,
    buildObsidianMarkdown,
    buildObsidianFilePath,
    buildObsidianNewNoteUrl,
    buildFeishuFieldsPayload,
    getMissingFeishuConfigKeys,
    sanitizeMarkdownHeading,
    sanitizeObsidianPathSegment,
    normalizeFolderPath,
    formatPlatform,
    countCharacters
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  globalScope.StepAsrSyncCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
