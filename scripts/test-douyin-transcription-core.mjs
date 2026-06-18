#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const corePath = resolve("douyin-stepasr-extension/douyin-transcription-core.js");
const Core = require(corePath);

const audioFirst = Core.pickMedia({
  music: {
    play_url: {
      url_list: ["//audio.example.com/song.mp3"]
    },
    cover_large: {
      url_list: ["https://image.example.com/cover.jpg"]
    }
  },
  video: {
    play_addr: {
      url_list: ["https://video.example.com/video.mp4"]
    }
  }
});
assert.deepEqual(audioFirst, { url: "https://audio.example.com/song.mp3", kind: "audio" });

const sameDetailVideo = Core.pickMediaByKind({
  music: {
    play_url: {
      url_list: ["//audio.example.com/song.mp3"]
    }
  },
  video: {
    play_addr: {
      url_list: ["https://video.example.com/video.mp4"]
    }
  }
}, "video");
assert.deepEqual(sameDetailVideo, { url: "https://video.example.com/video.mp4", kind: "video" });

const videoFallback = Core.pickMedia({
  video: {
    bit_rate: [
      { bit_rate: 500, play_addr: { url_list: ["https://video.example.com/low.mp4"] } },
      { bit_rate: 1500, play_addr: { url_list: ["https://video.example.com/high.mp4"] } }
    ]
  }
});
assert.deepEqual(videoFallback, { url: "https://video.example.com/high.mp4", kind: "video" });
assert.throws(() => Core.pickMediaByKind({ video: { play_addr: { url_list: ["https://video.example.com/video.mp4"] } } }, "audio"), /音频地址/);

assert.throws(() => Core.pickMedia({ music: { cover_large: { url_list: ["https://image.example.com/cover.jpg"] } } }), /没有从抖音详情/);

const scriptMediaCandidates = Core.collectMediaCandidatesFromText(
  '{"play_addr":{"url_list":["https:\\/\\/v26.douyinvod.com\\/abc\\/video.mp4?mime_type=video_mp4"]},"cover":"https://p3.douyinpic.com/img.jpeg"}',
  64,
  "script"
);
assert.equal(scriptMediaCandidates.length, 1);
assert.equal(scriptMediaCandidates[0].url, "https://v26.douyinvod.com/abc/video.mp4?mime_type=video_mp4");
assert.equal(scriptMediaCandidates[0].kind, "video");

const activePageMedia = Core.pickPageMedia([
  ...scriptMediaCandidates,
  {
    url: "https://v3.douyinvod.com/current.mp4?mime_type=video_mp4",
    kind: "video",
    score: 98,
    source: "active-video"
  }
]);
assert.deepEqual(activePageMedia, {
  url: "https://v3.douyinvod.com/current.mp4?mime_type=video_mp4",
  kind: "video",
  source: "active-video"
});

const sameScoreAudioWins = Core.pickPageMedia([
  { url: "https://v3.douyinvod.com/current.mp4", kind: "video", score: 80, source: "video" },
  { url: "https://music.douyin.com/current.mp3", kind: "audio", score: 80, source: "audio" }
]);
assert.equal(sameScoreAudioWins.kind, "audio");
const requestedPageVideoWins = Core.pickPageMedia([
  { url: "https://v3.douyinvod.com/current.mp4", kind: "video", score: 80, source: "video" },
  { url: "https://music.douyin.com/current.mp3", kind: "audio", score: 90, source: "audio" }
], "video");
assert.equal(requestedPageVideoWins.kind, "video");
assert.throws(() => Core.pickPageMedia([]), /没有从当前页面提取/);
assert.throws(() => Core.pickPageMedia([{ url: "https://v3.douyinvod.com/current.mp4", kind: "video", score: 80 }], "audio"), /音频地址/);

assert.equal(Core.normalizeMediaUrl("//example.com/a.mp3"), "https://example.com/a.mp3");
assert.equal(Core.normalizeMediaUrl("https://example.com/a.mp3"), "https://example.com/a.mp3");
assert.equal(Core.normalizeMediaUrl("/relative/a.mp3"), "");

