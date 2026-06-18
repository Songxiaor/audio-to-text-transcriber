#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
require(resolve("douyin-stepasr-extension/platform-adapter-core.js"));
const XiaohongshuAdapter = require(resolve("douyin-stepasr-extension/xiaohongshu-adapter.js"));
XiaohongshuAdapter.clearHookNoteCache();

const noteId = "65abc123def4567890123456";
const h264BackupUrl = "https://sns-video-qc.xhscdn.com/h264-first-backup.mp4?sign=1";
const h264SecondUrl = "https://sns-video-bd.xhscdn.com/h264-second-video.mp4?sign=1";
const h265Url = "https://sns-video-hw.xhscdn.com/h265-video.mp4?sign=1";
const xhsCoverUrl = "https://sns-img-qc.xhscdn.com/xhs-cover.jpg";
const state = {
  note: {
    noteDetailMap: {
      [noteId]: {
        note: {
          id: noteId,
          title: "小红书视频标题",
          type: "video",
          imageList: [
            {
              url: xhsCoverUrl
            }
          ],
          user: {
            nickname: "小红书作者"
          },
          video: {
            media: {
              stream: {
                h264: [
                  {
                    backupUrls: [h264BackupUrl]
                  },
                  {
                    masterUrl: h264SecondUrl
                  }
                ],
                h265: [
                  {
                    masterUrl: h265Url
                  }
                ]
              }
            },
            consumer: {
              originVideoKey: "abc/origin-video-key"
            }
          }
        }
      }
    }
  },
  global: {
    appSettings: {
      ICPInfoList: [
        {
          title: "小红书_沪ICP备",
          type: "icp",
          desc: "沪ICP备备案信息"
        }
      ]
    }
  }
};

assert.equal(
  XiaohongshuAdapter.extractNoteIdFromUrl(`https://www.xiaohongshu.com/explore/${noteId}?xsec_token=secret`),
  noteId
);
assert.equal(
  XiaohongshuAdapter.extractNoteIdFromUrl(`https://www.xiaohongshu.com/discovery/item/${noteId}`),
  noteId
);

