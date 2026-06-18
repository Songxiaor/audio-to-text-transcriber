(function initDouyinDetector(globalScope) {
  if (globalScope.DouyinDetector) return;

  const ID_KEYS = [
    "modal_id",
    "aweme_id",
    "awemeId",
    "item_id",
    "itemId",
    "group_id",
    "groupId",
    "video_id",
    "videoId",
    "modal-id",
    "aweme-id",
    "item-id",
    "group-id",
    "video-id"
  ];
  const KEY_RE = ID_KEYS.join("|");
  const ID_PATTERNS = [
    { re: /\/(?:video|note)\/(\d{8,25})(?=[/?#&"'\\\s]|$)/g, bonus: 8 },
    { re: new RegExp(`(?:${KEY_RE})(?:\\s*["']?\\s*[:=]\\s*["']?|["'=:%?&/\\\\\\s]+)(\\d{8,25})`, "g"), bonus: 5 },
    { re: new RegExp(`"(?:${KEY_RE})"\\s*:\\s*"?(\\d{8,25})"?`, "g"), bonus: 4 }
  ];

  const DouyinDetector = {
    collectIdsFromText,
    detectFromSources,
    normalizeTitle,
    rankCandidates
  };

  function detectFromSources(sources = {}) {
    const candidates = [];
    const addText = (value, score, source) => {
      for (const item of collectIdsFromText(value, score, source)) candidates.push(item);
    };
    const addTextList = (values, score, source) => {
      for (const value of values || []) addText(value, score, source);
    };

    addText(sources.pageUrl, 100, "location");
    addTextList(sources.canonicalUrls, 92, "canonical");
    addTextList(sources.activeLinks, 88, "active-video-link");
    addTextList(sources.activeTexts, 84, "active-video-dom");

    for (const item of sources.visibleLinks || []) {
      addText(item.href, item.score > 0 ? 78 : 55, "visible-link");
    }

    addTextList(sources.scripts, 64, "script");

    for (const item of sources.storage || []) {
      addText(`${item.key || ""}\n${item.value || ""}`, 45, "localStorage");
    }

    addTextList(sources.resources, 40, "performance");

    const topCandidates = rankCandidates(candidates);
    const best = topCandidates[0] || null;
    const title = normalizeTitle(sources.title || "");

    return {
      awemeId: best?.id || "",
      source: best?.source || "",
      title,
      pageUrl: sources.pageUrl || "",
      diagnostics: {
        pageUrl: sources.pageUrl || "",
        title,
        videoCount: sources.videoCount ?? null,
        visibleVideoCount: sources.visibleVideoCount ?? null,
        linkCandidateCount: sources.linkCandidateCount ?? null,
        candidateCount: candidates.length,
        topCandidates: topCandidates.slice(0, 12),
        hasOgUrl: Boolean(sources.hasOgUrl),
        hasCanonical: Boolean(sources.hasCanonical)
      }
    };
  }

  function collectIdsFromText(text, score = 0, source = "text") {
    if (!text) return [];

    const byId = new Map();
    for (const variant of textVariants(text)) {
      for (const { re, bonus } of ID_PATTERNS) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(variant))) {
          const id = match[1];
          if (!/^\d{8,25}$/.test(id)) continue;
          const item = { id, score: score + bonus, source };
          const existing = byId.get(id);
          if (!existing || item.score > existing.score) byId.set(id, item);
        }
      }
    }

    return Array.from(byId.values());
  }

  function textVariants(value) {
    const raw = String(value || "");
    const unescaped = raw
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u003[dD]/g, "=")
      .replace(/\\u003[aA]/g, ":")
      .replace(/\\u0026/g, "&")
      .replace(/\\u0022/g, "\"")
      .replace(/\\"/g, "\"")
      .replace(/&#x2F;/gi, "/")
      .replace(/&quot;/gi, "\"")
      .replace(/&amp;/gi, "&");

    return unique([
      raw,
      unescaped,
      safeDecode(raw),
      safeDecode(unescaped),
      safeDecode(safeDecode(unescaped))
    ]);
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return String(value || "")
        .replace(/%2[fF]/g, "/")
        .replace(/%3[dD]/g, "=")
        .replace(/%3[aA]/g, ":")
        .replace(/%22/g, "\"")
        .replace(/%26/g, "&");
    }
  }

  function rankCandidates(items) {
    const byId = new Map();

    for (const item of items || []) {
      if (!/^\d{8,25}$/.test(item.id)) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, {
          id: item.id,
          score: item.score,
          source: item.source,
          hits: 1
        });
        continue;
      }

      existing.hits += 1;
      if (item.score > existing.score) {
        existing.score = item.score;
        existing.source = item.source;
      }
    }

    return Array.from(byId.values()).sort((a, b) => b.score - a.score || b.hits - a.hits);
  }

  function normalizeTitle(title) {
    return String(title || "").replace(/\s+-\s+抖音.*$/u, "").trim();
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  globalScope.DouyinDetector = DouyinDetector;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DouyinDetector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
