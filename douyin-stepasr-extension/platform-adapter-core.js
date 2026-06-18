(function initStepAsrPlatformAdapters(globalScope) {
  if (globalScope.StepAsrPlatformAdapters) {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = globalScope.StepAsrPlatformAdapters;
    }
    return;
  }

  const PLATFORM_LABELS = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    bilibili: "B站"
  };

  const adapters = [];

  const StepAsrPlatformAdapters = {
    adapters,
    getAdapterForLocation,
    getBestVisibleVideo,
    getCurrentAdapter,
    getPlatformLabel,
    isFetchableMediaUrl,
    normalizeMediaCandidate,
    normalizeMediaCandidates,
    pickMediaCandidate,
    registerAdapter,
    visibleAreaScore
  };

  function registerAdapter(adapter) {
    if (!adapter?.platform || typeof adapter.detectCurrentMedia !== "function") {
      throw new Error("平台适配器缺少 platform 或 detectCurrentMedia。");
    }

    const index = adapters.findIndex(item => item.platform === adapter.platform);
    if (index >= 0) adapters.splice(index, 1, adapter);
    else adapters.push(adapter);
    return adapter;
  }

  function getCurrentAdapter() {
    return getAdapterForLocation(globalScope.location);
  }

  function getAdapterForLocation(locationLike) {
    return adapters.find(adapter => {
      try {
        if (typeof adapter.matchesLocation === "function") return adapter.matchesLocation(locationLike);
      } catch {
        return false;
      }
      return false;
    }) || null;
  }

  function getPlatformLabel(platform) {
    return PLATFORM_LABELS[platform] || "当前平台";
  }

  function normalizeMediaCandidates(candidates = []) {
    const byUrl = new Map();
    for (const item of candidates || []) {
      const candidate = normalizeMediaCandidate(item);
      if (!candidate.url) continue;
      const existing = byUrl.get(candidate.url);
      if (!existing) {
        byUrl.set(candidate.url, candidate);
        continue;
      }

      existing.hits += 1;
      if (candidate.score > existing.score) {
        existing.kind = candidate.kind;
        existing.score = candidate.score;
        existing.source = candidate.source;
      }
    }

    return Array.from(byUrl.values()).sort((a, b) =>
      b.score - a.score ||
      mediaKindRank(b.kind) - mediaKindRank(a.kind) ||
      b.hits - a.hits
    );
  }

  function normalizeMediaCandidate(item = {}) {
    const url = normalizeMediaUrl(cleanMediaUrl(item.url || ""));
    if (!isFetchableMediaUrl(url)) return { ...item, url: "" };
    return {
      url,
      kind: item.kind === "audio" ? "audio" : "video",
      score: Number(item.score || 0),
      source: String(item.source || "page"),
      hits: Number(item.hits || 1)
    };
  }

  function pickMediaCandidate(candidates = [], requestedKind = "auto") {
    const ranked = normalizeMediaCandidates(candidates);
    let chosen = null;

    if (requestedKind === "audio" || requestedKind === "video") {
      chosen = ranked.find(item => item.kind === requestedKind) || null;
    } else {
      chosen = ranked.find(item => item.kind === "audio") || ranked.find(item => item.kind === "video") || null;
    }

    if (!chosen?.url) {
      if (requestedKind === "audio") throw new Error("没有从当前页面提取到可下载的音频地址。");
      if (requestedKind === "video") throw new Error("没有从当前页面提取到可下载的视频地址。");
      throw new Error("没有从当前页面提取到可下载的音频或视频地址。");
    }

    return {
      url: chosen.url,
      kind: chosen.kind,
      source: chosen.source || "page"
    };
  }

  function cleanMediaUrl(raw) {
    return String(raw || "")
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u003[dD]/g, "=")
      .replace(/\\u003[aA]/g, ":")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/[,;)\]}]+$/g, "");
  }

  function normalizeMediaUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || /^(?:blob|data|filesystem):/i.test(value)) return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function isFetchableMediaUrl(url) {
    if (!/^https?:\/\//i.test(url || "")) return false;
    const lower = String(url).toLowerCase();
    if (/\.(?:jpe?g|png|webp|gif|svg|css|js)(?:[?#]|$)/.test(lower)) return false;
    return true;
  }

  function mediaKindRank(kind) {
    return kind === "audio" ? 2 : 1;
  }

function getBestVisibleVideo(videos = []) {
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
    if (!element?.getBoundingClientRect || !globalScope.innerWidth || !globalScope.innerHeight) return 0;
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, globalScope.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, globalScope.innerHeight) - Math.max(rect.top, 0));
    return visibleWidth * visibleHeight;
  }

  globalScope.StepAsrPlatformAdapters = StepAsrPlatformAdapters;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = StepAsrPlatformAdapters;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
