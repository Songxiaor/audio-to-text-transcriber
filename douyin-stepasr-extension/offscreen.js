const pcmSessions = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "STEPASR_CONVERT_TO_PCM") {
    convertToPcm(message.payload)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "STEPASR_GET_PCM_CHUNK") {
    getPcmChunk(message.payload)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "STEPASR_RELEASE_PCM_SESSION") {
    releasePcmSession(message.payload);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function convertToPcm(payload = {}) {
  const sourceBuffer = payload.url
    ? await fetchMediaArrayBuffer(payload.url)
    : base64ToArrayBuffer(payload.base64);
  if (!sourceBuffer.byteLength) throw new Error("待转码的音频为空。");

  const AudioContextCtor = self.AudioContext || self.webkitAudioContext;
  const audioContext = new AudioContextCtor();
  let decoded;

  try {
    decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
  } finally {
    await audioContext.close().catch(() => {});
  }

  const targetRate = 16000;
  const targetLength = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, targetLength, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  const pcmBuffer = float32ToPcm16(samples);
  const format = {
    type: "pcm",
    codec: "pcm_s16le",
    rate: targetRate,
    bits: 16,
    channel: 1
  };
  const maxAudioDataBytes = normalizePositiveInteger(payload.maxAudioDataBytes, 10 * 1024 * 1024);
  const chunkTargetDataBytes = normalizePositiveInteger(payload.chunkTargetDataBytes, 9 * 1024 * 1024);
  const dataBytes = estimateBase64DataByteLength(pcmBuffer.byteLength);

  if (dataBytes <= maxAudioDataBytes) {
    return {
      base64: arrayBufferToBase64(pcmBuffer),
      duration: rendered.duration,
      format
    };
  }

  const sessionId = createSessionId();
  const chunks = splitPcmBuffer(pcmBuffer, format, chunkTargetDataBytes);
  pcmSessions.set(sessionId, {
    chunks,
    format,
    duration: rendered.duration,
    createdAt: Date.now()
  });

  return {
    sessionId,
    duration: rendered.duration,
    format,
    chunks: chunks.map((chunk, index) => ({
      sessionId,
      index: index + 1,
      total: chunks.length,
      format
    }))
  };
}

async function fetchMediaArrayBuffer(url) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`下载待转码媒体失败：HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function getPcmChunk(payload = {}) {
  const sessionId = String(payload.sessionId || "");
  const index = Number(payload.index || 0);
  const session = pcmSessions.get(sessionId);
  if (!session) throw new Error("音频分片会话已失效，请重新转写。");
  if (!Number.isInteger(index) || index < 1 || index > session.chunks.length) {
    throw new Error("音频分片序号无效。");
  }

  const chunkIndex = index - 1;
  const bytes = session.chunks[chunkIndex];
  if (!bytes) throw new Error("音频分片已读取，请重新转写。");
  session.chunks[chunkIndex] = null;

  return {
    data: uint8ArrayToBase64(bytes),
    format: session.format,
    index,
    total: session.chunks.length
  };
}

function releasePcmSession(payload = {}) {
  const sessionId = String(payload.sessionId || "");
  if (sessionId) pcmSessions.delete(sessionId);
}

function splitPcmBuffer(buffer, format, chunkTargetDataBytes) {
  const bytes = new Uint8Array(buffer);
  const frameBytes = getAudioFrameBytes(format);
  const rawTargetBytes = Math.floor(chunkTargetDataBytes / 4) * 3;
  const chunkSize = Math.max(frameBytes, Math.floor(rawTargetBytes / frameBytes) * frameBytes);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return chunks;
}

function getAudioFrameBytes(format = {}) {
  const bytesPerSample = Math.max(1, Math.ceil(Number(format.bits || 16) / 8));
  const channels = Math.max(1, Number(format.channel || 1));
  return bytesPerSample * channels;
}

function estimateBase64DataByteLength(byteLength) {
  return Math.ceil(Math.max(0, byteLength) / 3) * 4;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function createSessionId() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function float32ToPcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(i * 2, int16, true);
  }

  return buffer;
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

function uint8ArrayToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
