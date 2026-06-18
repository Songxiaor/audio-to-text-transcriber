(function initStepAudioClient(globalScope) {
  const StepAudioClient = {
    buildAsrRequestBody,
    callStepAudioAsr,
    createSilentPcmBase64,
    isOfficialStepFunEndpoint,
    normalizeApiError,
    normalizeApiKey,
	    parseHotwords,
	    readSseResult
	  };

  const STEP_PLAN_ASR_ENDPOINTS = [
    "https://api.stepfun.com/step_plan/v1/audio/asr/sse",
    "https://api.stepfun.ai/step_plan/v1/audio/asr/sse"
  ];
  const STEP_AUDIO_MAX_AUDIO_DATA_BYTES = 10 * 1024 * 1024;
	
	  async function callStepAudioAsr(audio, settings, options = {}) {
	    const apiKey = normalizeApiKey(settings.apiKey);
	    validateApiKey(apiKey);
	    validateAudioDataSize(audio);
	    const body = buildAsrRequestBody(audio, settings);
	    const endpoints = getEndpointCandidates(settings.endpoint);
	    let lastError = null;

	    for (let index = 0; index < endpoints.length; index += 1) {
	      const endpoint = endpoints[index];
	      try {
	        const response = await fetch(endpoint, {
	          method: "POST",
	          headers: {
	            "Authorization": `Bearer ${apiKey}`,
	            "Content-Type": "application/json",
	            "Accept": "text/event-stream"
	          },
	          body: JSON.stringify(body),
	          signal: options.signal
	        });

	        if (!response.ok) {
	          const text = await response.text().catch(() => "");
	          const error = makeApiError(response.status, text, endpoint);
	          lastError = error;
	          if (shouldRetryWithMirrorEndpoint(response.status, text) && index < endpoints.length - 1) continue;
	          throw error;
	        }

	        const result = await readSseResult(response, {
	          onTextDelta: options.onTextDelta
	        });
	        if (result.error) {
	          const error = makeApiError(200, result.error, endpoint);
	          lastError = error;
	          if (shouldRetryWithMirrorEndpoint(200, result.error) && index < endpoints.length - 1) continue;
	          if (options.probe && isProbeWarning(result.error)) {
	            return { text: result.text, warning: result.error || "", endpoint };
	          }
	          throw error;
	        }

	        const text = result.text;
	        if (!text.trim() && !options.allowEmpty) throw new Error("ASR 没有返回有效文本。");
	        return { text, warning: result.error || "", endpoint };
	      } catch (error) {
	        lastError = attachEndpoint(error, endpoint);
	        if (isNetworkError(error) && index < endpoints.length - 1) continue;
	        throw lastError;
	      }
	    }

	    throw lastError || new Error("StepAudio API 请求失败。");
	  }

  function normalizeApiKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    return raw
      .replace(/^authorization\s*:\s*/i, "")
      .replace(/^bearer\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  }

	  function isOfficialStepFunEndpoint(endpoint) {
	    try {
	      const url = new URL(endpoint);
	      return ["api.stepfun.com", "api.stepfun.ai"].includes(url.hostname);
	    } catch {
	      return false;
	    }
	  }

  function validateApiKey(apiKey) {
    if (!apiKey) throw new Error("API Key 不能为空。");
  }

	  function normalizeApiError(status, rawMessage = "") {
	    const detail = parseApiErrorDetail(rawMessage);
    const message = detail.message || String(rawMessage || "").trim();
    const type = detail.type || "";
    const lower = `${type} ${message}`.toLowerCase();

	    if (status === 401 || lower.includes("invalid_api_key") || lower.includes("incorrect api key")) {
	      return "StepAudio 服务端拒绝了当前鉴权。扩展会自动兼容 api.stepfun.com 与 api.stepfun.ai；如果套餐刚购买且未过期，请优先确认设置页 Endpoint 是否与 Step Plan 购买入口一致。";
	    }

    if (status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
      return "StepAudio API 权限不足。请确认当前 Step Plan 已开通 ASR 能力，并且 API Key 有调用 stepaudio-2.5-asr 的权限。";
    }

    if (status === 429 || lower.includes("quota") || lower.includes("rate limit") || lower.includes("insufficient")) {
      return "StepAudio 额度不足或触发限流。请检查 Step Plan 余额、套餐额度和调用频率。";
    }

    if (lower.includes("audio data size") || lower.includes("maximum allowed size")) {
      return `StepAudio 音频数据超过 10MB 请求限制。扩展会自动切片转写；请确认已重新加载最新版安装包后重试。${message ? `服务提示：${message.slice(0, 180)}` : ""}`;
    }

    if (status === 400 || lower.includes("invalid_request") || lower.includes("bad request")) {
      return `StepAudio 请求参数不被接受。请检查模型名、Endpoint、音频格式和转码设置。${message ? `服务提示：${message.slice(0, 180)}` : ""}`;
    }

    if (status >= 500) {
      return `StepAudio 服务暂时不可用（HTTP ${status}）。请稍后重试。${message ? `服务提示：${message.slice(0, 180)}` : ""}`;
    }

    if (message) {
      return `StepAudio 返回错误：${message.slice(0, 240)}`;
    }

	    return `StepAudio API 请求失败：HTTP ${status}`;
	  }

	  function getEndpointCandidates(endpoint) {
	    const value = String(endpoint || "").trim();
	    const normalized = normalizeEndpoint(value);
	    const mirror = getStepPlanMirrorEndpoint(normalized);
	    if (!mirror) return [value];
	    return [value, mirror].filter((item, index, list) => item && list.indexOf(item) === index);
	  }

	  function getStepPlanMirrorEndpoint(normalizedEndpoint) {
	    if (normalizedEndpoint === STEP_PLAN_ASR_ENDPOINTS[0]) return STEP_PLAN_ASR_ENDPOINTS[1];
	    if (normalizedEndpoint === STEP_PLAN_ASR_ENDPOINTS[1]) return STEP_PLAN_ASR_ENDPOINTS[0];
	    return "";
	  }

	  function normalizeEndpoint(endpoint) {
	    try {
	      const url = new URL(endpoint);
	      return `${url.protocol}//${url.host}${url.pathname}`;
	    } catch {
	      return "";
	    }
	  }

	  function shouldRetryWithMirrorEndpoint(status, rawMessage = "") {
	    const detail = parseApiErrorDetail(rawMessage);
	    const message = `${detail.type || ""} ${detail.message || rawMessage || ""}`.toLowerCase();
	    return [401, 403, 404].includes(status) ||
	      message.includes("invalid_api_key") ||
	      message.includes("incorrect api key") ||
	      message.includes("unauthorized") ||
	      message.includes("forbidden") ||
	      message.includes("permission");
	  }

	  function isProbeWarning(rawMessage = "") {
	    const message = String(rawMessage || "").toLowerCase();
	    return !(
	      message.includes("invalid_api_key") ||
	      message.includes("incorrect api key") ||
	      message.includes("unauthorized") ||
	      message.includes("forbidden") ||
	      message.includes("permission") ||
	      message.includes("quota") ||
	      message.includes("rate limit") ||
	      message.includes("insufficient")
	    );
	  }

	  function makeApiError(status, rawMessage, endpoint) {
	    const error = new Error(normalizeApiError(status, rawMessage));
	    error.status = status;
	    error.endpoint = normalizeEndpoint(endpoint) || endpoint;
	    return error;
	  }

	  function attachEndpoint(error, endpoint) {
	    if (error && typeof error === "object" && !error.endpoint) {
	      error.endpoint = normalizeEndpoint(endpoint) || endpoint;
	    }
	    return error;
	  }

	  function isNetworkError(error) {
	    if (error?.status) return false;
	    return /failed to fetch|network|load failed/i.test(error?.message || String(error || ""));
	  }

  function parseApiErrorDetail(rawMessage) {
    const text = String(rawMessage || "").trim();
    if (!text) return {};
    try {
      const json = JSON.parse(text);
      const error = json.error || json;
      return {
        message: error.message || json.message || text,
        type: error.type || json.type || ""
      };
    } catch {
      return { message: text, type: "" };
    }
  }

  function buildAsrRequestBody(audio, settings) {
    return {
      audio: {
        data: audio.data,
        input: {
          transcription: {
            language: settings.language,
            hotwords: parseHotwords(settings.hotwords),
            model: settings.model,
            enable_itn: settings.enableItn,
            enable_timestamp: false
          },
          format: audio.format
        }
      }
    };
  }

  function validateAudioDataSize(audio = {}) {
    const data = String(audio?.data || "").replace(/\s/g, "");
    if (!data) {
      throw new Error("当前 ASR 音频分片缺少 audio.data。请重新转写；如果仍出现，请联系维护者。");
    }
    const byteLength = data.length;
    if (byteLength > STEP_AUDIO_MAX_AUDIO_DATA_BYTES) {
      throw new Error(`当前音频分片超过 StepAudio 10MB 请求限制（${byteLength} bytes）。请重新点击转写；如果仍出现，请联系维护者。`);
    }
  }

  async function readSseResult(response, options = {}) {
    if (!response.body) throw new Error("当前浏览器不支持读取 SSE 响应流。");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let doneText = "";
    let errorText = "";

    const handleEvent = eventText => {
      const dataLines = eventText
        .split(/\r?\n/)
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim());
      if (!dataLines.length) return;

      const data = dataLines.join("\n");
      if (!data || data === "[DONE]") return;

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }

      if (event.type === "transcript.text.delta") {
        const delta = event.delta || "";
        fullText += delta;
        if (delta && typeof options.onTextDelta === "function") {
          options.onTextDelta(delta, fullText);
        }
      } else if (event.type === "transcript.text.done") {
        doneText = event.text || fullText;
      } else if (event.type === "error") {
        errorText = event.message || "StepAudio 返回识别错误。";
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n+/);
      buffer = events.pop() || "";

      for (const eventText of events) {
        handleEvent(eventText);
      }
    }

    if (buffer.trim()) handleEvent(buffer);

    return {
      text: doneText || fullText,
      error: errorText
    };
  }

  function parseHotwords(text) {
    return String(text || "")
      .split(/[\n,，]/)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }

  function createSilentPcmBase64(durationMs) {
    const sampleRate = 16000;
    const bytesPerSample = 2;
    const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
    return arrayBufferToBase64(new ArrayBuffer(sampleCount * bytesPerSample));
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

  globalScope.StepAudioClient = StepAudioClient;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = StepAudioClient;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
