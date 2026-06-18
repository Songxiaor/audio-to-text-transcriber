(function initXiaohongshuAdapter(globalScope) {
  if (globalScope.XiaohongshuAdapter) {
    if (typeof module !== "undefined" && module.exports) {
      module.exports = globalScope.XiaohongshuAdapter;
    }
    return;
  }

  const ORIGIN_VIDEO_HOSTS = [
    "sns-video-bd.xhscdn.com",
    "sns-video-hw.xhscdn.com",
    "sns-video-qc.xhscdn.com"
  ];

  const STREAM_CODECS = ["h264", "h265", "h266", "av1"];
  const HOOK_MESSAGE_FLAG = "__stepasrXhs";
  const HOOK_NOTE_CACHE_LIMIT = 30;
  const hookNoteCache = new Map();

  const XiaohongshuAdapter = {
    platform: "xiaohongshu",
    label: "小红书",
    clearHookNoteCache,
    collectMediaCandidatesFromNote,
    detectCurrentMedia,
    detectFromSources,
    extractNoteIdFromUrl,
    findNoteDetail,
    getHookCacheNoteIds,
    handleHookMessageEvent,
    matchesLocation,
    parseInitialStateFromScripts,
    storeHookNote
  };

  installHookMessageListener();

  function matchesLocation(locationLike) {
    const host = String(locationLike?.hostname || "").toLowerCase();
    return host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com");
  }

  function detectCurrentMedia() {
    const documentRef = globalScope.document;
    const initialStateInfo = readInitialState();
    const scripts = initialStateInfo.value ? [] : collectScriptTexts(documentRef);
    return detectFromSources({
      pageUrl: globalScope.location?.href || "",
      title: getPageTitle(documentRef),
      initialState: initialStateInfo.value,
      initialStateSource: initialStateInfo.source,
      scripts,
      videos: collectVideoElements(documentRef)
    });
  }

  function detectFromSources(sources = {}) {
    const pageUrl = sources.pageUrl || "";
    const urlNoteId = extractNoteIdFromUrl(pageUrl);
    const noteId = urlNoteId || normalizeNoteId(sources.noteId || "");
    const initialStateInfo = sources.initialState
      ? { value: sources.initialState, source: sources.initialStateSource || "input" }
      : parseInitialStateFromScripts(sources.scripts || []);
    const initialStateNoteSearch = findNoteDetail(initialStateInfo.value, noteId);
    const cacheSearch = findCachedHookNote(urlNoteId);
    const noteSearch = cacheSearch.note ? {
      ...cacheSearch,
      noteDetailMapSources: initialStateNoteSearch.noteDetailMapSources || [],
      noteDetailMapKeys: initialStateNoteSearch.noteDetailMapKeys || []
    } : initialStateNoteSearch;
    const note = noteSearch.note;
    const noteCandidates = note ? collectMediaCandidatesFromNote(note) : [];
    const videoElementResult = collectVideoElementCandidates(sources.videos || []);
    const metadata = extractNoteMetadata(note);
    let mediaCandidates = normalizeMediaCandidates([
      ...noteCandidates,
      ...videoElementResult.candidates
    ]);
    const title = normalizeTitle(
      findTitle(note) ||
      sources.title ||
      "小红书笔记"
    );
    const hasVideoObject = Boolean(note && getVideoObject(note));
    const noteFound = Boolean(note);
    const missingCurrentNoteData = Boolean(noteId && !noteFound);
    let errorCode = "";
    let message = "";

    if (missingCurrentNoteData) {
      errorCode = "current-note-not-found";
      message = "未找到当前视频数据，请刷新当前视频页后再试。";
      mediaCandidates = [];
    } else if (noteFound && !hasVideoObject && mediaCandidates.length === 0) {
      errorCode = "no-video";
      message = "当前笔记没有视频可转写。";
    } else if (mediaCandidates.length === 0) {
      errorCode = "no-media";
      message = "没有从当前小红书页面提取到可下载的视频地址。";
    }

    const topCandidate = mediaCandidates[0] || null;

    return {
      platform: "xiaohongshu",
      id: noteId,
      noteId,
      title,
      pageUrl,
      cover: metadata.cover,
      author: metadata.author,
      mediaCandidates,
      errorCode,
      message,
      diagnostics: {
        platform: "xiaohongshu",
        pageUrl,
        title,
        noteId,
        urlNoteId,
        hasInitialState: Boolean(initialStateInfo.value),
        initialStateSource: initialStateInfo.source || "",
        noteFound,
        noteSearchSource: noteSearch.source || "",
        source: noteSearch.sourceKind || "none",
        cacheNoteIds: getHookCacheNoteIds(10),
        noteDetailMapSources: noteSearch.noteDetailMapSources || [],
        noteDetailMapKeys: noteSearch.noteDetailMapKeys || [],
        matchedNoteId: noteSearch.matchedNoteId || "",
        matchStrategy: noteSearch.matchStrategy || "none",
        hasVideoObject,
        videoElementCount: videoElementResult.videoElementCount,
        skippedBlobVideoCount: videoElementResult.skippedBlobVideoCount,
        candidateCount: mediaCandidates.length,
        topCandidateSource: topCandidate?.source || "",
        topCandidateHost: topCandidate ? getUrlHost(topCandidate.url) : "",
        candidateSources: mediaCandidates.slice(0, 12).map(item => ({
          kind: item.kind,
          source: item.source,
          score: item.score,
          host: getUrlHost(item.url)
        })),
        errorCode,
        message
      }
    };
  }

  function extractNoteIdFromUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return "";
    }

    const path = url.pathname || "";
    const match = path.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/i);
    if (!match) return "";
    return normalizeNoteId(match[1]);
  }

  function normalizeNoteId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const withoutQuery = raw.split(/[?#]/)[0].trim();
    let decoded = withoutQuery;
    try {
      decoded = decodeURIComponent(withoutQuery);
    } catch {
      decoded = withoutQuery;
    }

    return decoded.replace(/\s+/g, "").replace(/[^\w-]/g, "").slice(0, 80);
  }

  function readInitialState() {
    if (globalScope.__INITIAL_STATE__ && typeof globalScope.__INITIAL_STATE__ === "object") {
      return {
        value: globalScope.__INITIAL_STATE__,
        source: "window.__INITIAL_STATE__"
      };
    }

    const parsed = parseInitialStateFromScripts(collectScriptTexts(globalScope.document));
    return parsed;
  }

  function installHookMessageListener() {
    if (typeof globalScope.addEventListener !== "function") return;
    globalScope.addEventListener("message", handleHookMessageEvent);
  }

  function handleHookMessageEvent(event) {
    try {
      if (!event || event.source !== globalScope) return false;
      const data = event.data;
      if (!data || typeof data !== "object" || data[HOOK_MESSAGE_FLAG] !== true) return false;
      return storeHookNote(data.noteId, data.note);
    } catch {
      return false;
    }
  }

  function storeHookNote(noteId, note) {
    const cleanNoteId = normalizeNoteId(noteId) || getNoteIds(note)[0] || "";
    if (!cleanNoteId || !note || typeof note !== "object") return false;
    if (!looksLikeExactNote(note, cleanNoteId)) return false;
    if (!getVideoObject(note)) return false;

    if (hookNoteCache.has(cleanNoteId)) hookNoteCache.delete(cleanNoteId);
    hookNoteCache.set(cleanNoteId, note);
    while (hookNoteCache.size > HOOK_NOTE_CACHE_LIMIT) {
      const oldestKey = hookNoteCache.keys().next().value;
      hookNoteCache.delete(oldestKey);
    }
    return true;
  }

  function clearHookNoteCache() {
    hookNoteCache.clear();
  }

  function getHookCacheNoteIds(limit = 10) {
    const size = Math.max(0, Number(limit) || 0);
    if (!size) return [];
    return Array.from(hookNoteCache.keys()).slice(-size).reverse();
  }

  function findCachedHookNote(noteId = "") {
    const result = {
      note: null,
      source: "",
      noteDetailMapSources: [],
      noteDetailMapKeys: [],
      matchedNoteId: "",
      matchStrategy: "none",
      sourceKind: "none"
    };
    const cleanNoteId = normalizeNoteId(noteId);
    if (!cleanNoteId || !hookNoteCache.has(cleanNoteId)) return result;

    const note = hookNoteCache.get(cleanNoteId);
    if (!looksLikeExactNote(note, cleanNoteId)) {
      hookNoteCache.delete(cleanNoteId);
      return result;
    }

    hookNoteCache.delete(cleanNoteId);
    hookNoteCache.set(cleanNoteId, note);
    return {
      ...result,
      note,
      source: `hookCache.${cleanNoteId}`,
      matchedNoteId: cleanNoteId,
      matchStrategy: "exact",
      sourceKind: "cache"
    };
  }

  function collectScriptTexts(documentRef) {
    return Array.from(documentRef?.scripts || [])
      .map(script => script.textContent || "")
      .filter(text => text.includes("__INITIAL_STATE__"))
      .slice(0, 8);
  }

  function parseInitialStateFromScripts(scripts = []) {
    for (const text of scripts || []) {
      const parsed = parseInitialStateFromScript(text);
      if (parsed) {
        return {
          value: parsed,
          source: "script.__INITIAL_STATE__"
        };
      }
    }
    return { value: null, source: "" };
  }

  function parseInitialStateFromScript(text) {
    const markerIndex = String(text || "").indexOf("__INITIAL_STATE__");
    if (markerIndex < 0) return null;

    const objectText = extractBalancedObject(text, markerIndex);
    if (!objectText) return null;

    try {
      return JSON.parse(objectText);
    } catch {
      try {
        return JSON.parse(objectText.replace(/:\s*undefined\b/g, ":null"));
      } catch {
        return null;
      }
    }
  }

  function extractBalancedObject(text, startIndex) {
    const openIndex = text.indexOf("{", startIndex);
    if (openIndex < 0) return "";

    let depth = 0;
    let quote = "";
    let escaped = false;

    for (let index = openIndex; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = "";
        }
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

  function findNoteDetail(state, noteId = "") {
    const result = {
      note: null,
      source: "",
      noteDetailMapSources: [],
      noteDetailMapKeys: [],
      matchedNoteId: "",
      matchStrategy: "none",
      sourceKind: "none"
    };
    const cleanNoteId = normalizeNoteId(noteId);
    if (!state || typeof state !== "object" || !cleanNoteId) return result;

    const maps = getNoteDetailMaps(state);
    for (const item of maps) {
      result.noteDetailMapSources.push(item.source);
      result.noteDetailMapKeys.push({
        source: item.source,
        keys: getNoteDetailMapKeys(item.map)
      });
    }

    for (const item of maps) {
      const found = findExactNoteInMap(item.map, cleanNoteId, item.source);
      if (found.note) return { ...result, ...found, sourceKind: "initialState" };
    }

    for (const item of maps) {
      const found = findSingleNoteInMap(item.map, cleanNoteId, item.source);
      if (found.note) return { ...result, ...found, sourceKind: "initialState" };
    }

    return result;
  }

  function getNoteDetailMaps(state) {
    return [
      { map: state.note?.noteDetailMap, source: "state.note.noteDetailMap" },
      { map: state.noteDetailMap, source: "state.noteDetailMap" },
      { map: state.feed?.noteDetailMap, source: "state.feed.noteDetailMap" },
      { map: state.noteData?.noteDetailMap, source: "state.noteData.noteDetailMap" },
      { map: state.data?.noteDetailMap, source: "state.data.noteDetailMap" }
    ].filter(item => item.map && typeof item.map === "object");
  }

  function getNoteDetailMapKeys(map) {
    return Object.keys(map || {}).slice(0, 10).map(key => String(key).slice(0, 120));
  }

  function findExactNoteInMap(map, noteId = "", source = "noteDetailMap") {
    if (!map || typeof map !== "object" || !noteId) return { note: null, source: "" };

    for (const [key, value] of Object.entries(map)) {
      const cleanKey = normalizeNoteId(key);
      if (cleanKey !== noteId) continue;

      const keyed = unwrapNoteDetail(value);
      if (looksLikeExactNote(keyed, noteId)) {
        return {
          note: keyed,
          source: formatNoteDetailSource(source, key, value),
          matchedNoteId: noteId,
          matchStrategy: "exact"
        };
      }
    }

    return { note: null, source: "" };
  }

  function findSingleNoteInMap(map, noteId = "", source = "noteDetailMap") {
    if (!map || typeof map !== "object" || !noteId) return { note: null, source: "" };

    const notes = [];
    for (const [key, value] of Object.entries(map)) {
      const note = unwrapNoteDetail(value);
      if (looksLikeNoteDetail(note)) {
        notes.push({ key, value, note });
      }
    }

    if (notes.length !== 1) return { note: null, source: "" };

    const [single] = notes;
    if (!getNoteIds(single.note).includes(noteId)) return { note: null, source: "" };

    return {
      note: single.note,
      source: formatNoteDetailSource(source, single.key, single.value),
      matchedNoteId: noteId,
      matchStrategy: "single"
    };
  }

  function looksLikeNoteDetail(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (hasNotePayloadShape(value) || findTitle(value) || getNoteIds(value).length > 0)
    );
  }

  function formatNoteDetailSource(source, key, value) {
    return `${source}.${String(key).slice(0, 120)}${getNoteDetailSourceSuffix(value)}`;
  }

  function getNoteDetailSourceSuffix(value) {
    if (!value || typeof value !== "object") return "";
    if (value.note && typeof value.note === "object") return ".note";
    if (value.noteDetail && typeof value.noteDetail === "object") return ".noteDetail";
    if (value.detail && typeof value.detail === "object") return ".detail";
    return "";
  }

  function unwrapNoteDetail(value) {
    if (!value || typeof value !== "object") return value;
    return value.note || value.noteDetail || value.detail || value;
  }

  function looksLikeExactNote(value, noteId = "") {
    if (!value || typeof value !== "object") return false;
    const cleanNoteId = normalizeNoteId(noteId);
    const ids = getNoteIds(value);
    if (ids.length > 0 && cleanNoteId && !ids.includes(cleanNoteId)) return false;
    return Boolean(hasNotePayloadShape(value) || findTitle(value) || ids.includes(cleanNoteId));
  }

  function hasNotePayloadShape(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      (Object.prototype.hasOwnProperty.call(value, "type") || getVideoObject(value))
    );
  }

  function getNoteIds(value) {
    return [
      value.id,
      value.noteId,
      value.note_id,
      value.noteID,
      value.noteCard?.noteId,
      value.noteCard?.id
    ].map(normalizeNoteId).filter(Boolean);
  }

  function collectMediaCandidatesFromNote(note) {
    const video = getVideoObject(note);
    const candidates = [];
    if (!video) return candidates;

    addPreferredStreamCandidate(candidates, video);
    addSpecificVideoPaths(candidates, video);
    addOriginVideoKeyCandidates(candidates, video);
    collectVideoUrlsRecursively(video, candidates, "video-recursive", 72);
    return normalizeMediaCandidates(candidates);
  }

  function getVideoObject(note) {
    if (!note || typeof note !== "object") return null;
    return note.video ||
      note.videoInfo ||
      note.video_info ||
      note.noteVideo ||
      note.note_card?.video ||
      note.noteCard?.video ||
      null;
  }

  function extractNoteMetadata(note) {
    return {
      cover: extractNoteCover(note),
      author: extractNoteAuthor(note)
    };
  }

  function extractNoteCover(note) {
    if (!note || typeof note !== "object") return "";
    return normalizeImageUrl(
      pickImageUrl(note.cover) ||
      pickImageUrl(note.imageList?.[0]) ||
      pickImageUrl(note.image_list?.[0]) ||
      pickImageUrl(note.images?.[0]) ||
      pickImageUrl(note.note_card?.cover) ||
      pickImageUrl(note.noteCard?.cover) ||
      pickImageUrl(note.note_card?.imageList?.[0]) ||
      pickImageUrl(note.noteCard?.imageList?.[0])
    );
  }

  function extractNoteAuthor(note) {
    return String(
      note?.user?.nickname ||
      note?.userInfo?.nickname ||
      note?.user_info?.nickname ||
      note?.note_card?.user?.nickname ||
      note?.noteCard?.user?.nickname ||
      ""
    ).trim();
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
    return pickImageUrl(value.url) ||
      pickImageUrl(value.urlDefault) ||
      pickImageUrl(value.urlPre) ||
      pickImageUrl(value.url_default) ||
      pickImageUrl(value.url_pre) ||
      pickImageUrl(value.urls) ||
      pickImageUrl(value.url_list) ||
      pickImageUrl(value.urlList) ||
      pickImageUrl(value.infoList?.[0]) ||
      pickImageUrl(value.info_list?.[0]);
  }

  function addPreferredStreamCandidate(candidates, video) {
    const stream = getVideoStream(video);
    if (!stream || typeof stream !== "object") return;

    for (const codec of STREAM_CODECS) {
      const preferred = findFirstUsableStreamUrl(stream[codec]);
      if (preferred.url) {
        addUrlValue(candidates, preferred.url, 130, `video.media.stream.${codec}.${preferred.field}`);
        return;
      }
    }
  }

  function addSpecificVideoPaths(candidates, video) {
    const stream = getVideoStream(video);
    STREAM_CODECS.forEach((codec, codecIndex) => {
      addStreamEntries(candidates, stream?.[codec], 110 - codecIndex * 4, `video.media.stream.${codec}`);
    });

    addStreamEntries(candidates, stream, 86, "video.media.stream");
    addUrlValue(candidates, video.media?.masterUrl, 104, "video.media.masterUrl");
    addUrlValue(candidates, video.media?.url, 100, "video.media.url");
    addUrlValue(candidates, video.media?.videoUrl, 100, "video.media.videoUrl");
    addUrlValue(candidates, video.url, 96, "video.url");
    addUrlValue(candidates, video.videoUrl, 96, "video.videoUrl");
    addUrlValue(candidates, video.playUrl, 94, "video.playUrl");
    addUrlValue(candidates, video.play_url, 94, "video.play_url");
  }

  function getVideoStream(video) {
    return video.media?.stream || video.stream || video.video?.media?.stream || null;
  }

  function findFirstUsableStreamUrl(entries) {
    if (!entries) return { url: "", field: "" };

    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const found = findFirstUsableStreamUrl(entry);
        if (found.url) return found;
      }
      return { url: "", field: "" };
    }

    if (typeof entries !== "object") {
      const url = getUsableVideoUrl(entries);
      return url ? { url, field: "url" } : { url: "", field: "" };
    }

    const masterUrl = getUsableVideoUrl(entries.masterUrl);
    if (masterUrl) return { url: masterUrl, field: "masterUrl" };

    const backupUrls = getUsableVideoUrl(entries.backupUrls);
    if (backupUrls) return { url: backupUrls, field: "backupUrls" };

    const backupUrlsSnake = getUsableVideoUrl(entries.backup_urls);
    if (backupUrlsSnake) return { url: backupUrlsSnake, field: "backup_urls" };

    const url = getUsableVideoUrl(entries.url) ||
      getUsableVideoUrl(entries.videoUrl) ||
      getUsableVideoUrl(entries.playUrl);
    return url ? { url, field: "url" } : { url: "", field: "" };
  }

  function getUsableVideoUrl(value) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const url = normalizeMediaUrl(item);
      if (url && isLikelyXiaohongshuVideoUrl(url)) return url;
    }
    return "";
  }

  function addStreamEntries(candidates, entries, score, source) {
    if (!entries) return;
    if (Array.isArray(entries)) {
      for (const entry of entries) addStreamEntry(candidates, entry, score, source);
      return;
    }
    if (typeof entries === "object") {
      if (entries.masterUrl || entries.url || entries.backupUrls || entries.backup_urls) {
        addStreamEntry(candidates, entries, score, source);
        return;
      }
      for (const value of Object.values(entries)) addStreamEntries(candidates, value, score - 2, source);
    }
  }

  function addStreamEntry(candidates, entry, score, source) {
    if (!entry || typeof entry !== "object") {
      addUrlValue(candidates, entry, score, source);
      return;
    }

    addUrlValue(candidates, entry.masterUrl, score, `${source}.masterUrl`);
    addUrlValue(candidates, entry.url, score - 1, `${source}.url`);
    addUrlValue(candidates, entry.videoUrl, score - 1, `${source}.videoUrl`);
    addUrlValue(candidates, entry.playUrl, score - 2, `${source}.playUrl`);
    addUrlValue(candidates, entry.backupUrls, score - 6, `${source}.backupUrls`);
    addUrlValue(candidates, entry.backup_urls, score - 6, `${source}.backup_urls`);
  }

  function addOriginVideoKeyCandidates(candidates, video) {
    const key = String(video.consumer?.originVideoKey || video.originVideoKey || video.origin_video_key || "").trim();
    if (!key) return;

    if (/^https?:\/\//i.test(key) || key.startsWith("//")) {
      addUrlValue(candidates, key, 88, "video.consumer.originVideoKey");
      return;
    }

    const cleanKey = key.replace(/^\/+/, "");
    for (const host of ORIGIN_VIDEO_HOSTS) {
      addUrlValue(candidates, `https://${host}/${cleanKey}`, 84, `originVideoKey:${host}`);
    }
  }

  function collectVideoUrlsRecursively(value, candidates, source, score, depth = 0, seen = new Set()) {
    if (!value || depth > 8) return;
    if (typeof value === "string") {
      if (isLikelyXiaohongshuVideoUrl(value)) addUrlValue(candidates, value, score, source);
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) collectVideoUrlsRecursively(item, candidates, source, score - 1, depth + 1, seen);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const nextScore = /master|video|url|stream|backup/i.test(key) ? score : score - 3;
      collectVideoUrlsRecursively(child, candidates, `${source}.${key}`, nextScore, depth + 1, seen);
    }
  }

  function collectVideoElements(documentRef) {
    return Array.from(documentRef?.querySelectorAll?.("video") || []).map(video => ({
      currentSrc: video.currentSrc || "",
      src: video.src || "",
      sources: Array.from(video.querySelectorAll?.("source") || []).map(source => source.src || ""),
      visibleScore: globalScope.StepAsrPlatformAdapters?.visibleAreaScore?.(video) || 0
    }));
  }

  function collectVideoElementCandidates(videos = []) {
    const candidates = [];
    let skippedBlobVideoCount = 0;
    for (const video of videos || []) {
      const urls = [video.currentSrc, video.src, ...(video.sources || [])].filter(Boolean);
      for (const url of urls) {
        if (/^blob:/i.test(url)) {
          skippedBlobVideoCount += 1;
          continue;
        }
        addUrlValue(candidates, url, Number(video.visibleScore || 0) > 0 ? 80 : 56, "video-element");
      }
    }

    return {
      candidates: normalizeMediaCandidates(candidates),
      videoElementCount: videos.length,
      skippedBlobVideoCount
    };
  }

  function addUrlValue(candidates, value, score, source) {
    if (!value) return;
    const values = Array.isArray(value) ? value : [value];
    for (const raw of values) {
      const url = normalizeMediaUrl(raw);
      if (!url || !isLikelyXiaohongshuVideoUrl(url)) continue;
      candidates.push({
        url,
        kind: "video",
        score,
        source
      });
    }
  }

  function normalizeMediaCandidates(candidates) {
    if (globalScope.StepAsrPlatformAdapters?.normalizeMediaCandidates) {
      return globalScope.StepAsrPlatformAdapters.normalizeMediaCandidates(candidates);
    }

    const byUrl = new Map();
    for (const item of candidates || []) {
      const url = normalizeMediaUrl(item.url || "");
      if (!url) continue;
      byUrl.set(url, {
        url,
        kind: item.kind || "video",
        score: Number(item.score || 0),
        source: item.source || "page",
        hits: (byUrl.get(url)?.hits || 0) + 1
      });
    }
    return Array.from(byUrl.values()).sort((a, b) => b.score - a.score || b.hits - a.hits);
  }

  function isLikelyXiaohongshuVideoUrl(raw) {
    const url = normalizeMediaUrl(raw);
    if (!url) return false;
    const lower = url.toLowerCase();
    if (/\.(?:jpe?g|png|webp|gif|svg|css|js)(?:[?#]|$)/.test(lower)) return false;
    if (/\.(?:mp4|m4v|mov|webm)(?:[?#]|$)/.test(lower)) return true;
    if (lower.includes("xhscdn.com") && /(?:video|sns-video|stream|mp4|originvideo)/.test(lower)) return true;
    return false;
  }

  function normalizeMediaUrl(raw) {
    const value = cleanMediaUrl(raw);
    if (!value || /^(?:blob|data|filesystem):/i.test(value)) return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function normalizeImageUrl(raw) {
    const value = cleanMediaUrl(raw);
    if (!value || /^(?:blob|data|filesystem):/i.test(value)) return "";
    if (value.startsWith("//")) return `https:${value}`;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function cleanMediaUrl(raw) {
    return String(raw || "")
      .trim()
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u003[dD]/g, "=")
      .replace(/\\u003[aA]/g, ":")
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/[,;)\]}]+$/g, "");
  }

  function findTitle(note) {
    if (!note || typeof note !== "object") return "";
    return note.title ||
      note.displayTitle ||
      note.display_title ||
      note.desc ||
      note.shareInfo?.title ||
      note.share_info?.title ||
      note.note_card?.displayTitle ||
      note.note_card?.title ||
      note.noteCard?.displayTitle ||
      note.noteCard?.title ||
      "";
  }

  function getPageTitle(documentRef) {
    return normalizeTitle(
      documentRef?.querySelector?.('meta[property="og:title"]')?.content ||
      documentRef?.title ||
      "小红书笔记"
    );
  }

  function normalizeTitle(value) {
    return String(value || "")
      .replace(/\s+-\s+小红书.*$/u, "")
      .replace(/\s+小红书$/u, "")
      .trim();
  }

  function getUrlHost(rawUrl) {
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return "";
    }
  }

  globalScope.XiaohongshuAdapter = XiaohongshuAdapter;
  globalScope.StepAsrPlatformAdapters?.registerAdapter?.(XiaohongshuAdapter);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = XiaohongshuAdapter;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