assert.deepEqual(Core.guessAudioFormat("https://x/a.mp3", ""), { type: "mp3" });
assert.deepEqual(Core.guessAudioFormat("https://x/a", "audio/wav"), { type: "wav" });
assert.deepEqual(Core.guessAudioFormat("https://x/a.ogg", ""), { type: "ogg" });
assert.deepEqual(Core.guessAudioFormat("https://x/a.pcm", ""), { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 });
assert.deepEqual(Core.guessAudioFormat("https://x/a.mp4", "video/mp4"), { type: "unknown" });

const direct = await Core.prepareAudioForAsr(
  {
    base64: "AAAA",
    contentType: "audio/mpeg",
    guessedFormat: { type: "mp3" }
  },
  { convertToPcm: "auto" },
  () => {
    throw new Error("should not convert");
  }
);
assert.deepEqual(direct, { data: "AAAA", format: { type: "mp3" } });

const oversizedBase64Payload = Buffer.alloc(8 * 1024 * 1024).toString("base64");
let largeDirectConverted = false;
const largeDirect = await Core.prepareAudioForAsr(
  {
    base64: oversizedBase64Payload,
    contentType: "audio/mpeg",
    guessedFormat: { type: "mp3" }
  },
  { convertToPcm: "auto" },
  async () => {
    largeDirectConverted = true;
    throw new Error("should not convert large mp3");
  }
);
assert.equal(largeDirectConverted, false);
assert.equal(largeDirect.format.type, "mp3");
assert.equal(largeDirect.chunks.length, 2);
assert.ok(largeDirect.chunks.every(chunk => chunk.format.type === "mp3"));
assert.ok(largeDirect.chunks.every(chunk => chunk.data.length <= 10 * 1024 * 1024));

const largeDirectNever = await Core.prepareAudioForAsr(
  {
    base64: oversizedBase64Payload,
    contentType: "audio/mpeg",
    guessedFormat: { type: "mp3" }
  },
  { convertToPcm: "never" },
  async () => {
    throw new Error("should not convert large mp3");
  }
);
assert.equal(largeDirectNever.format.type, "mp3");
assert.equal(largeDirectNever.chunks.length, 2);

const remoteLargeMp3 = await Core.prepareAudioForAsr(
  {
    base64: "",
    contentType: "audio/mpeg",
    url: "https://example.com/two-hour-audio.mp3",
    guessedFormat: { type: "mp3" },
    bytes: 200 * 1024 * 1024,
    remoteChunkable: true
  },
  { convertToPcm: "auto" },
  async () => {
    throw new Error("should not convert remote large mp3");
  }
);
assert.equal(remoteLargeMp3.format.type, "mp3");
assert.ok(remoteLargeMp3.chunks.length > 20);
assert.ok(remoteLargeMp3.chunks.every(chunk => !chunk.data));
assert.ok(remoteLargeMp3.chunks.every(chunk => chunk.url === "https://example.com/two-hour-audio.mp3"));
assert.ok(remoteLargeMp3.chunks.every(chunk => chunk.rangeEnd >= chunk.rangeStart));
assert.ok(remoteLargeMp3.chunks.every(chunk => Math.ceil((chunk.rangeEnd - chunk.rangeStart + 1) / 3) * 4 <= 10 * 1024 * 1024));

let remoteResolvedCount = 0;
const remoteLargeAsr = await Core.transcribePreparedAudio(
  remoteLargeMp3,
  { apiKey: "sk-test-valid123" },
  async audio => ({ text: `远程 ${audio.data}` }),
  {
    resolveAudioChunk: async chunk => {
      remoteResolvedCount += 1;
      return {
        data: `range-${chunk.index}`,
        format: chunk.format
      };
    }
  }
);
assert.equal(remoteResolvedCount, remoteLargeMp3.chunks.length);
assert.ok(remoteLargeAsr.text.startsWith("远程 range-1"));

let convertedInput = null;
const converted = await Core.prepareAudioForAsr(
  {
    base64: "BBBB",
    contentType: "video/mp4",
    guessedFormat: { type: "unknown" }
  },
  { convertToPcm: "auto" },
  async (mediaFile, options) => {
    convertedInput = { base64: mediaFile.base64, contentType: mediaFile.contentType, options };
    return {
      base64: "CCCC",
      format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
    };
  }
);
assert.equal(convertedInput.base64, "BBBB");
assert.equal(convertedInput.contentType, "video/mp4");
assert.equal(convertedInput.options.maxAudioDataBytes, 10 * 1024 * 1024);
assert.deepEqual(converted, {
  data: "CCCC",
  format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
});

