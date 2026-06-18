(function initDouyinTranscriptionCore(globalScope) {
  if (globalScope.DouyinTranscriptionCore) return;

  const DouyinTranscriptionCore = {
    buildHistoryItem,
    collectMediaCandidatesFromText,
    guessAudioFormat,
    normalizeMediaUrl,
    pickMedia,
    pickMediaByKind,
    pickPageMedia,
    prepareAudioForAsr,
    transcribePreparedAudio,
    runTranscriptionWorkflow
  };

  const STEP_AUDIO_MAX_AUDIO_DATA_BYTES = 10 * 1024 * 1024;
  const STEP_AUDIO_CHUNK_TARGET_DATA_BYTES = 9 * 1024 * 1024;

  function pickMedia(detail) {
    return pickMediaByKind(detail, "auto");
  }

  function pickMediaByKind(detail, requestedKind = "auto") {
    const candidates = collectDetailMediaCandidates(detail);
    const chosen = chooseMediaCandidate(candidates, requestedKind);
    if (!chosen?.url) {
      if (requestedKind === "audio") throw new Error("没有从抖音详情里提取到可下载的音频地址。");
      if (requestedKind === "video") throw new Error("没有从抖音详情里提取到可下载的视频地址。");
      throw new Error("没有从抖音详情里提取到可下载的音频或视频地址。");
    }

    return chosen;
  }

  function collectDetailMediaCandidates(detail) {
    const candidates = [];
    const music = detail?.music || {};
    addUrlList(candidates, music.play_url?.url_list, "audio");
    addUrlList(candidates, music.play_url?.uri, "audio");
    addUrlList(candidates, music.cover_large?.url_list, "ignore");
    addUrlList(candidates, music.url, "audio");
    addUrlList(candidates, detail?.music_url, "audio");

    const bitRates = Array.isArray(detail?.video?.bit_rate) ? detail.video.bit_rate : [];
    bitRates
      .slice()
      .sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))
      .forEach(item => addUrlList(candidates, item.play_addr?.url_list, "video"));
    addUrlList(candidates, detail?.video?.play_addr?.url_list, "video");

    return candidates;
  }

  function pickPageMedia(candidates = [], requestedKind = "auto") {
    const ranked = rankMediaCandidates(candidates);
    const chosen = chooseMediaCandidate(ranked, requestedKind);
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

  function chooseMediaCandidate(candidates, requestedKind = "auto") {
    if (requestedKind === "audio" || requestedKind === "video") {
      return candidates.find(item => item.kind === requestedKind) || null;
    }
    return candidates.find(item => item.kind === "audio") || candidates.find(item => item.kind === "video") || null;
  }

  function collectMediaCandidatesFromText(text, score = 0, source = "text") {
    if (!text) return [];

    const candidates = [];
    const seen = new Set();
    for (const variant of textVariants(text)) {
      const matches = variant.match(/(?:https?:)?\/\/[^\s"'<>\\]+/g) || [];
      for (const raw of matches) {
        const url = normalizeMediaUrl(cleanMediaUrl(raw));
        if (!url || !isLikelyMediaUrl(url)) continue;
        const key = `${url}:${source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          url,
          kind: inferMediaKind(url),
          score: score + mediaUrlBonus(url),
          source
        });
      }
    }

    return candidates;
  }

  function addUrlList(candidates, value, kind) {
    if (!value || kind === "ignore") return;
    const list = Array.isArray(value) ? value : [value];
    for (const raw of list) {
      if (typeof raw !== "string" || !raw) continue;
      const url = normalizeMediaUrl(raw);
      if (!url) continue;
      candidates.push({ url, kind });
    }
  }

  function normalizeMediaUrl(raw) {
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^https?:\/\//.test(raw)) return raw;
    return "";
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

  function textVariants(value) {
    const raw = String(value || "");
    const cleaned = cleanMediaUrl(raw);
    return unique([
      raw,
      cleaned,
      safeDecode(raw),
      safeDecode(cleaned),
      safeDecode(safeDecode(cleaned))
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

  function isLikelyMediaUrl(url) {
    const lower = url.toLowerCase();
    if (/\.(?:jpe?g|png|webp|gif|svg|css|js)(?:[?#]|$)/.test(lower)) return false;
    if (/\.(?:mp3|m4a|aac|wav|ogg|mp4|m4v|mov|webm)(?:[?#]|$)/.test(lower)) return true;
    if (lower.includes("mime_type=audio") || lower.includes("mime_type=video")) return true;
    if (lower.includes("/aweme/v1/play") || lower.includes("/aweme/v1/web/play")) return true;
    if (lower.includes("douyinvod.com")) return true;
    if (lower.includes("xhscdn.com") && /(?:video|sns-video|stream|mp4|originvideo)/.test(lower)) return true;
    if ((lower.includes("douyincdn.com") || lower.includes("douyin.com")) && /(?:play|video|audio|music|mime_type)/.test(lower)) return true;
    return false;
  }

  function inferMediaKind(url) {
    const lower = url.toLowerCase();
    if (lower.includes("audio") || lower.includes("music") || /\.(?:mp3|m4a|aac|wav|ogg)(?:[?#]|$)/.test(lower)) {
      return "audio";
    }
    return "video";
  }

  function mediaUrlBonus(url) {
    const lower = url.toLowerCase();
    if (lower.includes("mime_type=audio") || /\.(?:mp3|m4a|aac|wav|ogg)(?:[?#]|$)/.test(lower)) return 8;
    if (lower.includes("mime_type=video") || /\.(?:mp4|m4v|mov|webm)(?:[?#]|$)/.test(lower)) return 6;
    if (lower.includes("/aweme/v1/play") || lower.includes("douyinvod.com")) return 5;
    if (lower.includes("xhscdn.com") && /(?:video|sns-video)/.test(lower)) return 5;
    return 0;
  }

  function rankMediaCandidates(candidates) {
    const byUrl = new Map();
    for (const item of candidates || []) {
      const url = normalizeMediaUrl(cleanMediaUrl(item.url || ""));
      if (!url || !isLikelyMediaUrl(url)) continue;
      const candidate = {
        url,
        kind: item.kind || inferMediaKind(url),
        score: Number(item.score || 0),
        source: item.source || "page",
        hits: 1
      };
      const existing = byUrl.get(url);
      if (!existing) {
        byUrl.set(url, candidate);
        continue;
      }
      existing.hits += 1;
      if (candidate.score > existing.score) {
        existing.score = candidate.score;
        existing.kind = candidate.kind;
        existing.source = candidate.source;
      }
    }

    return Array.from(byUrl.values()).sort((a, b) =>
      b.score - a.score ||
      mediaKindRank(b.kind) - mediaKindRank(a.kind) ||
      b.hits - a.hits
    );
  }

  function mediaKindRank(kind) {
    return kind === "audio" ? 2 : 1;
  }

  function guessAudioFormat(url, contentType) {
    const source = `${contentType} ${url}`.toLowerCase();
    if (source.includes("audio/mpeg") || source.includes(".mp3") || source.includes("mime_type=audio_mp3")) {
      return { type: "mp3" };
    }
    if (source.includes("audio/wav") || source.includes("audio/x-wav") || source.includes(".wav")) {
      return { type: "wav" };
    }
    if (source.includes("audio/ogg") || source.includes(".ogg")) {
      return { type: "ogg" };
    }
    if (source.includes("audio/pcm") || source.includes(".pcm")) {
      return { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 };
    }
    return { type: "unknown" };
  }

  async function prepareAudioForAsr(mediaFile, settings, convertMediaToPcm) {
    const supportedDirectFormat = ["mp3", "wav", "ogg"].includes(mediaFile.guessedFormat.type);
    const directChunkableFormat = mediaFile.guessedFormat.type === "mp3";
    const mediaDataBytes = getAudioDataByteLength(mediaFile);
    const exceedsStepAudioLimit = mediaDataBytes > STEP_AUDIO_MAX_AUDIO_DATA_BYTES;
    const shouldConvert =
      settings.convertToPcm === "always" ||
      (settings.convertToPcm === "auto" && (mediaFile.guessedFormat.type === "unknown" || (exceedsStepAudioLimit && !directChunkableFormat)));

    if (!shouldConvert && supportedDirectFormat) {
      if (exceedsStepAudioLimit) {
        return {
          chunks: mediaFile.remoteChunkable
            ? buildRemoteAudioChunks(mediaFile, { type: mediaFile.guessedFormat.type })
            : splitAudioBase64(mediaFile.base64, { type: mediaFile.guessedFormat.type }),
          format: { type: mediaFile.guessedFormat.type }
        };
      }
      return {
        data: mediaFile.base64,
        format: { type: mediaFile.guessedFormat.type }
      };
    }

    if (settings.convertToPcm === "never" && supportedDirectFormat && exceedsStepAudioLimit) {
      throw new Error("当前音频超过 StepAudio 10MB 限制。请把音频转码设置改为“自动”，扩展会自动切片转写。");
    }

    if (settings.convertToPcm === "never" && !supportedDirectFormat) {
      throw new Error("当前媒体不是 StepAudio 直接支持的 mp3/wav/ogg。请把音频转码设置改为“自动”。");
    }

    if (typeof convertMediaToPcm !== "function") {
      throw new Error("缺少音频转码函数。");
    }

    const converted = await convertMediaToPcm(mediaFile, {
      maxAudioDataBytes: STEP_AUDIO_MAX_AUDIO_DATA_BYTES,
      chunkTargetDataBytes: STEP_AUDIO_CHUNK_TARGET_DATA_BYTES
    });
    if (Array.isArray(converted.chunks) && converted.chunks.length) {
      return {
        chunks: converted.chunks,
        format: converted.format
      };
    }

    const convertedDataBytes = getBase64DataByteLength(converted.base64);
    if (convertedDataBytes > STEP_AUDIO_MAX_AUDIO_DATA_BYTES) {
      return {
        chunks: splitAudioBase64(converted.base64, converted.format),
        format: converted.format
      };
    }

    return {
      data: converted.base64,
      format: converted.format
    };
  }

  async function transcribePreparedAudio(prepared, settings, callStepAudioAsr, options = {}) {
    if (typeof callStepAudioAsr !== "function") throw new Error("缺少转写工作流依赖：callStepAudioAsr。");
    const chunks = Array.isArray(prepared?.chunks) ? prepared.chunks : [];
    if (!chunks.length) {
      return callStepAudioAsr(prepared, settings, {
        signal: options.signal,
        onTextDelta: options.onTextDelta
      });
    }

    const texts = [];
    const warnings = [];
    try {
      for (const chunk of chunks) {
        if (typeof options.onChunkStart === "function") {
          await options.onChunkStart(chunk);
        }
        const resolvedChunk = chunk.data || typeof options.resolveAudioChunk !== "function"
          ? chunk
          : await options.resolveAudioChunk(chunk);
        let chunkText = "";
        const result = await callStepAudioAsr({
          data: resolvedChunk.data,
          format: resolvedChunk.format || chunk.format || prepared.format
        }, settings, {
          signal: options.signal,
          onTextDelta: delta => {
            chunkText += delta;
            if (typeof options.onTextDelta === "function") {
              options.onTextDelta(delta, [...texts, chunkText].filter(Boolean).join("\n"));
            }
          }
        });
        const text = String(result?.text || "").trim();
        if (text) texts.push(text);
        if (result?.warning) warnings.push(result.warning);
      }
    } finally {
      if (typeof options.releaseAudioChunks === "function") {
        await options.releaseAudioChunks(chunks).catch(() => {});
      }
    }

    return {
      text: texts.join("\n"),
      warning: warnings.filter(Boolean).join("\n")
    };
  }

  function getAudioDataByteLength(mediaFile = {}) {
    if (mediaFile.base64) return getBase64DataByteLength(mediaFile.base64);
    if (Number.isFinite(mediaFile.bytes) && mediaFile.bytes >= 0) return estimateBase64DataByteLength(mediaFile.bytes);
    return 0;
  }

  function getBase64DataByteLength(base64) {
    return String(base64 || "").replace(/\s/g, "").length;
  }

  function estimateBase64DataByteLength(byteLength) {
    return Math.ceil(Math.max(0, byteLength) / 3) * 4;
  }

  function splitAudioBase64(base64, format = {}) {
    const bytes = base64ToUint8Array(base64);
    const chunkSize = getChunkByteSize(format);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunkBytes = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      chunks.push({
        data: uint8ArrayToBase64(chunkBytes),
        format,
        index: chunks.length + 1,
        total: 0
      });
    }

    const total = chunks.length;
    return chunks.map(chunk => ({ ...chunk, total }));
  }

  function buildRemoteAudioChunks(mediaFile = {}, format = {}) {
    const totalBytes = Math.max(0, Number(mediaFile.bytes || 0));
    if (!mediaFile.url || !totalBytes) throw new Error("缺少可分片读取的远程音频信息。");
    const chunkSize = getChunkByteSize(format);
    const chunks = [];
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
      chunks.push({
        url: mediaFile.url,
        rangeStart: offset,
        rangeEnd: Math.min(offset + chunkSize, totalBytes) - 1,
        format,
        index: chunks.length + 1,
        total: 0
      });
    }

    const total = chunks.length;
    return chunks.map(chunk => ({ ...chunk, total }));
  }

  function getChunkByteSize(format = {}) {
    const frameBytes = getAudioFrameBytes(format);
    const rawTargetBytes = Math.floor(STEP_AUDIO_CHUNK_TARGET_DATA_BYTES / 4) * 3;
    return Math.max(frameBytes, Math.floor(rawTargetBytes / frameBytes) * frameBytes);
  }

  function getAudioFrameBytes(format = {}) {
    if (format.type !== "pcm") return 1;
    const bytesPerSample = Math.max(1, Math.ceil(Number(format.bits || 16) / 8));
    const channels = Math.max(1, Number(format.channel || 1));
    return bytesPerSample * channels;
  }

  function base64ToUint8Array(base64) {
    const value = String(base64 || "");
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function uint8ArrayToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

	  function buildHistoryItem(input) {
	    const text = String(input.text || "").trim();
	    const platform = input.platform || input.payload?.platform || input.context?.platform || "douyin";
	    const mediaId = input.mediaId ||
	      input.payload?.mediaId ||
	      input.payload?.id ||
	      input.payload?.noteId ||
	      input.context?.mediaId ||
	      input.context?.id ||
	      input.context?.noteId ||
	      input.awemeId ||
	      "";
	    const fallbackTitle = platform === "xiaohongshu" ? "小红书笔记" : "抖音视频";
	    return {
      id: input.id || `${input.now || Date.now()}-${input.randomHex || "000000"}`,
      text,
      platform,
      mediaId,
      noteId: platform === "xiaohongshu" ? mediaId : "",
      title: input.payload?.title || input.context?.title || input.detail?.desc || fallbackTitle,
      pageUrl: input.payload?.pageUrl || input.context?.pageUrl || input.tabUrl || "",
      cover: extractHistoryCover(input, platform),
      author: extractHistoryAuthor(input, platform),
      awemeId: input.awemeId || input.payload?.awemeId || input.context?.awemeId || (platform === "douyin" ? mediaId : ""),
      mediaUrl: input.media?.url || "",
      mediaKind: input.media?.kind || "",
      format: input.prepared?.format || null,
	      createdAt: input.createdAt || new Date(input.now || Date.now()).toISOString()
	    };
	  }

	  function extractHistoryCover(input, platform) {
	    return normalizeHistoryImageUrl(input.payload?.cover) ||
	      normalizeHistoryImageUrl(input.context?.cover) ||
	      (platform === "douyin" ? extractDouyinDetailCover(input.detail) : "");
	  }

	  function extractHistoryAuthor(input, platform) {
	    return String(
	      input.payload?.author ||
	      input.context?.author ||
	      (platform === "douyin" ? input.detail?.author?.nickname : "") ||
	      ""
	    ).trim();
	  }

	  function extractDouyinDetailCover(detail) {
	    if (!detail || typeof detail !== "object") return "";
	    return normalizeHistoryImageUrl(
	      pickHistoryImageUrl(detail.video?.cover) ||
	      pickHistoryImageUrl(detail.video?.origin_cover) ||
	      pickHistoryImageUrl(detail.video?.originCover)
	    );
	  }

	  function pickHistoryImageUrl(value) {
	    if (!value) return "";
	    if (typeof value === "string") return value;
	    if (Array.isArray(value)) {
	      for (const item of value) {
	        const url = pickHistoryImageUrl(item);
	        if (url) return url;
	      }
	      return "";
	    }
	    if (typeof value !== "object") return "";
	    return pickHistoryImageUrl(value.url_list) ||
	      pickHistoryImageUrl(value.urlList) ||
	      pickHistoryImageUrl(value.url) ||
	      pickHistoryImageUrl(value.uri);
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

	  async function runTranscriptionWorkflow(input = {}, deps = {}) {
	    const payload = input.payload || {};
	    const tab = input.tab || {};
	    const settings = input.settings || {};

	    if (!tab?.id) throw new Error("没有拿到当前标签页。");
	    if (!settings.apiKey) throw new Error("请先在侧边栏保存 StepFun API Key。");

	    if (payload.platform && payload.platform !== "douyin") {
	      return runDirectMediaWorkflow(input, deps);
	    }

	    await sendWorkflowStatus(deps, tab.id, payload.awemeId ? "正在读取抖音视频详情..." : "正在识别当前视频 ID...");
	    const context = payload.awemeId
	      ? payload
	      : await requireWorkflowFunction(deps.getPageContext, "getPageContext")(tab.id);
	    const awemeId = payload.awemeId || context.awemeId;
	    if (!awemeId) {
	      throw new Error("没有识别到当前视频 ID。请先点“检测视频 ID”，如果仍失败，复制诊断信息继续排查。");
	    }

	    await sendWorkflowStatus(deps, tab.id, `已识别视频 ID：${awemeId}，正在读取详情...`);
	    let detail = null;
	    let media = null;
	    try {
	      detail = await requireWorkflowFunction(deps.getAwemeDetail, "getAwemeDetail")(tab.id, awemeId);
	      media = pickMedia(detail);
	    } catch (error) {
	      await sendWorkflowStatus(deps, tab.id, "详情接口不可用，正在从当前页面提取媒体地址...");
	      media = await requireWorkflowFunction(deps.getPageMedia, "getPageMedia")(tab.id, normalizeWorkflowError(error));
	    }

	    const sourceLabel = media.source ? `，来源：${media.source}` : "";
	    await sendWorkflowStatus(deps, tab.id, `正在下载音频资源：${media.kind === "audio" ? "音乐音轨" : "视频音轨"}${sourceLabel}...`);
	    const mediaFile = await requireWorkflowFunction(deps.fetchMediaFile, "fetchMediaFile")(media.url);

	    await sendWorkflowStatus(deps, tab.id, "正在准备 ASR 请求...");
	    const prepared = await prepareAudioForAsr(mediaFile, settings, deps.convertMediaToPcm);

	    await sendWorkflowStatus(deps, tab.id, "正在调用 StepAudio ASR...");
	    const asrResult = await transcribePreparedAudio(
	      prepared,
	      settings,
      requireWorkflowFunction(deps.callStepAudioAsr, "callStepAudioAsr"),
      {
        onChunkStart: chunk => sendWorkflowStatus(deps, tab.id, `正在调用 StepAudio ASR（${chunk.index}/${chunk.total}）...`),
        onTextDelta: (delta, text) => deps.sendTranscriptionDelta?.(tab.id, delta, text),
        signal: deps.signal,
        resolveAudioChunk: deps.resolveAudioChunk,
        releaseAudioChunks: deps.releaseAudioChunks
      }
    );
	    const cleanText = String(asrResult?.text || "").trim();
	    if (!cleanText) throw new Error("ASR 没有返回有效文本。");

	    const now = typeof deps.now === "function" ? deps.now() : Date.now();
	    const randomHex = typeof deps.randomHex === "function" ? deps.randomHex() : Math.random().toString(16).slice(2);
	    const item = buildHistoryItem({
	      text: cleanText,
	      payload,
	      context,
	      detail,
	      tabUrl: tab.url,
	      awemeId,
	      media,
	      prepared,
	      now,
	      randomHex
	    });

	    if (typeof deps.saveHistoryItem === "function") {
	      await deps.saveHistoryItem(item);
	    }
	    await sendWorkflowStatus(deps, tab.id, "转写完成。");
	    return { text: cleanText, item };
	  }

	  async function runDirectMediaWorkflow(input = {}, deps = {}) {
	    const payload = input.payload || {};
	    const tab = input.tab || {};
	    const settings = input.settings || {};
	    const platform = payload.platform || "unknown";
	    const platformLabel = getPlatformLabel(platform);

	    await sendWorkflowStatus(deps, tab.id, `正在检测当前${platformLabel}内容...`);
	    const payloadHasCandidates = Array.isArray(payload.mediaCandidates) && payload.mediaCandidates.length > 0;
	    const shouldUsePayloadContext = payloadHasCandidates || payload.errorCode === "no-video";
	    const context = shouldUsePayloadContext
	      ? payload
	      : await requireWorkflowFunction(deps.getPageContext, "getPageContext")(tab.id);

	    if (context.errorCode === "no-video") {
	      throw new Error(context.message || `当前${platformLabel}内容没有视频可转写。`);
	    }

	    const mediaId = payload.id || payload.mediaId || payload.noteId || context.id || context.mediaId || context.noteId || "";
	    const mediaCandidates = Array.isArray(context.mediaCandidates) ? context.mediaCandidates : [];
	    if (!mediaCandidates.length) {
	      throw new Error(context.message || `没有从当前${platformLabel}页面提取到可下载的视频地址。`);
	    }

	    await sendWorkflowStatus(deps, tab.id, mediaId ? `已识别${platformLabel} ID：${mediaId}，正在解析媒体地址...` : `正在解析${platformLabel}媒体地址...`);
	    const media = pickPageMedia(mediaCandidates, "auto");
	    const sourceLabel = media.source ? `，来源：${media.source}` : "";
	    await sendWorkflowStatus(deps, tab.id, `正在下载音频资源：${media.kind === "audio" ? "音乐音轨" : "视频音轨"}${sourceLabel}...`);
	    const mediaFile = await requireWorkflowFunction(deps.fetchMediaFile, "fetchMediaFile")(media.url);

	    await sendWorkflowStatus(deps, tab.id, "正在准备 ASR 请求...");
	    const prepared = await prepareAudioForAsr(mediaFile, settings, deps.convertMediaToPcm);

	    await sendWorkflowStatus(deps, tab.id, "正在调用 StepAudio ASR...");
	    const asrResult = await transcribePreparedAudio(
	      prepared,
	      settings,
      requireWorkflowFunction(deps.callStepAudioAsr, "callStepAudioAsr"),
      {
        onChunkStart: chunk => sendWorkflowStatus(deps, tab.id, `正在调用 StepAudio ASR（${chunk.index}/${chunk.total}）...`),
        onTextDelta: (delta, text) => deps.sendTranscriptionDelta?.(tab.id, delta, text),
        signal: deps.signal,
        resolveAudioChunk: deps.resolveAudioChunk,
        releaseAudioChunks: deps.releaseAudioChunks
      }
    );
	    const cleanText = String(asrResult?.text || "").trim();
	    if (!cleanText) throw new Error("ASR 没有返回有效文本。");

	    const now = typeof deps.now === "function" ? deps.now() : Date.now();
	    const randomHex = typeof deps.randomHex === "function" ? deps.randomHex() : Math.random().toString(16).slice(2);
	    const item = buildHistoryItem({
	      text: cleanText,
	      payload,
	      context,
	      tabUrl: tab.url,
	      platform,
	      mediaId,
	      media,
	      prepared,
	      now,
	      randomHex
	    });

	    if (typeof deps.saveHistoryItem === "function") {
	      await deps.saveHistoryItem(item);
	    }
	    await sendWorkflowStatus(deps, tab.id, "转写完成。");
	    return { text: cleanText, item };
	  }

	  function getPlatformLabel(platform) {
	    if (platform === "xiaohongshu") return "小红书";
	    if (platform === "douyin") return "抖音";
	    return "当前平台";
	  }

	  async function sendWorkflowStatus(deps, tabId, status) {
	    if (typeof deps.sendStatus === "function") {
	      await deps.sendStatus(tabId, status);
	    }
	  }

	  function requireWorkflowFunction(fn, name) {
	    if (typeof fn !== "function") throw new Error(`缺少转写工作流依赖：${name}。`);
	    return fn;
	  }

	  function normalizeWorkflowError(error) {
	    return error?.message || String(error || "未知错误");
	  }

	  function unique(values) {
	    return Array.from(new Set(values.filter(Boolean)));
	  }

  globalScope.DouyinTranscriptionCore = DouyinTranscriptionCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DouyinTranscriptionCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
