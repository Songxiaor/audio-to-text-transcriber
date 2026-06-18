(function initXiaohongshuFeedHook(globalScope) {
  const INSTALLED_FLAG = "__stepasrXhsFeedHookInstalled";
  const HOOK_MESSAGE_FLAG = "__stepasrXhs";
  const DEFAULT_SCAN_OPTIONS = {
    maxDepth: 10,
    maxNodes: 1800,
    maxArrayItems: 80,
    maxObjectKeys: 100,
    maxMatches: 16
  };

  const api = {
    extractLikelyNoteDetailsFromPayload,
    normalizeNoteId
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (!shouldInstall(globalScope)) return;
  installHooks(globalScope);

  function shouldInstall(scope) {
    return Boolean(
      scope &&
      scope.window === scope &&
      scope.document &&
      typeof scope.postMessage === "function" &&
      !scope[INSTALLED_FLAG]
    );
  }

  function installHooks(scope) {
    try {
      Object.defineProperty(scope, INSTALLED_FLAG, {
        value: true,
        configurable: false,
        enumerable: false
      });
    } catch {
      scope[INSTALLED_FLAG] = true;
    }

    hookFetch(scope);
    hookXMLHttpRequest(scope);
  }

  function hookFetch(scope) {
    const originalFetch = scope.fetch;
    if (typeof originalFetch !== "function") return;

    scope.fetch = function stepasrXhsFetchHook() {
      const result = originalFetch.apply(this, arguments);
      if (!result || typeof result.then !== "function") return result;
      return result.then(response => {
        inspectFetchResponse(scope, response);
        return response;
      });
    };
  }

  function inspectFetchResponse(scope, response) {
    try {
      if (!response || typeof response.clone !== "function") return;
      response.clone().json()
        .then(payload => publishNotesFromPayload(scope, payload))
        .catch(() => {});
    } catch {
      // Keep page fetch behavior unchanged.
    }
  }

  function hookXMLHttpRequest(scope) {
    const NativeXMLHttpRequest = scope.XMLHttpRequest;
    if (!NativeXMLHttpRequest?.prototype) return;

    const prototype = NativeXMLHttpRequest.prototype;
    const originalSend = prototype.send;
    if (typeof originalSend !== "function") return;

    prototype.send = function stepasrXhsXhrSend() {
      try {
        this.addEventListener("loadend", () => {
          defer(() => inspectXhrResponse(scope, this));
        }, { once: true });
      } catch {
        // Keep the original XHR send behavior even if listener setup fails.
      }
      return originalSend.apply(this, arguments);
    };
  }

  function inspectXhrResponse(scope, xhr) {
    try {
      const responseType = String(xhr.responseType || "");
      let payload = null;
      if (responseType === "json") {
        payload = xhr.response;
      } else if (responseType === "" || responseType === "text") {
        payload = JSON.parse(xhr.responseText || "");
      } else {
        return;
      }
      publishNotesFromPayload(scope, payload);
    } catch {
      // Non-JSON and inaccessible responses are expected on the page.
    }
  }

  function publishNotesFromPayload(scope, payload) {
    try {
      const matches = extractLikelyNoteDetailsFromPayload(payload);
      for (const item of matches) {
        try {
          scope.postMessage({
            [HOOK_MESSAGE_FLAG]: true,
            noteId: item.noteId,
            note: item.note
          }, "*");
        } catch {
          // Do not let a bad structured clone affect the page request.
        }
      }
    } catch {
      // Network hook must be best-effort only.
    }
  }

  function extractLikelyNoteDetailsFromPayload(payload, options = {}) {
    const scanOptions = {
      ...DEFAULT_SCAN_OPTIONS,
      ...options
    };
    const matches = [];
    const seenObjects = new WeakSet();
    const seenNoteIds = new Set();
    let visitedNodes = 0;

    scan(payload, 0);
    return matches;

    function scan(value, depth) {
      if (!value || typeof value !== "object") return;
      if (depth > scanOptions.maxDepth) return;
      if (visitedNodes >= scanOptions.maxNodes) return;
      if (matches.length >= scanOptions.maxMatches) return;
      if (seenObjects.has(value)) return;

      seenObjects.add(value);
      visitedNodes += 1;

      const found = getLikelyNoteDetail(value);
      if (found && !seenNoteIds.has(found.noteId)) {
        seenNoteIds.add(found.noteId);
        matches.push(found);
        if (matches.length >= scanOptions.maxMatches) return;
      }

      if (Array.isArray(value)) {
        for (const child of value.slice(0, scanOptions.maxArrayItems)) {
          scan(child, depth + 1);
          if (visitedNodes >= scanOptions.maxNodes || matches.length >= scanOptions.maxMatches) return;
        }
        return;
      }

      const keys = Object.keys(value).slice(0, scanOptions.maxObjectKeys);
      for (const key of keys) {
        scan(value[key], depth + 1);
        if (visitedNodes >= scanOptions.maxNodes || matches.length >= scanOptions.maxMatches) return;
      }
    }
  }

  function getLikelyNoteDetail(value) {
    if (!value || typeof value !== "object") return null;

    const candidates = [
      value.note,
      value.noteDetail,
      value.detail,
      value.note_card,
      value.noteCard,
      value
    ].filter(item => item && typeof item === "object" && !Array.isArray(item));

    for (const candidate of candidates) {
      const noteId = normalizeNoteId(getRawNoteId(candidate) || getRawNoteId(value));
      if (!noteId) continue;

      const video = getVideoObject(candidate);
      if (!hasHookVideoShape(video)) continue;

      const note = getRawNoteId(candidate) ? candidate : {
        ...candidate,
        id: noteId
      };
      return { noteId, note };
    }

    return null;
  }

  function getRawNoteId(value) {
    if (!value || typeof value !== "object") return "";
    return value.id || value.note_id || value.noteId || value.noteID || "";
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

  function hasHookVideoShape(video) {
    return Boolean(
      video &&
      typeof video === "object" &&
      (
        video.media?.stream ||
        video.consumer?.originVideoKey ||
        video.originVideoKey ||
        video.origin_video_key
      )
    );
  }

  function defer(callback) {
    try {
      if (typeof globalScope.queueMicrotask === "function") {
        globalScope.queueMicrotask(callback);
        return;
      }
    } catch {
      // Fall through to Promise-based defer.
    }
    Promise.resolve().then(callback).catch(() => {});
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
