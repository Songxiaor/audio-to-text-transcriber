#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XiaohongshuFeedHook = require(resolve("douyin-stepasr-extension/xiaohongshu-feed-hook.js"));

const noteId = "65hooknote00000000000001";
const originKeyNoteId = "65originvideo000000000001";
const circular = { id: "noise", video: null };
circular.self = circular;

const payload = {
  data: {
    items: [
      {
        id: "ICPInfoList",
        title: "小红书_沪ICP备",
        type: "icp"
      },
      {
        note_id: `${noteId}?xsec_token=secret`,
        note_card: {
          title: "接口当前视频",
          type: "video",
          video: {
            media: {
              stream: {
                h264: [
                  {
                    masterUrl: "https://sns-video-bd.xhscdn.com/hook-note-video.mp4?sign=1"
                  }
                ]
              }
            }
          }
        }
      },
      {
        id: originKeyNoteId,
        title: "originVideoKey 视频",
        video: {
          consumer: {
            originVideoKey: "origin/path/video-key"
          }
        }
      },
      circular
    ]
  }
};

const matches = XiaohongshuFeedHook.extractLikelyNoteDetailsFromPayload(payload);
assert.equal(matches.length, 2);
assert.equal(matches[0].noteId, noteId);
assert.equal(matches[0].note.id, noteId);
assert.equal(matches[0].note.title, "接口当前视频");
assert.equal(matches[1].noteId, originKeyNoteId);
assert.equal(matches[1].note.title, "originVideoKey 视频");

const duplicateMatches = XiaohongshuFeedHook.extractLikelyNoteDetailsFromPayload({
  a: payload.data.items[1],
  b: payload.data.items[1]
});
assert.equal(duplicateMatches.length, 1);
assert.equal(duplicateMatches[0].noteId, noteId);

const tooDeep = {
  a: {
    b: {
      c: {
        id: "65deepnote00000000000001",
        video: {
          media: {
            stream: {
              h264: [
                {
                  masterUrl: "https://sns-video-bd.xhscdn.com/deep-video.mp4"
                }
              ]
            }
          }
        }
      }
    }
  }
};

assert.equal(
  XiaohongshuFeedHook.extractLikelyNoteDetailsFromPayload(tooDeep, { maxDepth: 1 }).length,
  0
);
assert.equal(
  XiaohongshuFeedHook.extractLikelyNoteDetailsFromPayload(tooDeep, { maxDepth: 4 }).length,
  1
);

assert.equal(XiaohongshuFeedHook.normalizeNoteId(`${noteId}?xsec_token=abc`), noteId);

console.log("Xiaohongshu feed hook tests passed.");
