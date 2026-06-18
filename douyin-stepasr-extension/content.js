(function initStepAsrContent() {
  if (window.__stepAsrContentLoaded) return;
  window.__stepAsrContentLoaded = true;

  const POSITION_KEY = "stepasr_widget_position";
  const POSTPROCESS_KEY = "stepasr_postprocess";
  const FEEDBACK_DELAY_MS = 1500;
  const TOAST_DEFAULT_DELAY_MS = 3600;
  const TOAST_OPENING_DELAY_MS = 2200;
  const TOAST_LONG_DELAY_MS = 6800;
  const OPEN_PANEL_FALLBACK_GUIDE = "当前浏览器不支持从这里打开，请点击浏览器工具栏的扩展图标打开侧边栏";
  const DEFAULT_POSTPROCESS_STATE = Object.freeze({
    viewMode: "processed",
    segment: true,
    normalizePunctuation: true,
    removeFillers: false
  });
  const postprocessApi = globalThis.StepAsrPostprocess || {
    processTranscriptText: value => String(value || "")
  };

  const state = {
		    busy: false,
		    currentRequestId: "",
    currentTarget: null,
    currentMediaId: "",
		    progressTimer: 0,
		    progressStep: 0,
		    receivedStreamText: false,
		    resultText: "",
    resultDisplayText: "",
    resultKind: "transcript",
    postprocessState: { ...DEFAULT_POSTPROCESS_STATE },
	    collapsed: true,
	    drag: null,
	    lastDiagnostics: null,
	    autoCollapseTimer: 0,
	    autoCollapseToken: 0
	  };

  function createWidget() {
    if (document.getElementById("stepasr-widget")) return;

	    const root = document.createElement("div");
	    root.id = "stepasr-widget";
	    root.className = "stepasr-widget stepasr-collapsed";
	    root.innerHTML = `
	      <div class="stepasr-pill">
	        <span class="stepasr-pill-grip" title="拖动">⋮⋮</span>
	        <button class="stepasr-pill-main" data-stepasr-toggle title="展开 StepAudio 转写">转写 <span class="stepasr-version" data-stepasr-version></span></button>
		        <span class="stepasr-pill-busy"><span class="stepasr-pill-busy-dot"></span><span class="stepasr-pill-busy-dot"></span><span class="stepasr-pill-busy-dot"></span></span>
		        <button class="stepasr-pill-icon" data-stepasr-open-panel title="打开侧边栏" aria-label="打开侧边栏">☰ 记录</button>
	      </div>
	      <div class="stepasr-card">
	        <div class="stepasr-head">
	          <div class="stepasr-title">StepAudio <span class="stepasr-version" data-stepasr-version></span></div>
	          <div class="stepasr-actions">
		            <button class="stepasr-icon-btn" data-stepasr-open-panel title="打开侧边栏" aria-label="打开侧边栏">☰ 记录</button>
	            <button class="stepasr-icon-btn" data-stepasr-toggle title="收起">−</button>
	          </div>
	        </div>
	        <div class="stepasr-body">
	          <button class="stepasr-primary" data-stepasr-transcribe>转写</button>
		          <button class="stepasr-detect" data-stepasr-detect>检测媒体诊断</button>
		          <button hidden data-stepasr-download-audio></button>
		          <button hidden data-stepasr-download-video></button>
		          <div class="stepasr-target" data-stepasr-target></div>
		          <div class="stepasr-status" data-stepasr-status>请先在侧边栏填入 API Key。</div>
		          <div class="stepasr-result" data-stepasr-result></div>
		          <div class="stepasr-result-count" data-stepasr-result-count></div>
	          <div class="stepasr-footer" data-stepasr-footer>
            <button class="stepasr-secondary" data-stepasr-copy>复制文案</button>
            <button class="stepasr-secondary" data-stepasr-clear>清空</button>
	          </div>
	        </div>
	      </div>
    `;

    root.querySelector("[data-stepasr-transcribe]").addEventListener("click", handlePrimaryAction);
    root.querySelector("[data-stepasr-detect]").addEventListener("click", detectCurrentVideo);
    for (const button of root.querySelectorAll("[data-stepasr-open-panel]")) {
      button.addEventListener("click", openPanel);
    }
    for (const button of root.querySelectorAll("[data-stepasr-toggle]")) {
      button.addEventListener("click", toggleWidget);
    }
	    root.querySelector("[data-stepasr-copy]").addEventListener("click", copyResult);
	    root.querySelector("[data-stepasr-clear]").addEventListener("click", clearResult);
	    root.querySelector(".stepasr-head").addEventListener("pointerdown", startDrag);
	    root.querySelector(".stepasr-pill").addEventListener("pointerdown", startDrag);
		    document.documentElement.appendChild(root);
	    renderExtensionVersion(root);
    applyPostprocessState();
	    restoreWidgetPosition(root);
	  }

	  function renderExtensionVersion(root) {
	    const version = chrome.runtime.getManifest?.().version || "";
	    for (const versionEl of root.querySelectorAll("[data-stepasr-version]")) {
	      versionEl.textContent = version ? `v${version}` : "";
	    }
	  }

  function getElements() {
    const root = document.getElementById("stepasr-widget");
    return {
      root,
		    button: root?.querySelector("[data-stepasr-transcribe]"),
	      actionButtons: root?.querySelectorAll("[data-stepasr-transcribe], [data-stepasr-detect]"),
	      status: root?.querySelector("[data-stepasr-status]"),
      target: root?.querySelector("[data-stepasr-target]"),
	      postprocessToggle: root?.querySelector("[data-stepasr-postprocess-toggle]"),
	      postprocessViewButtons: root?.querySelectorAll("[data-stepasr-view]"),
	      result: root?.querySelector("[data-stepasr-result]"),
	      resultCount: root?.querySelector("[data-stepasr-result-count]"),
	      footer: root?.querySelector("[data-stepasr-footer]")
    };
  }

  function setStatus(text) {
    const { status } = getElements();
    if (status) status.textContent = text || "";
  }

	  function setBusy(isBusy, busyLabel = "转写中...") {
	    state.busy = isBusy;
	    const { button, actionButtons, root } = getElements();
	    for (const actionButton of actionButtons || []) {
	      actionButton.disabled = isBusy && actionButton !== button;
	    }
		    if (button) button.textContent = isBusy ? "取消" : "转写";
	    if (root) root.classList.toggle("stepasr-busy", isBusy);
	    if (!isBusy) stopTypewriter();
	    // Safety timeout: auto-reset after 5 minutes to prevent stuck state
	    clearTimeout(state.busyTimeout);
	    if (isBusy) {
	      state.busyTimeout = setTimeout(() => {
	        if (state.busy) {
	          setBusy(false);
	          setStatus("转写超时，已自动重置。请重试。");
	          showToast("转写超时，请重试。", 5000);
	        }
	      }, 5 * 60 * 1000);
	    }
  }

  function handlePrimaryAction() {
    if (state.busy) {
      cancelTranscription();
      return;
    }
    startTranscription();
  }

  function renderResult(text, kind = "transcript") {
    state.receivedStreamText = false;
    state.resultText = text || "";
    state.resultKind = kind;
    updateResultDisplay(true);
  }

  function renderTransientResult(text, options = {}) {
    const { result, resultCount, footer } = getElements();
    if (!result || !footer) return;
    if (options.stream) {
      state.receivedStreamText = true;
      // Typewriter mode: animate each character
      typewriterAppend(result, text);
      return;
    }
    state.resultText = text || "";
    state.resultDisplayText = text || "";
    result.textContent = state.resultDisplayText;
    result.classList.toggle("is-visible", Boolean(text));
    resultCount?.classList.remove("is-visible");
    footer.classList.remove("is-visible");
    applyPostprocessState();
  }

  let typewriterTimer = 0;
  let typewriterTarget = "";
  let typewriterIndex = 0;
  const TYPewriter_CHARS_PER_TICK = 3;
  const TYPewriter_INTERVAL_MS = 30;

  function typewriterAppend(el, fullText) {
    state.resultText = fullText;
    state.resultDisplayText = fullText;
    typewriterTarget = fullText;
    typewriterIndex = el.textContent.length || 0;
    el.classList.add("is-visible", "is-streaming");
    el.parentElement?.querySelector("[data-stepasr-footer]")?.classList.remove("is-visible");

    if (!typewriterTimer) {
      typewriterTimer = setInterval(() => {
        if (typewriterIndex >= typewriterTarget.length) {
          clearInterval(typewriterTimer);
          typewriterTimer = 0;
          el.classList.remove("is-streaming");
          // Show footer after streaming completes
          const footer = el.parentElement?.querySelector("[data-stepasr-footer]");
          if (footer && state.resultText) footer.classList.add("is-visible");
          return;
        }
        typewriterIndex = Math.min(typewriterIndex + TYPewriter_CHARS_PER_TICK, typewriterTarget.length);
        el.textContent = typewriterTarget.slice(0, typewriterIndex);
      }, TYPewriter_INTERVAL_MS);
    }
  }

  function stopTypewriter() {
    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = 0;
    }
  }

function renderTranscribeTarget(mode = "") {
  const { target } = getElements();
  if (!target) return;
  // Detect media change when not busy - reset pill label
  if (!state.busy && state.currentMediaId) {
    const ctx = getCurrentMediaContext();
    const newId = getContextMediaId(ctx);
    if (newId && newId !== state.currentMediaId) {
      state.currentMediaId = newId;
      state.currentTarget = null;
      setPillMainLabel("转写");
      target.hidden = true;
      target.textContent = "";
      return;
    }
  }
  if (!state.currentTarget?.title) {
    target.hidden = true;
    target.textContent = "";
    return;
  }

  const title = state.currentTarget.title || "";
  const author = state.currentTarget.author ? ` · ${state.currentTarget.author}` : "";
  const prefix = mode === "done" ? "已转写：" : "正在转写：";
  target.textContent = `${prefix}${title}${author}`;
  target.hidden = false;
}

  function updateResultDisplay(shouldResetCopyButton = false) {
    const { result, resultCount, footer } = getElements();
    if (!result || !footer) return;
    state.resultDisplayText = getCurrentResultDisplayText();
    const hasResult = Boolean(state.resultText);
    result.textContent = state.resultDisplayText;
    result.classList.toggle("is-visible", hasResult);
    if (resultCount) {
      const shouldShowCount = hasResult && state.resultKind === "transcript";
      resultCount.textContent = shouldShowCount ? `共 ${countCharacters(state.resultDisplayText)} 字` : "";
      resultCount.classList.toggle("is-visible", shouldShowCount);
    }
    footer.classList.toggle("is-visible", hasResult);
    applyPostprocessState();
    if (!shouldResetCopyButton) return;
    const copyButton = footer.querySelector("[data-stepasr-copy]");
    resetButtonText(copyButton, state.resultKind === "diagnostics" ? "复制诊断" : "复制文案");
  }

  function getCurrentResultDisplayText() {
    if (!state.resultText) return "";
    if (state.resultKind !== "transcript") return state.resultText;
    return getTranscriptDisplayText(state.resultText);
  }

  function getTranscriptDisplayText(originalText) {
    if (state.postprocessState.viewMode !== "processed") return originalText;

    try {
      return postprocessApi.processTranscriptText(originalText, {
        segment: state.postprocessState.segment,
        normalizePunctuation: state.postprocessState.normalizePunctuation,
        removeFillers: state.postprocessState.removeFillers
      });
    } catch {
      return originalText;
    }
  }

  function getCurrentTextVersionLabel() {
    return state.postprocessState.viewMode === "processed" ? "整理版" : "原文";
  }

  function loadPostprocessPreferences() {
    chrome.storage.local.get({ [POSTPROCESS_KEY]: DEFAULT_POSTPROCESS_STATE }, result => {
      state.postprocessState = normalizePostprocessState(result?.[POSTPROCESS_KEY]);
      applyPostprocessState();
      updateResultDisplay(false);
    });
  }

  function normalizePostprocessState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...DEFAULT_POSTPROCESS_STATE };
    }

    return {
      viewMode: value.viewMode === "original" ? "original" : "processed",
      segment: typeof value.segment === "boolean" ? value.segment : DEFAULT_POSTPROCESS_STATE.segment,
      normalizePunctuation: typeof value.normalizePunctuation === "boolean"
        ? value.normalizePunctuation
        : DEFAULT_POSTPROCESS_STATE.normalizePunctuation,
      removeFillers: typeof value.removeFillers === "boolean" ? value.removeFillers : DEFAULT_POSTPROCESS_STATE.removeFillers
    };
  }

  function applyPostprocessState() {
    const { postprocessToggle, postprocessViewButtons } = getElements();
    const shouldShowToggle = state.resultKind === "transcript" && Boolean(state.resultText);
    postprocessToggle?.classList.toggle("is-visible", shouldShowToggle);

    for (const button of postprocessViewButtons || []) {
      const isActive = button.dataset.stepasrView === state.postprocessState.viewMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function setPostprocessViewMode(viewMode) {
    if (!["original", "processed"].includes(viewMode) || state.postprocessState.viewMode === viewMode) return;
    state.postprocessState = { ...state.postprocessState, viewMode };
    applyPostprocessState();
    persistPostprocessPreferences();
    updateResultDisplay(false);
  }

  function persistPostprocessPreferences() {
    chrome.storage.local.set({ [POSTPROCESS_KEY]: { ...state.postprocessState } }, () => {
      if (chrome.runtime.lastError) showToast("查看版本保存失败。");
    });
  }

  function getActiveDouyinVideoId() {
    try {
      // Find the video element that is currently playing
      const videos = Array.from(document.querySelectorAll("video"));
      const active = videos.find(v => !v.paused && v.currentTime > 0) || videos[0];
      if (!active) return "";

      // Walk up DOM tree to find the video card/container with aweme_id
      let el = active;
      for (let depth = 0; el && depth < 12; depth++) {
        const html = el.innerHTML || "";
        const match = html.match(/["']?aweme_id["']?\s*[:=]\s*["']?(\d{8,25})["']?/);
        if (match) return match[1];
        // Also check parent element's attributes
        const attrMatch = (el.getAttribute("data-aweme-id") || "").match(/\d{8,25}/);
        if (attrMatch) return attrMatch[0];
        el = el.parentElement;
      }

      // Fallback: search in all scripts on page for the most recently referenced aweme_id
      const scripts = Array.from(document.scripts).map(s => s.textContent || "");
      let bestId = "";
      let bestPos = -1;
      for (const text of scripts) {
        const re = /["']?aweme_id["']?\s*[:=]\s*["']?(\d{8,25})["']?/g;
        let m;
        while ((m = re.exec(text))) {
          if (m.index > bestPos) { bestPos = m.index; bestId = m[1]; }
        }
      }
      return bestId;
    } catch {
      return "";
    }
  }

  function getCurrentMediaContext() {
    const adapter = globalThis.StepAsrPlatformAdapters?.getCurrentAdapter?.();
    let context = adapter?.detectCurrentMedia?.() || {};
    // Fresh DOM check: override with actual playing video element to avoid stale SPA cache
    if (context.platform === "douyin" || inferPlatformFromLocation() === "douyin") {
      const freshVideoId = getActiveDouyinVideoId();
      if (freshVideoId && freshVideoId !== context.awemeId) {
        context = { ...context, awemeId: freshVideoId, id: freshVideoId, mediaId: freshVideoId };
      }
    }
    return normalizeMediaContext(context);
  }

  function normalizeMediaContext(context = {}) {
    const platform = context.platform || inferPlatformFromLocation();
    const id = context.id || context.awemeId || context.noteId || "";
    const title = context.title || getPageTitle(platform);
    return {
      platform,
      id,
      mediaId: context.mediaId || id,
      awemeId: context.awemeId || (platform === "douyin" ? id : ""),
      noteId: context.noteId || (platform === "xiaohongshu" ? id : ""),
      source: context.source || "",
      title,
      pageUrl: context.pageUrl || location.href,
      cover: context.cover || "",
      author: context.author || "",
      mediaCandidates: Array.isArray(context.mediaCandidates) ? context.mediaCandidates : [],
      diagnostics: context.diagnostics || null,
      errorCode: context.errorCode || "",
      message: context.message || ""
    };
  }

  function getContextMediaId(context) {
    return context?.id || context?.awemeId || context?.noteId || context?.mediaId || "";
  }

  function getPageTitle(platform = inferPlatformFromLocation()) {
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content;
    const fallback = platform === "xiaohongshu" ? "小红书笔记" : "douyin-video";
    const title = metaTitle || document.title || fallback;
    if (platform === "xiaohongshu") {
      return title.replace(/\s+-\s+小红书.*$/u, "").replace(/\s+小红书$/u, "").trim();
    }
    return title.replace(/\s+-\s+抖音.*$/u, "").trim();
  }

  function inferPlatformFromLocation() {
    const host = location.hostname.toLowerCase();
    if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) return "xiaohongshu";
    if (host === "douyin.com" || host.endsWith(".douyin.com")) return "douyin";
    return "unknown";
  }

  function getPlatformLabel(platform) {
    return globalThis.StepAsrPlatformAdapters?.getPlatformLabel?.(platform) ||
      (platform === "xiaohongshu" ? "小红书" : platform === "douyin" ? "抖音" : "当前平台");
  }

  function buildMessagePayload(context, extra = {}) {
    return {
      platform: context.platform,
      id: getContextMediaId(context),
      mediaId: context.mediaId || getContextMediaId(context),
      awemeId: context.awemeId || "",
      noteId: context.noteId || "",
      source: context.source || "",
      pageUrl: context.pageUrl || location.href,
      title: context.title || getPageTitle(context.platform),
      cover: context.cover || "",
      author: context.author || "",
      mediaCandidates: context.mediaCandidates || [],
      diagnostics: context.diagnostics || null,
      errorCode: context.errorCode || "",
      message: context.message || "",
      ...extra
    };
  }

  function startTranscription() {
    if (state.busy) {
      // Check if video changed while transcribing - cancel old and restart
      const ctx = getCurrentMediaContext();
      const newId = getContextMediaId(ctx);
      const newTitle = (ctx.title || "").trim();
      const currTitle = (state.currentTarget?.title || "").trim();
      if ((newId && newId !== state.currentMediaId) || (newTitle && newTitle !== currTitle)) {
        cancelTranscription();
        state.currentMediaId = newId;
        state.currentTarget = { title: newTitle, author: ctx.author || "" };
        setPillMainLabel("转写");
      } else {
        return;
      }
    }

    const context = getCurrentMediaContext();
    const mediaId = getContextMediaId(context);
    // Media change detection: if video switched, reset pill label
    if (mediaId && mediaId !== state.currentMediaId && state.currentMediaId) {
      setPillMainLabel("转写");
    }
    state.currentMediaId = mediaId || "";
    if (context.errorCode === "no-video") {
      const message = context.message || "当前笔记没有视频可转写。";
      setStatus(message);
      renderResult(formatDiagnostics(context.diagnostics), "diagnostics");
      showToast(message);
      state.currentTarget = null;
      renderTranscribeTarget();
      return;
    }

    setBusy(true);
    state.receivedStreamText = false;
    startProgressAnimation();
    renderTransientResult("转写中…");

    const platformLabel = getPlatformLabel(context.platform);
    state.currentTarget = {
      title: context.title || "",
      author: context.author || ""
    };
    renderTranscribeTarget("transcribing");
    state.currentRequestId = makeRequestId();
    const requestId = state.currentRequestId;
    setStatus(mediaId ? "正在提取媒体地址…" : `正在识别当前${platformLabel}内容...`);

    chrome.runtime.sendMessage(
      {
        type: "STEPASR_TRANSCRIBE_MEDIA",
        payload: buildMessagePayload(context, { requestId })
      },
      response => {
        if (state.currentRequestId !== requestId) return;
        state.currentRequestId = "";
        if (chrome.runtime.lastError) {
          stopProgressAnimation();
          setBusy(false);
          setStatus(chrome.runtime.lastError.message);
          return;
        }

        if (!response?.ok) {
          stopProgressAnimation();
          setBusy(false);
          const message = response?.error || "转写失败。";
          setStatus(message);
          showToast(message);
          return;
        }

        stopProgressAnimation();
        setBusy(false);
        setStatus("转写完成。");
        renderTranscribeTarget("done");
        const transcriptText = response.text || "";
        renderResult(transcriptText);
        scheduleAutoCollapse(transcriptText);
      }
    );
  }

  function cancelTranscription() {
    if (!state.currentRequestId) {
		    stopProgressAnimation();
		    setBusy(false);
		    setStatus("转写已取消。");
		    state.currentTarget = null;
		    renderTranscribeTarget();
		    renderResult("");
		    return;
		  }
    chrome.runtime.sendMessage({
      type: "STEPASR_CANCEL_TRANSCRIPTION",
      payload: { requestId: state.currentRequestId }
    });
    state.currentRequestId = "";
    stopProgressAnimation();
    setBusy(false);
    setStatus("转写已取消。");
    renderResult("");
  }

  function startProgressAnimation() {
    stopProgressAnimation();
    state.progressStep = 0;
    state.progressTimer = setInterval(() => {
      if (!state.busy || state.receivedStreamText) return;
      state.progressStep = (state.progressStep + 1) % 3;
      renderTransientResult(`转写中${"…".repeat(state.progressStep + 1)}`);
    }, 1000);
  }

  function stopProgressAnimation() {
    clearInterval(state.progressTimer);
    state.progressTimer = 0;
  }

  function makeRequestId() {
    return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  }

  function scheduleAutoCollapse(text) {
    clearTimeout(state.autoCollapseTimer);
    const token = ++state.autoCollapseToken;
    const count = countCharacters(text);
    state.autoCollapseTimer = setTimeout(() => {
      if (state.busy) return;
    if (state.autoCollapseToken !== token) return;
      const { root } = getElements();
      if (!root) return;
      const title = state.currentTarget?.title || "";
      if (!state.collapsed) {
        state.collapsed = true;
        root.classList.add("stepasr-collapsed");
        const toggle = root.querySelector(".stepasr-icon-btn[data-stepasr-toggle]");
        if (toggle) toggle.textContent = "+";
        requestAnimationFrame(keepWidgetInViewport);
      }
      setPillMainLabel("再次转写");
      const doneText = title ? `${title} 转写完成，共 ${count} 字` : `转写完成，共 ${count} 字`;
      showToast(doneText);
    }, 1500);
  }

  function setPillMainLabel(label) {
    const { root } = getElements();
    if (!root) return;
    const pillMain = root.querySelector(".stepasr-pill-main");
    if (!pillMain) return;
    const version = pillMain.querySelector("[data-stepasr-version]");
    pillMain.textContent = label;
    if (version) {
      pillMain.append(" ");
      pillMain.appendChild(version);
    }
  }

  function countCharacters(value) {
    return Array.from(String(value || "")).length;
  }

	  function downloadCurrentMedia(mediaKind) {
	    if (state.busy) return;
	    const context = getCurrentMediaContext();
	    const mediaId = getContextMediaId(context);
	    const platformLabel = getPlatformLabel(context.platform);
	    const label = mediaKind === "audio" ? "音频" : "视频";

	    setBusy(true, "处理中...");
	    setStatus(mediaId ? `正在解析${label}地址...` : `正在识别当前${platformLabel}内容...`);

	    chrome.runtime.sendMessage(
	      {
	        type: "STEPASR_DOWNLOAD_MEDIA",
	        payload: buildMessagePayload(context, { mediaKind })
	      },
	      response => {
	        setBusy(false);
	        if (chrome.runtime.lastError) {
	          setStatus(chrome.runtime.lastError.message);
	          return;
	        }

	        if (!response?.ok) {
	          const message = response?.error || `${label}下载失败。`;
	          setStatus(message);
	          showToast(message);
	          return;
	        }

	        setStatus(`${label}下载已提交。`);
	        showToast(`${label}下载已提交。`);
	      }
	    );
	  }
	  function detectCurrentVideo(options = {}) {
    const context = getCurrentMediaContext();
    const localMediaId = getContextMediaId(context);
    const platformLabel = getPlatformLabel(context.platform);
    setStatus(localMediaId ? `本地识别到${platformLabel} ID：${localMediaId}，正在后台确认...` : `正在后台检测当前${platformLabel}内容...`);

    return new Promise(resolve => chrome.runtime.sendMessage(
      {
        type: "STEPASR_DETECT_MEDIA",
        payload: buildMessagePayload(context)
      },
      response => {
        if (chrome.runtime.lastError) {
          setStatus(chrome.runtime.lastError.message);
          resolve({ ok: false });
          return;
        }

        if (!response?.ok) {
          const message = response?.error || "没有检测到当前视频。";
          setStatus(message);
          showToast(message);
          resolve({ ok: false });
          return;
        }

        const responseContext = normalizeMediaContext(response.context || {});
        state.lastDiagnostics = responseContext.diagnostics || null;
        if (responseContext.errorCode) {
          const message = responseContext.message || "没有检测到可转写的视频。";
          setStatus(`${message} 已生成诊断信息。`);
          renderResult(formatDiagnostics(responseContext.diagnostics), "diagnostics");
          showToast("请复制诊断信息继续排查。");
          resolve({ ok: false, context: responseContext });
          return;
        }

        const detectedMediaId = getContextMediaId(responseContext);
        if (!detectedMediaId && !responseContext.mediaCandidates.length) {
          setStatus("没有检测到当前媒体，已生成诊断信息。");
          renderResult(formatDiagnostics(responseContext.diagnostics), "diagnostics");
          showToast("请复制诊断信息继续排查。");
          resolve({ ok: false, context: responseContext });
          return;
        }

        const source = responseContext.source ? `，来源：${responseContext.source}` : "";
        const idText = detectedMediaId ? ` ID：${detectedMediaId}` : "媒体地址";
        setStatus(options.silentSuccess ? `已检测到${getPlatformLabel(responseContext.platform)}${idText}${source}，开始转写...` : `已检测到${getPlatformLabel(responseContext.platform)}${idText}${source}`);
        if (!options.silentSuccess) renderResult("");
        resolve({ ok: true, context: responseContext });
      }
    ));
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== "STEPASR_TRANSCRIPTION_DELTA" || !state.busy) return;
    const text = message.payload?.text || "";
    if (text) renderTransientResult(text, { stream: true });
  });

  function openPanel() {
    showToast("正在打开侧边栏...", TOAST_OPENING_DELAY_MS);
    chrome.runtime.sendMessage({ type: "STEPASR_OPEN_PANEL" }, response => {
      if (chrome.runtime.lastError) {
        showToast(formatOpenPanelError(chrome.runtime.lastError.message), TOAST_LONG_DELAY_MS);
        return;
      }
      if (!response?.ok) {
        showToast(formatOpenPanelError(response?.error || "无法打开侧边栏。"), TOAST_LONG_DELAY_MS);
        return;
      }
      showToast("已请求打开侧边栏。", TOAST_DEFAULT_DELAY_MS);
    });
  }

  function formatOpenPanelError(reason) {
    const detail = String(reason || "无法打开侧边栏。").trim();
    if (!detail || detail.includes(OPEN_PANEL_FALLBACK_GUIDE)) return OPEN_PANEL_FALLBACK_GUIDE;
    return `${OPEN_PANEL_FALLBACK_GUIDE}。失败原因：${detail}`;
  }

  function toggleWidget() {
    const { root } = getElements();
    if (!root) return;
    state.autoCollapseToken++;
    clearTimeout(state.autoCollapseTimer);
    const wasCollapsed = state.collapsed;
    state.collapsed = !state.collapsed;
    root.classList.toggle("stepasr-collapsed", state.collapsed);
    const toggle = root.querySelector(".stepasr-icon-btn[data-stepasr-toggle]");
    if (toggle) toggle.textContent = state.collapsed ? "+" : "−";
    // When expanding, detect if user switched to a new video
    if (!state.collapsed && wasCollapsed) {
      const ctx = getCurrentMediaContext();
      const newId = getContextMediaId(ctx);
      if (newId && newId !== state.currentMediaId) {
        state.currentMediaId = newId;
        state.currentTarget = null;
        setPillMainLabel("转写");
      } else if (!newId && state.currentMediaId) {
        state.currentMediaId = "";
        state.currentTarget = null;
        setPillMainLabel("转写");
      } else {
        setPillMainLabel(state.currentMediaId ? "再次转写" : "转写");
      }
    }
    requestAnimationFrame(keepWidgetInViewport);
  }

  async function copyResult() {
    const copyText = getCurrentResultDisplayText();
    if (!copyText) return;
    const { footer } = getElements();
    const copyButton = footer?.querySelector("[data-stepasr-copy]");
    try {
      await writeClipboardText(copyText);
      flashButtonText(copyButton, "已复制 ✓");
      showToast(state.resultKind === "diagnostics" ? "诊断已复制。" : `${getCurrentTextVersionLabel()}文案已复制。`);
    } catch (error) {
      showToast(formatClipboardWriteError(error));
    }
  }

  async function writeClipboardText(text) {
    if (!navigator.clipboard?.writeText) {
      throw new Error("当前浏览器不支持 navigator.clipboard.writeText。");
    }
    await navigator.clipboard.writeText(text);
  }

  function formatClipboardWriteError(error) {
    const detail = error?.message ? `（${error.message}）` : "";
    return `复制失败：浏览器拒绝写入剪贴板，请先点击浮窗按钮后重试，或手动选择文本复制。${detail}`;
  }

  function resetButtonText(button, text) {
    if (!button) return;
    clearTimeout(Number(button.dataset.stepasrFeedbackTimer || 0));
    delete button.dataset.stepasrFeedbackTimer;
    delete button.dataset.stepasrOriginalText;
    button.textContent = text;
  }

  function flashButtonText(button, feedbackText, duration = FEEDBACK_DELAY_MS) {
    if (!button) return;
    const originalText = button.dataset.stepasrOriginalText || button.textContent;
    clearTimeout(Number(button.dataset.stepasrFeedbackTimer || 0));
    button.dataset.stepasrOriginalText = originalText;
    button.textContent = feedbackText;
    const timer = setTimeout(() => {
      button.textContent = button.dataset.stepasrOriginalText || originalText;
      delete button.dataset.stepasrFeedbackTimer;
      delete button.dataset.stepasrOriginalText;
    }, duration);
    button.dataset.stepasrFeedbackTimer = String(timer);
  }

  function clearResult() {
    renderResult("");
    setStatus("已清空。");
  }

  function formatDiagnostics(diagnostics) {
    if (!diagnostics) return "没有返回诊断信息。";
    if (diagnostics.platform === "xiaohongshu") {
      return [
        "StepAudio Transcriber diagnostics",
        "platform: xiaohongshu",
        `pageUrl: ${diagnostics.pageUrl || ""}`,
        `title: ${diagnostics.title || ""}`,
        `noteId: ${diagnostics.noteId || ""}`,
        `urlNoteId: ${diagnostics.urlNoteId || ""}`,
        `matchedNoteId: ${diagnostics.matchedNoteId || ""}`,
        `matchStrategy: ${diagnostics.matchStrategy || ""}`,
        `source: ${diagnostics.source || ""}`,
        `cacheNoteIds: ${JSON.stringify(diagnostics.cacheNoteIds || [])}`,
        `hasInitialState: ${diagnostics.hasInitialState}`,
        `initialStateSource: ${diagnostics.initialStateSource || ""}`,
        `noteFound: ${diagnostics.noteFound}`,
        `noteSearchSource: ${diagnostics.noteSearchSource || ""}`,
        `noteDetailMapSources: ${JSON.stringify(diagnostics.noteDetailMapSources || [])}`,
        `noteDetailMapKeys: ${JSON.stringify(diagnostics.noteDetailMapKeys || [])}`,
        `hasVideoObject: ${diagnostics.hasVideoObject}`,
        `videoElementCount: ${diagnostics.videoElementCount}`,
        `skippedBlobVideoCount: ${diagnostics.skippedBlobVideoCount}`,
        `candidateCount: ${diagnostics.candidateCount}`,
        `errorCode: ${diagnostics.errorCode || ""}`,
        `message: ${diagnostics.message || ""}`,
        "candidateSources:",
        ...((diagnostics.candidateSources || []).map(item => `- kind=${item.kind} score=${item.score} source=${item.source} host=${item.host}`))
      ].join("\n");
    }

    return [
      "StepAudio Douyin Transcriber diagnostics",
      `pageUrl: ${diagnostics.pageUrl || ""}`,
      `title: ${diagnostics.title || ""}`,
      `videoCount: ${diagnostics.videoCount}`,
      `visibleVideoCount: ${diagnostics.visibleVideoCount}`,
      `linkCandidateCount: ${diagnostics.linkCandidateCount}`,
      `candidateCount: ${diagnostics.candidateCount}`,
      `hasOgUrl: ${diagnostics.hasOgUrl}`,
      `hasCanonical: ${diagnostics.hasCanonical}`,
      "topCandidates:",
      ...((diagnostics.topCandidates || []).map(item => `- id=${item.id} score=${item.score} hits=${item.hits} source=${item.source}`))
    ].join("\n");
  }

  function showToast(message, duration = TOAST_DEFAULT_DELAY_MS) {
    const { root } = getElements();
    const old = root?.querySelector(".stepasr-toast") || document.querySelector(".stepasr-toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.className = "stepasr-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    (root || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  function startDrag(event) {
    if (event.button !== 0) return;
    if (event.target.closest(".stepasr-actions, button")) return;

    const { root } = getElements();
    if (!root) return;

    const rect = root.getBoundingClientRect();
    state.drag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    };

    root.classList.add("stepasr-dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", moveWidget);
    document.addEventListener("pointerup", stopDrag, { once: true });
    document.addEventListener("pointercancel", stopDrag, { once: true });
    event.preventDefault();
  }

  function moveWidget(event) {
    const { root } = getElements();
    if (!root || !state.drag) return;

    const rect = root.getBoundingClientRect();
    const left = clamp(event.clientX - state.drag.offsetX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(event.clientY - state.drag.offsetY, 8, window.innerHeight - rect.height - 8);

    applyWidgetPosition(root, left, top);
    state.drag.moved = true;
  }

  function stopDrag() {
    const { root } = getElements();
    document.removeEventListener("pointermove", moveWidget);
    document.removeEventListener("pointerup", stopDrag);
    document.removeEventListener("pointercancel", stopDrag);

    if (root) {
      root.classList.remove("stepasr-dragging");
      if (state.drag?.moved) {
        const rect = root.getBoundingClientRect();
        chrome.storage.local.set({
          [POSITION_KEY]: {
            left: Math.round(rect.left),
            top: Math.round(rect.top)
          }
        });
      }
    }

    state.drag = null;
  }

  function restoreWidgetPosition(root) {
    chrome.storage.local.get({ [POSITION_KEY]: null }, result => {
      const position = result[POSITION_KEY];
      if (!position || typeof position.left !== "number" || typeof position.top !== "number") return;

      requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        const left = clamp(position.left, 8, window.innerWidth - rect.width - 8);
        const top = clamp(position.top, 8, window.innerHeight - rect.height - 8);
        applyWidgetPosition(root, left, top);
      });
    });
  }

  function keepWidgetInViewport() {
    const { root } = getElements();
    if (!root || !root.style.left || !root.style.top) return;

    const rect = root.getBoundingClientRect();
    const left = clamp(rect.left, 8, window.innerWidth - rect.width - 8);
    const top = clamp(rect.top, 8, window.innerHeight - rect.height - 8);
    applyWidgetPosition(root, left, top);
  }

  function applyWidgetPosition(root, left, top) {
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== "STEPASR_STATUS") return;
    setStatus(message.payload?.status || "");
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[POSTPROCESS_KEY]) return;
    state.postprocessState = normalizePostprocessState(changes[POSTPROCESS_KEY].newValue);
    updateResultDisplay(false);
  });

  loadPostprocessPreferences();
  createWidget();
  const observer = new MutationObserver(createWidget);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", keepWidgetInViewport);

  // Detect video change: check page title + URL + DOM state
  let lastDetectMediaId = "";
  const detectMediaChange = () => {
    if (state.busy || state.collapsed) return;
    const ctx = getCurrentMediaContext();
    const newId = getContextMediaId(ctx);
    const newTitle = (ctx.title || "").trim();
    const currTitle = (state.currentTarget?.title || "").trim();
    // Reset if mediaId changed OR title changed (same video, different content)
    if (newId && newId !== state.currentMediaId) {
      state.currentMediaId = newId;
      state.currentTarget = { title: newTitle, author: ctx.author || "" };
      setPillMainLabel("转写");
    } else if (newTitle && newTitle !== currTitle && currTitle) {
      state.currentTarget = { title: newTitle, author: ctx.author || "" };
      setPillMainLabel("转写");
    }
  };
  // Run on interval and also listen for popstate (browser back/forward)
  setInterval(detectMediaChange, 1500);
  window.addEventListener("popstate", detectMediaChange);






  // Media change detector: when not busy, periodically check if user switched videos
  state.mediaPollTimer = setInterval(() => {
    if (state.busy || state.collapsed) return;
    const ctx = getCurrentMediaContext();
    const newId = getContextMediaId(ctx);
    if (newId && newId !== state.currentMediaId) {
      state.currentMediaId = newId;
      state.currentTarget = null;
      setPillMainLabel("转写");
      const { target } = getElements();
      if (target) { target.hidden = true; target.textContent = ""; }
    }
  }, 2000);

  // Keyboard shortcuts
  document.addEventListener("keydown", event => {
    const mod = event.metaKey || event.ctrlKey;
    // Ctrl/Cmd + Shift + T: toggle widget
    if (mod && event.shiftKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      toggleWidget();
    }
    // Ctrl/Cmd + Shift + C: copy result (when widget has result)
    if (mod && event.shiftKey && event.key.toLowerCase() === "c" && state.resultText && !window.getSelection()?.toString()) {
      event.preventDefault();
      copyResult();
    }
  });
})();