const largePcmBytes = (10 * 1024 * 1024) + 10;
const chunked = await Core.prepareAudioForAsr(
  {
    base64: "DDDD",
    contentType: "video/mp4",
    guessedFormat: { type: "unknown" }
  },
  { convertToPcm: "auto" },
  async () => ({
    base64: Buffer.alloc(largePcmBytes).toString("base64"),
    format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
  })
);
assert.equal(chunked.format.type, "pcm");
assert.equal(chunked.chunks.length, 2);
assert.deepEqual(chunked.chunks.map(chunk => [chunk.index, chunk.total]), [[1, 2], [2, 2]]);
const chunkSizes = chunked.chunks.map(chunk => Buffer.from(chunk.data, "base64").byteLength);
const chunkDataSizes = chunked.chunks.map(chunk => chunk.data.length);
assert.ok(chunkSizes.every(size => size <= 10 * 1024 * 1024));
assert.ok(chunkDataSizes.every(size => size <= 10 * 1024 * 1024));
assert.equal(chunkSizes.reduce((sum, size) => sum + size, 0), largePcmBytes);
assert.equal(chunkSizes[0] % 2, 0);

const chunkCalls = [];
const chunkedAsr = await Core.transcribePreparedAudio(
  chunked,
  { apiKey: "sk-test-valid123" },
  async (audio, settings) => {
    chunkCalls.push({
      bytes: Buffer.from(audio.data, "base64").byteLength,
      dataBytes: audio.data.length,
      settings
    });
    return { text: `第 ${chunkCalls.length} 段` };
  }
);
assert.equal(chunkedAsr.text, "第 1 段\n第 2 段");
assert.equal(chunkCalls.length, 2);
assert.ok(chunkCalls.every(call => call.bytes <= 10 * 1024 * 1024));
assert.ok(chunkCalls.every(call => call.dataBytes <= 10 * 1024 * 1024));

const resolvedChunkIndexes = [];
let releasedChunkCount = 0;
const referencedChunkAsr = await Core.transcribePreparedAudio(
  {
    chunks: [
      { sessionId: "session-a", index: 1, total: 2, format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 } },
      { sessionId: "session-a", index: 2, total: 2, format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 } }
    ],
    format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
  },
  { apiKey: "sk-test-valid123" },
  async audio => ({ text: `引用分片 ${audio.data}` }),
  {
    resolveAudioChunk: async chunk => {
      resolvedChunkIndexes.push(chunk.index);
      return {
        data: `chunk-${chunk.index}`,
        format: chunk.format
      };
    },
    releaseAudioChunks: async chunks => {
      releasedChunkCount = chunks.length;
    }
  }
);
assert.equal(referencedChunkAsr.text, "引用分片 chunk-1\n引用分片 chunk-2");
assert.deepEqual(resolvedChunkIndexes, [1, 2]);
assert.equal(releasedChunkCount, 2);

await assert.rejects(
  () => Core.prepareAudioForAsr(
    {
      base64: "BBBB",
      contentType: "video/mp4",
      guessedFormat: { type: "unknown" }
    },
    { convertToPcm: "never" },
    async () => ({})
  ),
  /不是 StepAudio 直接支持/
);

const item = Core.buildHistoryItem({
  text: "  转写完成  ",
  payload: {},
  context: { title: "页面标题", pageUrl: "https://www.douyin.com/video/7532222222222222222" },
  detail: {
    desc: "详情标题",
    video: {
      origin_cover: {
        url_list: ["//p3.douyinpic.com/history-cover.jpeg"]
      }
    },
    author: {
      nickname: "历史作者"
    }
  },
  awemeId: "7532222222222222222",
  media: videoFallback,
  prepared: converted,
  now: Date.parse("2026-05-29T15:00:00.000Z"),
  randomHex: "abc123"
});
assert.equal(item.id, "1780066800000-abc123");
assert.equal(item.text, "转写完成");
assert.equal(item.title, "页面标题");
assert.equal(item.pageUrl, "https://www.douyin.com/video/7532222222222222222");
assert.equal(item.cover, "https://p3.douyinpic.com/history-cover.jpeg");
assert.equal(item.author, "历史作者");
assert.equal(item.mediaKind, "video");
assert.deepEqual(item.format, converted.format);
assert.equal(item.createdAt, "2026-05-29T15:00:00.000Z");

