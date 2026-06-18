(function initDouyinAdapter(globalScope) {
  if (globalScope.DouyinAdapter) {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = globalScope.DouyinAdapter;
    }
    return;
  }

  const DouyinAdapter = {
    platform: "douyin",
    label: "抖音",
    detectCurrentMedia,
    matchesLocation
  };

  function matchesLocation(locationLike) {
    const host = String(locationLike?.hostname || "").toLowerCase();
    return host === "douyin.com" || host.endsWith(".douyin.com");
  }

  function detectCurrentMedia() {
    if (!globalScope.DouyinDetector?.detectFromSources) {
      const pageUrl = globalScope.location?.href || "";
      const title = getPageTitle();
      return {
        platform: "douyin",
        id: "",
        awemeId: "",
        title,
        pageUrl,
        mediaCandidates: [],
        diagnostics: {
          platform: "douyin",
          pageUrl,
          title,
          videoCount: null,
          visibleVideoCount: null,
          linkCandidateCount: null,
          candidateCount: 0,
          hasOgUrl: null,
          hasCanonical: null,
          topCandidates: [],
          error: "抖音检测模块未加载。"
        }
      };
    }

    const sources = buildDouyinDetectorSources();
    const context = globalScope.DouyinDetector.detectFromSources(sources);
    const metadata = extractDouyinMetadata(context, sources);
    return {
      platform: "douyin",
      id: context.awemeId || "",
      awemeId: context.awemeId || "",
      source: context.source || "",
      title: context.title || getPageTitle(),
      pageUrl: context.pageUrl || globalScope.location?.href || "",
      cover: metadata.cover,
      author: metadata.author,
      mediaCandidates: [],
      diagnostics: {
        ...(context.diagnostics || {}),
        platform: "douyin",
        id: context.awemeId || "",
        source: context.source || ""
      }
    };
  }

  function extractDouyinMetadata(context = {}, sources = {}) {
    const detail = findAwemeDetailInObject(context, context.awemeId || "") ||
      findAwemeDetailInSources(sources, context.awemeId || "");
    return {
      cover: extractDouyinCover(detail),
      author: extractDouyinAuthor(detail)
    };
  }

  function findAwemeDetailInObject(value, awemeId = "") {
    const candidates = [
      value?.detail,
      value?.aweme_detail,
      value?.awemeDetail,
      value?.aweme,
      value?.data?.aweme_detail,
      value?.data?.awemeDetail,
      value?.data?.aweme,
      value?.data
    ];

    for (const candidate of candidates) {
      const detail = unwrapAwemeDetail(candidate);
      if (looksLikeAwemeDetail(detail, awemeId)) return detail;
    }
    return null;
  }

  function findAwemeDetailInSources(sources = {}, awemeId = "") {
    const texts = [
      ...(sources.activeTexts || []),
      ...(sources.scripts || []),
      ...(sources.storage || []).map(item => item?.value || "")
    ];
    for (const text of texts) {
      const detail = findAwemeDetailInText(text, awemeId);
      if (detail) return detail;
    }
    return null;
  }

  function findAwemeDetailInText(text, awemeId = "") {
    const sourceText = String(text || "");
    if (!sourceText || !/(aweme|cover|origin_cover|nickname)/i.test(sourceText)) return null;
    for (const key of ["aweme_detail", "awemeDetail", "aweme"]) {
      let searchIndex = 0;
      while (searchIndex < sourceText.length) {
        const keyIndex = sourceText.indexOf(`"${key}"`, searchIndex);
        if (keyIndex < 0) break;
        searchIndex = keyIndex + key.length + 2;
        const colonIndex = sourceText.indexOf(":", keyIndex);
        const openIndex = sourceText.indexOf("{", colonIndex);
        if (colonIndex < 0 || openIndex < 0) continue;
        const objectText = extractBalancedObject(sourceText, openIndex);
        const parsed = parseJsonObject(objectText);
        const detail = unwrapAwemeDetail(parsed);
        if (looksLikeAwemeDetail(detail, awemeId)) return detail;
      }
    }
    return null;
  }

  function extractBalancedObject(text, openIndex) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let index = openIndex; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'") {
        quote = char;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(openIndex, index + 1);
      }
    }
    return "";
  }

  function parseJsonObject(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function unwrapAwemeDetail(value) {
    if (!value || typeof value !== "object") return null;
    return value.aweme_detail || value.awemeDetail || value.aweme || value.detail || value;
  }

  function looksLikeAwemeDetail(value, awemeId = "") {
    if (!value || typeof value !== "object") return false;
    const ids = [
      value.aweme_id,
      value.awemeId,
      value.item_id,
      value.itemId,
      value.group_id,
      value.groupId,
      value.id
    ].map(item => String(item || "")).filter(Boolean);
    if (awemeId && ids.length > 0 && !ids.includes(String(awemeId))) return false;
    return Boolean(value.video || value.author || extractDouyinCover(value) || extractDouyinAuthor(value));
  }

  function extractDouyinCover(detail) {
    if (!detail || typeof detail !== "object") return "";
    return normalizeImageUrl(
      pickImageUrl(detail.video?.cover) ||
      pickImageUrl(detail.video?.origin_cover) ||
      pickImageUrl(detail.video?.originCover)
    );
  }

  function extractDouyinAuthor(detail) {
    return String(detail?.author?.nickname || "").trim();
  }

  function pickImageUrl(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = pickImageUrl(item);
        if (url) return url;
      }
      return "";
    }
    if (typeof value !== "object") return "";
    return pickImageUrl(value.url_list) ||
      pickImageUrl(value.urlList) ||
      pickImageUrl(value.url) ||
      pickImageUrl(value.uri);
  }

  function normalizeImageUrl(raw) {
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

  function buildDouyinDetectorSources() {
    const documentRef = globalScope.document;
    const videos = Array.from(documentRef.querySelectorAll("video"));
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

    const visibleLinks = Array.from(documentRef.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="modal_id="], a[href*="aweme_id="]'))
      .map(link => ({ href: link.href || "", score: visibleAreaScore(link) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const scripts = Array.from(documentRef.scripts)
      .map(script => script.textContent || "")
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12)
      .map(text => text.slice(0, 900000));

    const storage = [];
    try {
      for (let i = 0; i < globalScope.localStorage.length; i += 1) {
        const key = globalScope.localStorage.key(i);
        const value = globalScope.localStorage.getItem(key) || "";
        if (/douyin|aweme|video|modal|feed/i.test(`${key} ${value.slice(0, 80)}`)) {
          storage.push({ key, value: value.slice(0, 300000) });
        }
      }
    } catch {
      // Storage may be unavailable in some embedded contexts.
    }

    let resources = [];
    try {
      resources = globalScope.performance.getEntriesByType("resource").map(entry => entry.name);
    } catch {
      // Performance API may be restricted.
    }

    const ogUrl = documentRef.querySelector('meta[property="og:url"]')?.content || "";
    const canonical = documentRef.querySelector('link[rel="canonical"]')?.href || "";

    return {
      pageUrl: globalScope.location?.href || "",
      title: getPageTitle(),
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

  function getPageTitle() {
    const documentRef = globalScope.document;
    const metaTitle = documentRef?.querySelector?.('meta[property="og:title"]')?.content;
    const title = metaTitle || documentRef?.title || "douyin-video";
    return title.replace(/\s+-\s+抖音.*$/u, "").trim();
  }

function getBestVisibleVideo(videos = []) {
  if (globalScope.StepAsrPlatformAdapters?.getBestVisibleVideo) {
    return globalScope.StepAsrPlatformAdapters.getBestVisibleVideo(videos);
  }

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
    if (globalScope.StepAsrPlatformAdapters?.visibleAreaScore) {
      return globalScope.StepAsrPlatformAdapters.visibleAreaScore(element);
    }

    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, globalScope.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, globalScope.innerHeight) - Math.max(rect.top, 0));
    return visibleWidth * visibleHeight;
  }

  globalScope.DouyinAdapter = DouyinAdapter;
  globalScope.StepAsrPlatformAdapters?.registerAdapter?.(DouyinAdapter);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DouyinAdapter;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
