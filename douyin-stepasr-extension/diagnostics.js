(function initStepAsrDiagnostics(globalScope) {
  if (globalScope.StepAsrDiagnostics) return;

	  const StepAsrDiagnostics = {
	    buildDiagnosticsReport,
	    countListItems,
		    safeDiagnosticText,
		    safeEndpoint,
		    safePageUrl
	  };

  function buildDiagnosticsReport(input = {}) {
    const manifest = input.manifest || {};
    const settings = input.settings || {};
	    const permissions = input.permissions || {};
	    const history = Array.isArray(input.history) ? input.history : [];
	    const environment = input.environment || {};
		    const lastDetection = input.lastDetection || null;
		    const lastApiTest = input.lastApiTest || null;

	    const latestHistory = history[0] || null;
	    const lines = [
      "StepAudio Douyin Transcriber diagnostics",
      `generatedAt: ${input.generatedAt || new Date().toISOString()}`,
      `extensionName: ${manifest.name || ""}`,
      `extensionVersion: ${manifest.version || ""}`,
      `manifestVersion: ${manifest.manifest_version || ""}`,
      `browserUserAgent: ${environment.userAgent || ""}`,
      `platform: ${environment.platform || ""}`,
      `language: ${environment.language || ""}`,
      "",
      "[settings]",
      `endpoint: ${safeEndpoint(settings.endpoint)}`,
      `model: ${settings.model || ""}`,
      `language: ${settings.language || ""}`,
      `apiKeyConfigured: ${Boolean(String(settings.apiKey || "").trim())}`,
      `enableItn: ${Boolean(settings.enableItn)}`,
      `convertToPcm: ${settings.convertToPcm || ""}`,
      `hotwordCount: ${countListItems(settings.hotwords)}`,
      `promptConfigured: ${Boolean(String(settings.prompt || "").trim())}`,
      "",
	      "[permissions]",
		      `endpointPermission: ${permissionLabel(permissions.endpointPermission)}`,
		      `stepFunComPermission: ${permissionLabel(permissions.stepFunComPermission)}`,
		      `stepFunAiPermission: ${permissionLabel(permissions.stepFunAiPermission)}`,
		      `officialStepFunPermission: ${permissionLabel(permissions.officialStepFunPermission)}`,
		      `douyinHostPermission: ${permissionLabel(permissions.douyinHostPermission)}`,
		      `xiaohongshuHostPermission: ${permissionLabel(permissions.xiaohongshuHostPermission)}`,
		      `xiaohongshuCdnPermission: ${permissionLabel(permissions.xiaohongshuCdnPermission)}`,
		      "",
		      "[lastApiTest]",
		      `apiTestedAt: ${lastApiTest?.testedAt || ""}`,
		      `apiTestOk: ${lastApiTest?.ok ?? ""}`,
		      `apiTestEndpoint: ${safeEndpoint(lastApiTest?.endpoint)}`,
		      `apiTestModel: ${lastApiTest?.model || ""}`,
		      `apiTestLanguage: ${lastApiTest?.language || ""}`,
		      `apiTestConvertToPcm: ${lastApiTest?.convertToPcm || ""}`,
		      `apiTestKeyConfigured: ${lastApiTest?.apiKeyConfigured ?? ""}`,
		      `apiTestKeyLength: ${lastApiTest?.apiKeyLength ?? ""}`,
		      `apiTestMessage: ${safeDiagnosticText(lastApiTest?.message)}`,
		      `apiTestError: ${safeDiagnosticText(lastApiTest?.error)}`,
		      "",
		      "[lastDetection]",
	      `detectedAt: ${lastDetection?.detectedAt || ""}`,
	      `detectedPlatform: ${lastDetection?.platform || ""}`,
	      `detectedMediaId: ${lastDetection?.mediaId || ""}`,
	      `detectedAwemeId: ${lastDetection?.awemeId || ""}`,
	      `detectedNoteId: ${lastDetection?.noteId || ""}`,
	      `detectedSource: ${lastDetection?.source || ""}`,
	      `detectedPageUrl: ${safePageUrl(lastDetection?.pageUrl)}`,
	      `detectedTitleLength: ${lastDetection?.titleLength ?? ""}`,
	      `detectedVideoCount: ${lastDetection?.diagnostics?.videoCount ?? ""}`,
	      `detectedVisibleVideoCount: ${lastDetection?.diagnostics?.visibleVideoCount ?? ""}`,
	      `detectedLinkCandidateCount: ${lastDetection?.diagnostics?.linkCandidateCount ?? ""}`,
	      `detectedCandidateCount: ${lastDetection?.diagnostics?.candidateCount ?? ""}`,
	      `detectedHasOgUrl: ${lastDetection?.diagnostics?.hasOgUrl ?? ""}`,
	      `detectedHasCanonical: ${lastDetection?.diagnostics?.hasCanonical ?? ""}`,
	      `detectedTopCandidates: ${formatDetectionCandidates(lastDetection?.diagnostics?.topCandidates)}`,
	      "",
	      "[history]",
	      `historyCount: ${history.length}`,
	      `latestCreatedAt: ${latestHistory?.createdAt || ""}`,
      `latestPlatform: ${latestHistory?.platform || ""}`,
      `latestMediaId: ${latestHistory?.mediaId || ""}`,
      `latestAwemeId: ${latestHistory?.awemeId || ""}`,
      `latestMediaKind: ${latestHistory?.mediaKind || ""}`,
      `latestFormat: ${latestHistory?.format?.type || ""}`
    ];

    return lines.join("\n");
  }

	  function safeEndpoint(endpoint) {
	    if (!endpoint) return "";
	    try {
	      const url = new URL(endpoint);
	      if (!["http:", "https:"].includes(url.protocol)) return "invalid";
	      return `${url.protocol}//${url.host}${url.pathname}`;
	    } catch {
	      return "invalid";
	    }
	  }

	  function safePageUrl(pageUrl) {
	    if (!pageUrl) return "";
	    try {
	      const url = new URL(pageUrl);
	      if (!["http:", "https:"].includes(url.protocol)) return "invalid";
	      return `${url.protocol}//${url.host}${url.pathname}`;
	    } catch {
	      return "invalid";
	    }
	  }

	  function safeDiagnosticText(text) {
	    return String(text || "")
	      .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
	      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted-token]")
	      .replace(/\s+/g, " ")
	      .trim()
	      .slice(0, 240);
	  }

	  function formatDetectionCandidates(candidates) {
	    if (!Array.isArray(candidates) || !candidates.length) return "";
	    return candidates
	      .slice(0, 5)
	      .map(item => `${item.id || ""}:${item.score ?? ""}:${item.hits ?? ""}:${item.source || ""}`)
	      .join(",");
	  }

  function countListItems(text) {
    return String(text || "")
      .split(/[\n,，]/)
      .map(item => item.trim())
      .filter(Boolean).length;
  }

  function permissionLabel(value) {
    if (value === true) return "granted";
    if (value === false) return "missing";
    return "unknown";
  }

  globalScope.StepAsrDiagnostics = StepAsrDiagnostics;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = StepAsrDiagnostics;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