const workflowStatuses = [];
const workflowHistory = [];
const workflowResult = await Core.runTranscriptionWorkflow(
  {
    payload: {},
    tab: { id: 10, url: "https://www.douyin.com/video/7532222222222222222" },
    settings: {
      apiKey: "sk-test-valid123",
      convertToPcm: "auto"
    }
  },
  {
    getPageContext: async tabId => {
      assert.equal(tabId, 10);
      return {
        awemeId: "7532222222222222222",
        title: "页面检测标题",
        pageUrl: "https://www.douyin.com/video/7532222222222222222"
      };
    },
    getAwemeDetail: async (tabId, awemeId) => {
      assert.equal(tabId, 10);
      assert.equal(awemeId, "7532222222222222222");
      return {
        desc: "详情标题",
        music: {
          play_url: {
            url_list: ["https://music.douyin.com/current.mp3"]
          }
        }
      };
    },
    getPageMedia: async () => {
      throw new Error("should not use page media fallback");
    },
    fetchMediaFile: async url => {
      assert.equal(url, "https://music.douyin.com/current.mp3");
      return {
        base64: "AAAA",
        contentType: "audio/mpeg",
        url,
        guessedFormat: { type: "mp3" },
        bytes: 4
      };
    },
    convertMediaToPcm: async () => {
      throw new Error("should not convert direct mp3");
    },
    callStepAudioAsr: async (audio, settings) => {
      assert.deepEqual(audio, { data: "AAAA", format: { type: "mp3" } });
      assert.equal(settings.apiKey, "sk-test-valid123");
      return { text: "  第一段转写文案  " };
    },
    saveHistoryItem: async historyItem => {
      workflowHistory.push(historyItem);
    },
    sendStatus: async (tabId, status) => {
      workflowStatuses.push({ tabId, status });
    },
    now: () => Date.parse("2026-05-29T16:00:00.000Z"),
    randomHex: () => "workflow1"
  }
);
assert.equal(workflowResult.text, "第一段转写文案");
assert.equal(workflowHistory.length, 1);
assert.equal(workflowHistory[0].id, "1780070400000-workflow1");
assert.equal(workflowHistory[0].title, "页面检测标题");
assert.equal(workflowHistory[0].mediaKind, "audio");
assert.equal(workflowStatuses[0].status, "正在识别当前视频 ID...");
assert.equal(workflowStatuses.at(-1).status, "转写完成。");

const chunkWorkflowStatuses = [];
const chunkWorkflowCalls = [];
const chunkWorkflowResult = await Core.runTranscriptionWorkflow(
  {
    payload: {
      awemeId: "7532444444444444444",
      title: "大音频标题"
    },
    tab: { id: 14, url: "https://www.douyin.com/video/7532444444444444444" },
    settings: {
      apiKey: "sk-test-valid123",
      convertToPcm: "auto"
    }
  },
  {
    getAwemeDetail: async () => ({
      music: {
        play_url: {
          url_list: ["https://music.douyin.com/large.mp3"]
        }
      }
    }),
    fetchMediaFile: async url => {
      assert.equal(url, "https://music.douyin.com/large.mp3");
      return {
        base64: oversizedBase64Payload,
        contentType: "audio/mpeg",
        url,
        guessedFormat: { type: "mp3" }
      };
    },
    convertMediaToPcm: async () => ({
      base64: Buffer.alloc(largePcmBytes).toString("base64"),
      format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
    }),
    callStepAudioAsr: async audio => {
      chunkWorkflowCalls.push({
        bytes: Buffer.from(audio.data, "base64").byteLength,
        dataBytes: audio.data.length
      });
      return { text: `工作流第 ${chunkWorkflowCalls.length} 段` };
    },
    saveHistoryItem: async () => {},
    sendStatus: async (tabId, status) => {
      chunkWorkflowStatuses.push({ tabId, status });
    },
    now: () => Date.parse("2026-05-29T16:10:00.000Z"),
    randomHex: () => "chunkworkflow"
  }
);
assert.equal(chunkWorkflowResult.text, "工作流第 1 段\n工作流第 2 段");
assert.deepEqual(chunkWorkflowCalls.length, 2);
assert.ok(chunkWorkflowCalls.every(call => call.bytes <= 10 * 1024 * 1024));
assert.ok(chunkWorkflowCalls.every(call => call.dataBytes <= 10 * 1024 * 1024));
assert.ok(chunkWorkflowStatuses.some(entry => entry.status.includes("正在调用 StepAudio ASR（1/2）")));
assert.ok(chunkWorkflowStatuses.some(entry => entry.status.includes("正在调用 StepAudio ASR（2/2）")));