const detection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=secret`,
  title: "页面标题 - 小红书",
  initialState: state,
  videos: [
    {
      currentSrc: "blob:https://www.xiaohongshu.com/blob-id",
      src: "",
      sources: [],
      visibleScore: 100
    },
    {
      currentSrc: "https://sns-video-bd.xhscdn.com/dom-video.mp4?sign=1",
      src: "",
      sources: [],
      visibleScore: 100
    }
  ]
});

assert.equal(detection.platform, "xiaohongshu");
assert.equal(detection.id, noteId);
assert.equal(detection.title, "小红书视频标题");
assert.equal(detection.cover, xhsCoverUrl);
assert.equal(detection.author, "小红书作者");
assert.equal(detection.mediaCandidates[0].url, h264BackupUrl);
assert.equal(detection.mediaCandidates[0].source, "video.media.stream.h264.backupUrls");
assert.equal(detection.diagnostics.skippedBlobVideoCount, 1);
assert.equal(detection.diagnostics.hasInitialState, true);
assert.equal(detection.diagnostics.noteFound, true);
assert.equal(detection.diagnostics.noteSearchSource, `state.note.noteDetailMap.${noteId}.note`);
assert.equal(detection.diagnostics.source, "initialState");
assert.deepEqual(detection.diagnostics.cacheNoteIds, []);
assert.equal(detection.diagnostics.urlNoteId, noteId);
assert.deepEqual(detection.diagnostics.noteDetailMapSources, ["state.note.noteDetailMap"]);
assert.deepEqual(detection.diagnostics.noteDetailMapKeys, [
  {
    source: "state.note.noteDetailMap",
    keys: [noteId]
  }
]);
assert.equal(detection.diagnostics.matchedNoteId, noteId);
assert.equal(detection.diagnostics.matchStrategy, "exact");
assert.equal(detection.diagnostics.hasVideoObject, true);
assert.equal(detection.diagnostics.topCandidateSource, "video.media.stream.h264.backupUrls");
assert.equal(detection.diagnostics.topCandidateHost, "sns-video-qc.xhscdn.com");
assert(detection.mediaCandidates.some(item => item.url === "https://sns-video-bd.xhscdn.com/abc/origin-video-key"));
assert(detection.mediaCandidates.some(item => item.url === "https://sns-video-bd.xhscdn.com/dom-video.mp4?sign=1"));

const scriptState = XiaohongshuAdapter.parseInitialStateFromScripts([
  `window.__INITIAL_STATE__={"note":{"noteDetailMap":{"${noteId}":{"note":{"id":"${noteId}","title":"脚本视频","type":"video","video":{"media":{"stream":{"h264":[{"masterUrl":"https://sns-video-bd.xhscdn.com/script-video.mp4?sign=1"}]}}}}}}},"global":{"optional":undefined}};`
]);
assert.equal(scriptState.source, "script.__INITIAL_STATE__");
assert.equal(scriptState.value.note.noteDetailMap[noteId].note.id, noteId);

const imageNote = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  initialState: {
    note: {
      noteDetailMap: {
        [noteId]: {
          note: {
            id: noteId,
            title: "图文笔记",
            type: "normal",
            cover: {
              urlPre: "https://sns-img-hw.xhscdn.com/image-note-cover.webp"
            },
            user: {
              nickname: "图文作者"
            }
          }
        }
      }
    }
  },
  videos: []
});

assert.equal(imageNote.errorCode, "no-video");
assert.equal(imageNote.message, "当前笔记没有视频可转写。");
assert.equal(imageNote.cover, "https://sns-img-hw.xhscdn.com/image-note-cover.webp");
assert.equal(imageNote.author, "图文作者");
assert.equal(imageNote.mediaCandidates.length, 0);

const icpOnlyDetection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  title: "页面标题 - 小红书",
  initialState: {
    global: {
      appSettings: {
        ICPInfoList: [
          {
            title: "小红书_沪ICP备",
            type: "icp",
            desc: "沪ICP备备案信息"
          }
        ]
      }
    }
  },
  videos: [
    {
      currentSrc: "blob:https://www.xiaohongshu.com/blob-1",
      src: "",
      sources: [],
      visibleScore: 100
    },
    {
      currentSrc: "blob:https://www.xiaohongshu.com/blob-2",
      src: "",
      sources: [],
      visibleScore: 100
    }
  ]
});

assert.equal(icpOnlyDetection.title, "页面标题");
assert.equal(icpOnlyDetection.diagnostics.noteFound, false);
assert.equal(icpOnlyDetection.diagnostics.noteSearchSource, "");
assert.equal(icpOnlyDetection.diagnostics.hasVideoObject, false);
assert.equal(icpOnlyDetection.diagnostics.skippedBlobVideoCount, 2);
assert.equal(icpOnlyDetection.diagnostics.matchStrategy, "none");
assert.equal(icpOnlyDetection.diagnostics.source, "none");
assert.equal(icpOnlyDetection.errorCode, "current-note-not-found");
assert.equal(icpOnlyDetection.message, "未找到当前视频数据，请刷新当前视频页后再试。");

const previousNoteId = "65previousnote000000000001";
const staleMapState = {
  note: {
    noteDetailMap: {
      [previousNoteId]: {
        note: {
          id: previousNoteId,
          title: "上一条视频笔记",
          type: "video",
          video: {
            media: {
              stream: {
                h264: [
                  {
                    masterUrl: "https://sns-video-bd.xhscdn.com/previous-video.mp4?sign=1"
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  global: state.global
};

const staleMapDetection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=current`,
  initialState: staleMapState,
  videos: [
    {
      currentSrc: "https://sns-video-bd.xhscdn.com/previous-dom-video.mp4?sign=1",
      src: "",
      sources: [],
      visibleScore: 100
    }
  ]
});

assert.equal(staleMapDetection.title, "小红书笔记");
assert.equal(staleMapDetection.diagnostics.urlNoteId, noteId);
assert.equal(staleMapDetection.diagnostics.noteFound, false);
assert.equal(staleMapDetection.diagnostics.noteSearchSource, "");
assert.deepEqual(staleMapDetection.diagnostics.noteDetailMapSources, ["state.note.noteDetailMap"]);
assert.deepEqual(staleMapDetection.diagnostics.noteDetailMapKeys, [
  {
    source: "state.note.noteDetailMap",
    keys: [previousNoteId]
  }
]);
assert.equal(staleMapDetection.diagnostics.matchedNoteId, "");
assert.equal(staleMapDetection.diagnostics.matchStrategy, "none");
assert.equal(staleMapDetection.diagnostics.source, "none");
assert.equal(staleMapDetection.errorCode, "current-note-not-found");
assert.equal(staleMapDetection.message, "未找到当前视频数据，请刷新当前视频页后再试。");
assert.equal(staleMapDetection.mediaCandidates.length, 0);

