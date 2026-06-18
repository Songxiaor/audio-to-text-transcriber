# User Install Guide

This guide is for testers or customers installing Audio to Text Transcriber outside an extension store.

## Recommended Install Path

For ordinary users, the clean path is an official extension store listing. Local CRX and developer-mode installs may show an unverified-source warning in Chrome, ChatGPT Atlas, or other Chromium browsers.

## Local Test Install

Use this package:

```text
dist/audio-to-text-transcriber-latest.crx
```

If the browser refuses CRX installation, use developer mode:

1. Open `chrome://extensions/` or `atlas://extensions/`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the folder `douyin-stepasr-extension`.
5. Confirm the floating panel or side panel shows the expected version.

## First Use

1. Click the extension icon to open the side panel, then switch to the settings tab.
2. Paste the StepAudio API key.
3. Keep the default endpoint unless your StepFun account gives a different one.
4. Click "Test API".
5. Open a single Douyin or Xiaohongshu video page.
6. Click "Transcribe"; the extension will detect the current media first and continue automatically.
7. Use "Detect media diagnostics" only when media detection fails or you need a report for troubleshooting.

## Version Check

The current extension version appears in two places:

- Floating panel title on supported Douyin or Xiaohongshu pages.
- Top-right badge in the side panel.

Current package version: `v3.0.2`.

If a user still sees old API key format errors, they are not running `v0.1.24` or later. If a Step Plan subscription key that previously worked starts showing authentication errors on `api.stepfun.ai`, upgrade to `v0.1.28` or later so the extension can use the Chinese Step Plan `.com` endpoint and mirror fallback.

## Troubleshooting

If media detection fails:

1. Click "Detect media diagnostics" on the supported page.
2. Click the extension icon to open the side panel.
3. Click "Copy diagnostics".
4. Send the copied report to the maintainer.

The diagnostics report does not include the API key, hotword text, prompt text, or transcription body.

If API testing fails:

1. Confirm the key was pasted into the API Key field.
2. Confirm the endpoint is `https://api.stepfun.com/step_plan/v1/audio/asr/sse` for Chinese Step Plan accounts, unless StepFun provided a different endpoint.
3. Confirm the model is `stepaudio-2.5-asr`.
4. Check whether the StepFun subscription has ASR quota and model access.
5. Copy diagnostics after testing. The report includes the latest API test status, endpoint, model, and key length, but not the key value.

If the browser shows "source cannot be verified":

That is expected for local CRX distribution outside an official store. Publish the ZIP package to the target extension store to remove this warning for ordinary users.
