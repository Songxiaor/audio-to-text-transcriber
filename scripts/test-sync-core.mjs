#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sync = require("../douyin-stepasr-extension/sync-core.js");

const record = {
  title: "# 爆款标题\n## 注入标题",
  text: "第一段\n第二段",
  author: "张三",
  platform: "douyin",
  pageUrl: "https://www.douyin.com/video/123456789",
  mediaId: "123456789"
};

{
  const markdown = sync.buildObsidianMarkdown(record);
  assert(markdown.startsWith("# 爆款标题 ## 注入标题\n"), "markdown title is kept on one H1 line");
  assert(!markdown.includes("\n## 注入标题\n"), "raw title line breaks cannot inject headings");
  assert(markdown.includes("- 作者：张三"), "markdown includes author metadata");
  assert(markdown.includes("- 平台：抖音"), "markdown includes formatted platform metadata");
  assert(markdown.includes("- 链接：https://www.douyin.com/video/123456789"), "markdown includes source link");
  assert(markdown.includes("- 视频ID：123456789"), "markdown includes video id");
  assert(markdown.includes("- 字数：7"), "markdown includes current text word count");
  assert(markdown.includes("## 正文\n\n第一段\n第二段"), "markdown includes body text");
}

{
  const url = new URL(sync.buildObsidianNewNoteUrl(record, {
    vault: "我的知识库",
    folder: "转写稿/抖音"
  }));
  assert.equal(url.protocol, "obsidian:");
  assert.equal(url.hostname, "new");
  assert.equal(url.searchParams.get("vault"), "我的知识库");
  assert.equal(url.searchParams.get("file"), "转写稿/抖音/爆款标题 - 注入标题");
  assert.equal(url.searchParams.get("clipboard"), "true");
}

{
  const payload = sync.buildFeishuFieldsPayload(record, {
    text: "内容",
    video_id: "",
    word_count: "字符数"
  });
  assert.deepEqual(payload, {
    fields: {
      "标题": "爆款标题 ## 注入标题",
      "内容": "第一段\n第二段",
      "作者": "张三",
      "平台": "抖音",
      "链接": "https://www.douyin.com/video/123456789",
      "字符数": 7
    }
  });
}

{
  const settings = sync.normalizeSyncSettings({
    obsidian: { vault: " 工作库 ", path: "转写稿\\客户" },
    feishu: {
      appId: " cli_a ",
      appSecret: " sec ",
      bitableUrl: " https://team.feishu.cn/base/bascn123456789?table=tblabcdef&view=vewxx ",
      fieldMapping: { title: "标题2" }
    }
  });
  assert.equal(settings.obsidian.vault, "工作库");
  assert.equal(settings.obsidian.folder, "转写稿/客户");
  assert.equal(settings.feishu.app_id, "cli_a");
  assert.equal(settings.feishu.app_secret, "sec");
  assert.equal(settings.feishu.bitable_url, "https://team.feishu.cn/base/bascn123456789?table=tblabcdef&view=vewxx");
  assert.equal(settings.feishu.app_token, "bascn123456789");
  assert.equal(settings.feishu.table_id, "tblabcdef");
  assert.equal(settings.feishu.field_mapping.title, "标题2");
  assert.equal(settings.feishu.field_mapping.text, "文案");
}

{
  const settings = sync.normalizeSyncSettings({
    feishu: {
      appToken: " old_base ",
      tableId: " old_tbl "
    }
  });
  assert.equal(settings.feishu.bitable_url, "");
  assert.equal(settings.feishu.app_token, "old_base");
  assert.equal(settings.feishu.table_id, "old_tbl");
}

{
  const parsed = sync.parseBitableUrl("https://team.feishu.cn/base/bascn123456789?table=tblabcdef&view=vewxx");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.appToken, "bascn123456789");
  assert.equal(parsed.tableId, "tblabcdef");
  assert.equal(parsed.error, "");
}

{
  const parsed = sync.parseBitableUrl(" https://team.feishu.cn/base/bascnapp?view=vewxx&table=tblwithparams&from=share ");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.appToken, "bascnapp");
  assert.equal(parsed.tableId, "tblwithparams");
}

{
  const parsed = sync.parseBitableUrl("https://workspace.larksuite.com/base/baseTokenX?table=tblInternational&view=vew123");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.appToken, "baseTokenX");
  assert.equal(parsed.tableId, "tblInternational");
}

{
  const parsed = sync.parseBitableUrl("bascnDirect tblDirect");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.appToken, "bascnDirect");
  assert.equal(parsed.tableId, "tblDirect");
}

{
  const parsed = sync.parseBitableUrl("https://team.feishu.cn/base/bascn123456789?view=vewxx");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "missing_table");
  assert.equal(parsed.appToken, "bascn123456789");
  assert(parsed.message.includes("?table="));
}

{
  const parsed = sync.parseBitableUrl("https://team.feishu.cn/wiki/wikcn123456789");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "wiki_link");
  assert(parsed.message.includes("wiki 链接无法直接读取 app_token"));
}

{
  const parsed = sync.parseBitableUrl("   ");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "empty");
  assert(parsed.message.includes("?table="));
}

{
  const parsed = sync.parseBitableUrl("not a bitable link");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "invalid");
  assert(parsed.message.includes("?table="));
}

{
  const missing = sync.getMissingFeishuConfigKeys({
    app_id: "cli_a",
    app_secret: "",
    app_token: "base",
    table_id: ""
  });
  assert.deepEqual(missing, ["app_secret", "table_id"]);
}

const manifest = JSON.parse(readFileSync("douyin-stepasr-extension/manifest.json", "utf8"));
const backgroundSource = readFileSync("douyin-stepasr-extension/background.js", "utf8");
const sidepanelHtml = readFileSync("douyin-stepasr-extension/sidepanel.html", "utf8");
const sidepanelSource = readFileSync("douyin-stepasr-extension/sidepanel.js", "utf8");

assert.equal(manifest.version, "0.1.47");
assert(manifest.host_permissions.includes("https://open.feishu.cn/*"), "manifest grants Feishu host permission");
assert(backgroundSource.includes("STEPASR_SYNC_FEISHU_RECORD"), "background handles Feishu sync messages");
assert(backgroundSource.includes("tenant_access_token/internal"), "background requests Feishu tenant access token");
assert(backgroundSource.includes("/bitable/v1/apps/"), "background writes Feishu bitable records");
assert(sidepanelHtml.includes('<script src="sync-core.js"></script>'), "sidepanel loads sync-core before sidepanel.js");
assert(sidepanelHtml.includes('id="syncFeishuBitableUrl"'), "sidepanel uses a single bitable link input");
assert(!sidepanelHtml.includes('id="syncFeishuAppToken"'), "sidepanel no longer renders app_token input");
assert(!sidepanelHtml.includes('id="syncFeishuTableId"'), "sidepanel no longer renders table_id input");
assert(sidepanelSource.includes('SYNC_SETTINGS_KEY = "stepasr_sync"'), "sidepanel uses local sync settings key");
assert(sidepanelSource.includes("parseBitableUrl"), "sidepanel parses the bitable link before saving and syncing");
assert(sidepanelSource.includes("bitable_url"), "sidepanel stores the raw bitable link for display");
assert(sidepanelSource.includes("buildCurrentSyncRecord"), "sidepanel builds current-view sync records");

console.log("Sync core tests passed.");
