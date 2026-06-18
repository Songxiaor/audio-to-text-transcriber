#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const extDir = join(root, "douyin-stepasr-extension");
const outputDir = join(root, "store-assets");
const tmpDir = join(root, ".store-assets-tmp");
const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));

if (!existsSync(chromeBin)) {
  throw new Error(`Chrome binary not found: ${chromeBin}`);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const pages = [
  {
    file: "screenshot-01-floating-panel.png",
    title: "抖音页面浮窗",
    subtitle: "在单条视频页直接检测、转写、下载音频和视频。",
    kind: "douyin",
    panelStatus: "已检测到视频 ID：7535555555555555555，来源：active-video-dom",
    panelResult: "以前做一条口播视频太重了，现在可以先下载素材，再用 StepAudio 快速生成可编辑文案。"
  },
  {
    file: "screenshot-02-settings-api-test.png",
    title: "API 设置与连通测试",
    subtitle: "用户填入自己的 StepAudio API Key，本地保存，本地发起测试。",
    kind: "settings",
    status: "StepAudio API 连通。测试音频是静音，返回空文本是正常的。"
  },
  {
    file: "screenshot-03-detection-diagnostics.png",
    title: "检测失败诊断",
    subtitle: "识别不到视频 ID 时，复制不含 Key 和正文的诊断报告。",
    kind: "diagnostics"
  },
  {
    file: "screenshot-04-downloads.png",
    title: "音频与视频下载",
    subtitle: "解析当前视频资源后，交给浏览器下载管理器保存。",
    kind: "downloads",
    panelStatus: "视频下载已提交。"
  },
  {
    file: "screenshot-05-history.png",
    title: "本地转写历史",
    subtitle: "转写结果保存在浏览器本地，可复制或回到原视频。",
    kind: "history"
  },
  {
    file: "promo-small-440x280.png",
    title: "StepAudio Douyin Transcriber",
    subtitle: "Detect, download, and transcribe Douyin videos with your own StepAudio API key.",
    kind: "promo",
    width: 440,
    height: 280
  }
];

for (const page of pages) {
  const width = page.width || 1280;
  const height = page.height || 800;
  const htmlPath = join(tmpDir, `${page.file}.html`);
  const pngPath = join(outputDir, page.file);
  writeFileSync(htmlPath, renderPage(page, width, height), "utf8");
  execFileSync(chromeBin, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${width},${height}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href
  ], { stdio: "ignore" });
  assertPngSize(pngPath, width, height);
  console.log(`${page.file} ${width}x${height}`);
}

rmSync(tmpDir, { recursive: true, force: true });

function renderPage(page, width, height) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <style>
    ${baseCss(width, height)}
  </style>
</head>
<body>
  ${page.kind === "promo" ? promoPage(page) : listingPage(page)}
</body>
</html>`;
}

function listingPage(page) {
  return `<main class="canvas">
    <section class="copy">
      <div class="eyebrow">StepAudio Douyin Transcriber · v${manifest.version}</div>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.subtitle)}</p>
    </section>
    ${page.kind === "settings" ? settingsMock(page) : ""}
    ${page.kind === "diagnostics" ? diagnosticsMock() : ""}
    ${page.kind === "history" ? historyMock() : ""}
    ${["douyin", "downloads"].includes(page.kind) ? douyinMock(page) : ""}
  </main>`;
}

function promoPage(page) {
  return `<main class="promo">
    <div class="promo-icon">S</div>
    <div>
      <h1>${escapeHtml(page.title)}</h1>
      <p>${escapeHtml(page.subtitle)}</p>
      <div class="promo-row">
        <span>Detect</span>
        <span>Download</span>
        <span>Transcribe</span>
      </div>
    </div>
  </main>`;
}

function douyinMock(page) {
  const isDownload = page.kind === "downloads";
  const widget = isDownload ? `<div class="floating-card">
        <div class="floating-head">
          <strong>StepAudio <em>v${manifest.version}</em></strong>
          <span>⚙ −</span>
        </div>
        <button class="primary">转写</button>
        <button class="outline">检测视频 ID</button>
        <div class="download-row">
          <button>下载音频</button>
          <button class="active">下载视频</button>
        </div>
        <p>${escapeHtml(page.panelStatus || "")}</p>
        ${page.panelResult ? `<pre>${escapeHtml(page.panelResult)}</pre>` : ""}
      </div>` : `<div class="floating-pill">
        <span>⋮⋮</span>
        <strong>转写 <em>v${manifest.version}</em></strong>
        <button>↗</button>
      </div>`;
  return `<section class="browser">
    <div class="browser-bar">
      <span></span><span></span><span></span>
      <div class="address">https://www.douyin.com/video/7535555555555555555</div>
    </div>
    <div class="browser-body">
      <div class="video">
        <div class="caption">以前做一条口播视频太重了</div>
        <div class="player-controls"></div>
      </div>
      ${widget}
    </div>
  </section>`;
}

function settingsMock(page) {
  return `<section class="settings">
    <header>
      <div>
        <h2>StepAudio 文案转写</h2>
        <p>把你的 StepFun API Key 接到抖音转写按钮。</p>
      </div>
      <span>v${manifest.version}</span>
    </header>
    <div class="setup-list">
      <b>首次使用</b>
      <ol>
        <li>保存 API Key</li>
        <li>点击「测试 API」确认 StepAudio 可用</li>
        <li>打开单条抖音视频，先检测再转写</li>
      </ol>
    </div>
    <label>Endpoint<input value="https://api.stepfun.com/step_plan/v1/audio/asr/sse"></label>
    <label>API Key<input value="••••••••••••••••••••••••••"></label>
    <div class="settings-grid">
      <label>Model<input value="stepaudio-2.5-asr"></label>
      <label>Language<input value="zh"></label>
    </div>
    <div class="button-row"><button class="primary">保存设置</button><button>测试 API</button></div>
    <div class="green">${escapeHtml(page.status || "")}</div>
  </section>`;
}

function diagnosticsMock() {
  return `<section class="diagnostics">
    <div class="report">
      <h2>StepAudio Douyin Transcriber diagnostics</h2>
      <code>[settings]