const remoteWorkflowResolved = [];
const remoteWorkflowCalls = [];
const remoteWorkflowResult = await Core.runTranscriptionWorkflow(
  {
    payload: {
      awemeId: "7532555555555555555",
      title: "远程大音频标题"
    },
    tab: { id: 15, url: "https://www.douyin.com/video/7532555555555555555" },
    settings: {
      apiKey: "sk-test-valid123",
      convertToPcm: "auto"
    }
  },
  {
    getAwemeDetail: async () => ({
      music: {
        play_url: {
          url_list: ["https://music.douyin.com/remote-large.mp3"]
        }
      }
    }),
    fetchMediaFile: async url => ({
      base64: "",
      contentType: "audio/mpeg",
      url,
      guessedFormat: { type: "mp3" },
      bytes: 200 * 1024 * 1024,
      remoteChunkable: true
    }),
    convertMediaToPcm: async () => {
      throw new Error("should not convert remote large mp3");
    },
    resolveAudioChunk: async chunk => {
      remoteWorkflowResolved.push(chunk.index);
      return {
        data: Buffer.from(`remote-${chunk.index}`).toString("base64"),
        format: chunk.format
      };
    },
    callStepAudioAsr: async audio => {
      assert.ok(audio.data, "workflow must resolve remote chunk data before ASR");
      assert.equal(audio.format.type, "mp3");
      remoteWorkflowCalls.push(audio.data);
      return { text: `远程工作流第 ${remoteWorkflowCalls.length} 段` };
    },
    saveHistoryItem: async () => {},
    sendStatus: async () => {},
    now: () => Date.parse("2026-05-29T16:20:00.000Z"),
    randomHex: () => "remoteworkflow"
  }
);
assert.ok(remoteWorkflowResult.text.startsWith("远程工作流第 1 段"));
assert.ok(remoteWorkflowResolved.length > 20);
assert.equal(remoteWorkflowCalls.length, remoteWorkflowResolved.length);

const fallbackStatuses = [];
let fallbackDetailError = "";
const fallbackResult = await Core.runTranscriptionWorkflow(
  {
    payload: {
      awemeId: "7533333333333333333",
      title: "内容脚本标题",
      pageUrl: "https://www.douyin.com/video/7533333333333333333"
    },
    tab: { id: 11, url: "https://www.douyin.com/video/7533333333333333333" },
    settings: {
      apiKey: "sk-test-valid123",
      convertToPcm: "auto"
    }
  },
  {
    getPageContext: async () => {
      throw new Error("should use payload awemeId");
    },
    getAwemeDetail: async () => {
      throw new Error("detail blocked");
    },
    getPageMedia: async (tabId, detailError) => {
      assert.equal(tabId, 11);
      fallbackDetailError = detailError;
      return {
        url: "https://v3.douyinvod.com/current.mp4?mime_type=video_mp4",
        kind: "video",
        source: "active-video"
      };
    },
    fetchMediaFile: async url => ({
      base64: "BBBB",
      contentType: "video/mp4",
      url,
      guessedFormat: { type: "unknown" },
      bytes: 4
    }),
    convertMediaToPcm: async mediaFile => {
      assert.equal(mediaFile.base64, "BBBB");
      assert.equal(mediaFile.contentType, "video/mp4");
      return {
        base64: "CCCC",
        format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
      };
    },
    callStepAudioAsr: async audio => {
      assert.equal(audio.data, "CCCC");
      assert.equal(audio.format.type, "pcm");
      return { text: "页面兜底转写" };
    },
    saveHistoryItem: async () => {},
    sendStatus: async (tabId, status) => {
      fallbackStatuses.push({ tabId, status });
    },
    now: () => Date.parse("2026-05-29T16:30:00.000Z"),
    randomHex: () => "workflow2"
  }
);
assert.equal(fallbackResult.text, "页面兜底转写");
assert.equal(fallbackResult.item.id, "1780072200000-workflow2");
assert.equal(fallbackResult.item.title, "内容脚本标题");
assert.equal(fallbackResult.item.mediaKind, "video");
assert.equal(fallbackResult.item.format.type, "pcm");
assert.equal(fallbackDetailError, "detail blocked");
assert.ok(fallbackStatuses.some(entry => entry.status.includes("详情接口不可用")));
assert.ok(fallbackStatuses.some(entry => entry.status.includes("来源：active-video")));