XiaohongshuAdapter.clearHookNoteCache();
assert.equal(XiaohongshuAdapter.handleHookMessageEvent({
  source: globalThis,
  data: {
    __stepasrXhs: true,
    noteId: previousNoteId,
    note: staleMapState.note.noteDetailMap[previousNoteId].note
  }
}), true);

const previousCacheOnlyDetection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  initialState: null,
  videos: []
});

assert.equal(previousCacheOnlyDetection.diagnostics.urlNoteId, noteId);
assert.deepEqual(previousCacheOnlyDetection.diagnostics.cacheNoteIds, [previousNoteId]);
assert.equal(previousCacheOnlyDetection.diagnostics.noteFound, false);
assert.equal(previousCacheOnlyDetection.diagnostics.source, "none");
assert.equal(previousCacheOnlyDetection.diagnostics.matchStrategy, "none");
assert.equal(previousCacheOnlyDetection.errorCode, "current-note-not-found");
assert.equal(previousCacheOnlyDetection.message, "未找到当前视频数据，请刷新当前视频页后再试。");
assert.equal(previousCacheOnlyDetection.mediaCandidates.length, 0);

const hookVideoUrl = "https://sns-video-bd.xhscdn.com/hook-current-video.mp4?sign=1";
XiaohongshuAdapter.clearHookNoteCache();
assert.equal(XiaohongshuAdapter.handleHookMessageEvent({
  source: globalThis,
  data: {
    __stepasrXhs: true,
    noteId,
    note: {
      id: noteId,
      title: "实时缓存当前视频",
      type: "video",
      video: {
        media: {
          stream: {
            h264: [
              {
                masterUrl: hookVideoUrl
              }
            ]
          }
        }
      }
    }
  }
}), true);

const hookCacheDetection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=current`,
  initialState: staleMapState,
  videos: []
});

assert.equal(hookCacheDetection.title, "实时缓存当前视频");
assert.equal(hookCacheDetection.diagnostics.urlNoteId, noteId);
assert.equal(hookCacheDetection.diagnostics.noteFound, true);
assert.equal(hookCacheDetection.diagnostics.noteSearchSource, `hookCache.${noteId}`);
assert.equal(hookCacheDetection.diagnostics.source, "cache");
assert.deepEqual(hookCacheDetection.diagnostics.cacheNoteIds, [noteId]);
assert.equal(hookCacheDetection.diagnostics.matchedNoteId, noteId);
assert.equal(hookCacheDetection.diagnostics.matchStrategy, "exact");
assert.equal(hookCacheDetection.mediaCandidates[0].url, hookVideoUrl);
assert.equal(hookCacheDetection.mediaCandidates[0].source, "video.media.stream.h264.masterUrl");

XiaohongshuAdapter.clearHookNoteCache();

const singleNoteState = {
  note: {
    noteDetailMap: {
      onlyNoteInMap: {
        note: {
          id: `${noteId}?xsec_token=stale-query`,
          title: "唯一当前视频笔记",
          type: "video",
          video: {
            media: {
              stream: {
                h264: [
                  {
                    masterUrl: "https://sns-video-bd.xhscdn.com/single-current-video.mp4?sign=1"
                  }
                ]
              }
            }
          }
        }
      }
    }
  }
};

const singleNoteDetection = XiaohongshuAdapter.detectFromSources({
  pageUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
  initialState: singleNoteState,
  videos: []
});

assert.equal(singleNoteDetection.title, "唯一当前视频笔记");
assert.equal(singleNoteDetection.diagnostics.noteFound, true);
assert.equal(singleNoteDetection.diagnostics.noteSearchSource, "state.note.noteDetailMap.onlyNoteInMap.note");
assert.equal(singleNoteDetection.diagnostics.source, "initialState");
assert.equal(singleNoteDetection.diagnostics.matchedNoteId, noteId);
assert.equal(singleNoteDetection.diagnostics.matchStrategy, "single");
assert.equal(singleNoteDetection.mediaCandidates[0].url, "https://sns-video-bd.xhscdn.com/single-current-video.mp4?sign=1");
assert.equal(singleNoteDetection.mediaCandidates[0].source, "video.media.stream.h264.masterUrl");

console.log("Xiaohongshu adapter tests passed.");
