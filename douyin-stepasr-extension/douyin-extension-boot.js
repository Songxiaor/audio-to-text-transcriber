(function initDouyinExtensionBoot(globalScope) {
  if (globalScope.DouyinExtensionBoot) return;

  const DouyinExtensionBoot = {
    CONTENT_CSS_FILES: ["content.css"],
    CONTENT_SCRIPT_FILES: ["platform-adapter-core.js", "douyin-detector.js", "douyin-adapter.js", "postprocess.js", "content.js"],
    DOUYIN_CONTENT_SCRIPT_FILES: ["platform-adapter-core.js", "douyin-detector.js", "douyin-adapter.js", "postprocess.js", "content.js"],
    XIAOHONGSHU_MAIN_WORLD_SCRIPT_FILES: ["xiaohongshu-feed-hook.js"],
    XIAOHONGSHU_CONTENT_SCRIPT_FILES: ["platform-adapter-core.js", "xiaohongshu-adapter.js", "postprocess.js", "content.js"],
    DOUYIN_TAB_URL_PATTERNS: [
      "*://douyin.com/*",
      "*://www.douyin.com/*",
      "*://*.douyin.com/*"
    ],
    XIAOHONGSHU_TAB_URL_PATTERNS: [
      "*://xiaohongshu.com/*",
      "*://www.xiaohongshu.com/*",
      "*://*.xiaohongshu.com/*"
    ],
    getContentScriptFilesForUrl,
    getMainWorldContentScriptFilesForUrl,
    isDouyinPageUrl,
    isSupportedPageUrl,
    isXiaohongshuPageUrl
  };

  DouyinExtensionBoot.SUPPORTED_TAB_URL_PATTERNS = [
    ...DouyinExtensionBoot.DOUYIN_TAB_URL_PATTERNS,
    ...DouyinExtensionBoot.XIAOHONGSHU_TAB_URL_PATTERNS
  ];

  function isDouyinPageUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }

    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host === "douyin.com" || host.endsWith(".douyin.com");
  }

  function isXiaohongshuPageUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }

    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com");
  }

  function isSupportedPageUrl(rawUrl) {
    return isDouyinPageUrl(rawUrl) || isXiaohongshuPageUrl(rawUrl);
  }

  function getContentScriptFilesForUrl(rawUrl) {
    if (isXiaohongshuPageUrl(rawUrl)) return DouyinExtensionBoot.XIAOHONGSHU_CONTENT_SCRIPT_FILES;
    return DouyinExtensionBoot.DOUYIN_CONTENT_SCRIPT_FILES;
  }

  function getMainWorldContentScriptFilesForUrl(rawUrl) {
    if (isXiaohongshuPageUrl(rawUrl)) return DouyinExtensionBoot.XIAOHONGSHU_MAIN_WORLD_SCRIPT_FILES;
    return [];
  }

  globalScope.DouyinExtensionBoot = DouyinExtensionBoot;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DouyinExtensionBoot;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