await assert.rejects(
  () => Core.runTranscriptionWorkflow(
    {
      payload: {},
      tab: { id: 12, url: "https://www.douyin.com/" },
      settings: {
        apiKey: "sk-test-valid123",
        convertToPcm: "auto"
      }
    },
    {
      getPageContext: async () => ({ awemeId: "" })
    }
  ),
  /没有识别到当前视频 ID/
);

const xhsHistory = [];
const xhsStatuses = [];
const xhsResult = await Core.runTranscriptionWorkflow(
  {
    payload: {
      platform: "xiaohongshu",
      id: "65abc123def4567890123456",
      noteId: "65abc123def4567890123456",
      title: "小红书标题",
      pageUrl: "https://www.xiaohongshu.com/explore/65abc123def4567890123456",
      cover: "https://sns-img-qc.xhscdn.com/xhs-history-cover.jpg",
      author: "小红书历史作者",
      mediaCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/video.mp4?sign=1",
          kind: "video",
          score: 100,
          source: "video.media.stream.h264.masterUrl"
        }
      ]
    },
    tab: { id: 13, url: "https://www.xiaohongshu.com/explore/65abc123def4567890123456" },
    settings: {
      apiKey: "sk-test-valid123",
      convertToPcm: "auto"
    }
  },
  {
    getPageContext: async () => {
      throw new Error("should use payload media candidates");
    },
    fetchMediaFile: async url => {
      assert.equal(url, "https://sns-video-bd.xhscdn.com/video.mp4?sign=1");
      return {
        base64: "DDDD",
        contentType: "video/mp4",
        url,
        guessedFormat: { type: "unknown" },
        bytes: 4
      };
    },
    convertMediaToPcm: async () => ({
      base64: "EEEE",
      format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 }
    }),
    callStepAudioAsr: async audio => {
      assert.equal(audio.data, "EEEE");
      return { text: "小红书转写" };
    },
    saveHistoryItem: async historyItem => {
      xhsHistory.push(historyItem);
    },
    sendStatus: async (tabId, status) => {
      xhsStatuses.push({ tabId, status });
    },
    now: () => Date.parse("2026-06-03T10:00:00.000Z"),
    randomHex: () => "xhs1"
  }
);
assert.equal(xhsResult.text, "小红书转写");
assert.equal(xhsHistory.length, 1);
assert.equal(xhsHistory[0].platform, "xiaohongshu");
assert.equal(xhsHistory[0].mediaId, "65abc123def4567890123456");
assert.equal(xhsHistory[0].noteId, "65abc123def4567890123456");
assert.equal(xhsHistory[0].title, "小红书标题");
assert.equal(xhsHistory[0].pageUrl, "https://www.xiaohongshu.com/explore/65abc123def4567890123456");
assert.equal(xhsHistory[0].cover, "https://sns-img-qc.xhscdn.com/xhs-history-cover.jpg");
assert.equal(xhsHistory[0].author, "小红书历史作者");
assert.equal(xhsHistory[0].mediaKind, "video");
assert.ok(xhsStatuses.some(entry => entry.status.includes("小红书")));

console.log("Douyin transcription core tests passed.");