apiKeyConfigured: true
model: stepaudio-2.5-asr

[lastDetection]
detectedAwemeId: 7535555555555555555
detectedSource: active-video-dom
detectedCandidateCount: 4
detectedVisibleVideoCount: 1

[history]
historyCount: 3</code>
    </div>
    <aside>
      <h3>安全诊断</h3>
      <p>诊断报告不包含 API Key、Prompt、热词原文或转写正文。</p>
      <button class="primary">复制诊断</button>
    </aside>
  </section>`;
}

function historyMock() {
  const items = [
    "以前做一条口播视频太重了，现在可以先下载素材，再用 StepAudio 快速生成可编辑文案。",
    "这条视频的核心钩子是先指出痛点，再给出一个简单可执行的方法。",
    "检测视频 ID 成功后，转写结果会保存在本地历史，方便复用。"
  ];
  return `<section class="history-shot">
    <header>
      <div>
        <h2>转写记录</h2>
        <p>3 条记录 · 可搜索、复制、编辑、打开原视频</p>
      </div>
      <button>清空全部</button>
    </header>
    <input value="口播 文案" aria-label="搜索记录">
    ${items.map((text, index) => `<article>
      <div><b>抖音视频 ${index + 1}</b><time>05/29 21:${40 + index}</time></div>
      <p>${escapeHtml(text)}</p>
      <footer><button>复制</button><button>复制链接</button><button>编辑</button><button>删除</button></footer>
    </article>`).join("")}
  </section>`;
}

function baseCss(width, height) {
  return `
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f6f7f9; }
    .canvas { position: relative; width: 100%; height: 100%; padding: 52px 62px; background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%); }
    .copy { max-width: 460px; }
    .eyebrow { color: #2563eb; font-size: 16px; font-weight: 700; }
    h1 { margin: 12px 0 12px; font-size: 44px; line-height: 1.08; letter-spacing: 0; }
    p { margin: 0; color: #4b5563; font-size: 19px; line-height: 1.5; }
    button { height: 38px; border: 1px solid #d1d5db; border-radius: 6px; color: #111827; background: #fff; font-weight: 700; font-size: 14px; }
    .primary { border: 0; color: white; background: #111827; }
    .outline { background: #fff; }
    .browser { position: absolute; right: 62px; bottom: 52px; width: 690px; height: 520px; border: 1px solid #d7dce3; border-radius: 8px; background: white; box-shadow: 0 24px 70px rgba(15,23,42,.18); overflow: hidden; }
    .browser-bar { height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
    .browser-bar span { width: 11px; height: 11px; border-radius: 50%; background: #ef4444; }
    .browser-bar span:nth-child(2) { background: #f59e0b; }
    .browser-bar span:nth-child(3) { background: #22c55e; }
    .address { margin-left: 10px; padding: 8px 12px; flex: 1; border-radius: 999px; color: #64748b; background: #eef2f7; font-size: 13px; }
    .browser-body { position: relative; height: calc(100% - 52px); background: #0b0f19; }
    .video { position: absolute; left: 196px; top: 36px; width: 250px; height: 410px; border-radius: 18px; background: radial-gradient(circle at 65% 25%, #7f1d1d, #111827 46%, #05070b 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    .caption { position: absolute; left: 22px; top: 86px; right: 22px; color: white; font-size: 26px; line-height: 1.2; font-weight: 800; }
    .player-controls { position: absolute; left: 18px; right: 18px; bottom: 18px; height: 8px; border-radius: 99px; background: rgba(255,255,255,.65); }
    .floating-pill { position: absolute; right: 24px; top: 84px; height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 12px; border: 1px solid rgba(17,24,39,.12); border-radius: 8px; background: rgba(255,255,255,.97); box-shadow: 0 18px 46px rgba(15,23,42,.24); }
    .floating-pill span { color: #94a3b8; font-weight: 900; }
    .floating-pill strong { color: #111827; font-size: 14px; white-space: nowrap; }
    .floating-pill em { color: #6b7280; font-size: 11px; font-style: normal; }
    .floating-pill button { width: 34px; height: 30px; }
    .floating-card { position: absolute; right: 24px; top: 84px; width: 292px; padding: 0 12px 12px; border: 1px solid rgba(17,24,39,.12); border-radius: 8px; background: rgba(255,255,255,.97); box-shadow: 0 18px 46px rgba(15,23,42,.24); }
    .floating-head { height: 48px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; }
    .floating-head strong { font-size: 15px; }
    .floating-head em { color: #6b7280; font-size: 11px; font-style: normal; }
    .floating-card button { width: 100%; margin-top: 10px; }
    .floating-card .download-row { display: flex; gap: 8px; }
    .floating-card .download-row button { flex: 1; }
    .floating-card .download-row .active { border-color: #111827; }
    .floating-card p { min-height: 36px; margin-top: 12px; color: #6b7280; font-size: 13px; }
    .floating-card pre { max-height: 108px; margin: 8px 0 0; padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; color: #111827; background: #f9fafb; white-space: pre-wrap; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .settings { position: absolute; right: 92px; bottom: 48px; width: 460px; padding: 20px; display: grid; gap: 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; box-shadow: 0 24px 70px rgba(15,23,42,.18); }
    .settings header { display: flex; justify-content: space-between; gap: 12px; }
    .settings h2 { margin: 0; font-size: 22px; }
    .settings header span { align-self: start; padding: 4px 8px; border-radius: 99px; background: #e2e8f0; font-size: 12px; font-weight: 800; }
    .setup-list { padding: 12px; border-radius: 8px; background: #f8fafc; color: #4b5563; }
    .setup-list ol { margin: 8px 0 0; padding-left: 18px; }
    label { display: grid; gap: 6px; color: #374151; font-size: 12px; font-weight: 700; }
    input { height: 38px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 10px; color: #111827; background: white; font-size: 13px; }
    .settings-grid { display: grid; grid-template-columns: 1fr 90px; gap: 10px; }
    .button-row { display: grid; grid-template-columns: 1fr 120px; gap: 10px; }
    .green { color: #047857; font-size: 13px; font-weight: 700; }
    .diagnostics { position: absolute; right: 72px; bottom: 58px; width: 720px; display: grid; grid-template-columns: 1fr 220px; gap: 18px; }
    .report, .diagnostics aside, .history-shot article { border: 1px solid #e5e7eb; border-radius: 8px; background: white; box-shadow: 0 20px 54px rgba(15,23,42,.16); }
    .report { padding: 22px; }
    .report h2 { margin: 0 0 14px; font-size: 20px; }
    code { display: block; white-space: pre-wrap; color: #334155; font: 15px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .diagnostics aside { padding: 22px; align-self: start; }
    .diagnostics aside h3 { margin: 0 0 10px; font-size: 20px; }
    .diagnostics aside button { width: 100%; margin-top: 18px; }
    .history-shot { position: absolute; right: 86px; bottom: 60px; width: 560px; display: grid; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; box-shadow: 0 20px 54px rgba(15,23,42,.16); }
    .history-shot header { display: flex; align-items: start; justify-content: space-between; gap: 14px; }
    .history-shot h2 { margin: 0; font-size: 20px; }
    .history-shot header p { margin-top: 4px; font-size: 13px; }
    .history-shot > input { height: 38px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 10px; color: #111827; background: white; font-size: 13px; }
    .history-shot article { padding: 18px; }
    .history-shot div { display: flex; justify-content: space-between; color: #64748b; font-size: 13px; }
    .history-shot b { color: #111827; font-size: 16px; }
    .history-shot p { margin: 12px 0; font-size: 15px; }
    .history-shot footer { display: flex; gap: 10px; }
    .history-shot footer button { flex: 1; }
    .promo { width: 100%; height: 100%; padding: 30px; display: grid; grid-template-columns: 82px 1fr; gap: 20px; align-items: center; color: white; background: linear-gradient(135deg, #111827, #1e40af); }
    .promo-icon { width: 74px; height: 74px; display: grid; place-items: center; border-radius: 18px; background: rgba(255,255,255,.16); font-size: 42px; font-weight: 900; }
    .promo h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.05; }
    .promo p { color: rgba(255,255,255,.84); font-size: 16px; line-height: 1.35; }
    .promo-row { display: flex; gap: 8px; margin-top: 18px; }
    .promo-row span { padding: 6px 9px; border-radius: 999px; color: #dbeafe; background: rgba(255,255,255,.14); font-size: 12px; font-weight: 800; }
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function assertPngSize(path, expectedWidth, expectedHeight) {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path} is ${width}x${height}, expected ${expectedWidth}x${expectedHeight}`);
  }
}
