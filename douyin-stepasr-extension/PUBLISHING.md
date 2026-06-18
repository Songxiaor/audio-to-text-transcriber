# Publishing Checklist

This extension can be loaded locally for testing, but ordinary users will see an unverified-source warning when a CRX is installed outside an official extension store. To distribute without that warning, publish the ZIP package to Chrome Web Store or the target browser's extension store.

## Release Artifact

Build from the workspace root:

```bash
./build-package.sh
```

The build script runs:

```bash
node scripts/verify-release.mjs
node scripts/verify-release.mjs --dist
```

The verifier also runs `scripts/test-stepaudio-client.mjs`, which unit-tests the shared StepAudio request builder and SSE parser used by the extension background service worker.

Upload this file to the store:

```text
dist/audio-to-text-transcriber-<version>.zip
```

For handoff and support, the build also writes stable aliases:

```text
dist/audio-to-text-transcriber-latest.zip
dist/audio-to-text-transcriber-latest.crx
```

The `.crx` file is only for local testing or managed enterprise deployment.

## Signing Key

Local CRX builds must reuse the same private key, otherwise Chrome / Atlas will treat each release as a different extension and users will lose local settings/history during upgrades.

The build script uses this stable key:

```text
../signing-key/stepaudio-douyin-transcriber.pem
```

Rules:

- Do not delete or regenerate this PEM after users install a CRX build.
- Keep file permission restricted to the publisher.
- Do not publish the PEM file or commit it to a public repository.
- Chrome Web Store signing is handled by the store; upload the ZIP package there.

## Store Listing Draft

Name:

```text
Audio to Text Transcriber
```

Short description:

```text
Turn supported web video audio into text with your own ASR API key.
```

Detailed description:

```text
Audio to Text Transcriber adds a small movable panel to supported video pages. It detects the current media, extracts the audio source, and sends the audio to the configured ASR API using the API key provided by the user. Results are shown on the page and saved locally in browser storage. Current ASR integration uses StepFun StepAudio, and current platform adapters support Douyin and Xiaohongshu.

Main features:
- Detect current media on supported video pages, including platform-specific IDs, modal URLs, visible video elements, page links, and page state.
- Download the detected audio or video through the browser download manager when the user clicks the download buttons.
- Submit supported audio formats directly to StepAudio ASR.
- Convert unsupported media to 16k mono PCM in the browser before transcription.
- Store API settings and transcription history locally.
- Provide a diagnostic report when the current video cannot be detected.
- Test the configured StepAudio API endpoint with a tiny silent PCM request before users open Douyin.

The extension does not provide a StepFun account or API quota. Users need their own StepFun API key.
```

Category:

```text
Productivity
```

Language:

```text
Chinese (Simplified), English
```

## Store Assets

Generate listing screenshots and the small promotional image from the workspace root:

```bash
node scripts/generate-store-assets.mjs
```

Upload or attach these assets in the store dashboard:

```text
store-assets/screenshot-01-floating-panel.png
store-assets/screenshot-02-settings-api-test.png
store-assets/screenshot-03-detection-diagnostics.png
store-assets/screenshot-04-downloads.png
store-assets/screenshot-05-history.png
store-assets/promo-small-440x280.png
```

The five screenshots are `1280x800`. The small promotional image is `440x280`.

## Permission Justification

`storage`:

Stores user API settings, widget position, and local transcription history.

`scripting`:

Runs a small script in the Douyin page context to read the current video state and fetch Douyin video details with the user's existing page session.

`declarativeNetRequest` and `declarativeNetRequestWithHostAccess`:

Adds standard Douyin Referer/User-Agent headers for media fetches from Douyin CDN domains.

`offscreen`:

Decodes unsupported browser media formats and converts them to 16k mono PCM before sending them to StepAudio ASR.

`clipboardRead`:

Used only when the user clicks the API Key paste button in the extension settings page.

`clipboardWrite`:

Copies transcription results or diagnostics when the user clicks the copy button.

`downloads`:

Starts a browser-managed download only after the user clicks "Download audio" or "Download video". The extension does not download files in the background without a user action.

`sidePanel`:

Provides the settings/history panel where users configure their StepFun API key.

`https://open.feishu.cn/*`:

Used only for the optional Feishu Bitable sync feature. When the user clicks a Feishu sync action, the extension requests a tenant access token with the user-provided app credentials and writes the selected transcription record to the configured Bitable table.

API test behavior:

When the user clicks "Test API", the extension sends a very short silent PCM audio payload to the configured ASR endpoint to verify API connectivity and authentication. This is user-triggered and does not run automatically.

`permissions` and `optional_host_permissions`:

Requests access to a custom API endpoint only when the user chooses an endpoint outside the built-in StepFun API domains.

Host permissions:

- `*://*.douyin.com/*`: Detects the active Douyin video, injects the user-facing floating panel, and fetches video details with the user's current page session.
- Douyin CDN domains such as `*.douyinvod.com`, `*.douyincdn.com`, `*.douyinstatic.com`, `*.bytegoofy.com`, `*.byteimg.com`, and `*.zjcdn.com`: Allows media downloads and transcription fetches from Douyin media resources.
- `https://api.stepfun.com/*`: Sends user-triggered ASR requests and API test requests to the Chinese Step Plan endpoint.
- `https://api.stepfun.ai/*`: Supports StepFun's alternate Step Plan endpoint documented in the English API docs and allows automatic mirror fallback when one official domain rejects authentication.

## Privacy Tab Draft

Single purpose:

```text
Help users transcribe and download audio from supported web video pages using their own ASR API key, with optional user-triggered sync of selected transcription records to the user's Feishu Bitable.
```

Data usage disclosure:

```text
The extension stores API settings, optional Feishu sync settings, local transcription history, widget position, recent API test metadata, and recent video detection diagnostics in browser local extension storage. When the user clicks "Transcribe current video", the extension sends the selected media audio payload to the ASR endpoint configured by the user. When the user clicks "Test API", the extension sends a short silent PCM audio payload to the configured endpoint. When the user clicks "Download audio" or "Download video", the extension passes the resolved media URL to the browser download manager. When the user clicks a Feishu sync action, the extension sends the selected transcription record to the user's configured Feishu Bitable. The extension does not operate a backend server, does not collect analytics, and does not sell user data.
```

Authentication information:

```text
The user's StepFun API key is stored only in chrome.storage.local and is sent only to the configured ASR endpoint as an Authorization header when the user tests the API or starts transcription.
```

Website content:

```text
The extension reads supported platform page state and media URLs only to detect the current media, download user-requested media, and prepare user-triggered transcription.
```

Remote code:

```text
The extension does not execute remotely hosted code. All extension JavaScript, CSS, and assets are bundled in the submitted package.
```

## Privacy Summary

- API key is stored in `chrome.storage.local`.
- Optional Feishu app credentials, Bitable URL/token, table ID, and field mapping are stored in `chrome.storage.local`.
- Transcription history is stored in `chrome.storage.local`.
- Audio data is sent to the configured StepAudio-compatible ASR endpoint when the user clicks transcribe.
- Supported platform media URLs are sent to the browser download manager when the user clicks download.
- Selected transcription records are sent to Feishu only when the user clicks a Feishu sync action.
- The extension does not operate a separate server.
- The extension does not sell or share user data.

Use `PRIVACY.md` as the privacy policy draft.

## Store Review Risk Checklist

- Confirm the extension has one narrow purpose: audio-to-text transcription for supported web media with user-triggered downloads and optional sync.
- Confirm all declared permissions are documented above.
- Confirm screenshots show the floating panel, settings page, version badge, API test, and diagnostics copy flow.
- Confirm `dist/audio-to-text-transcriber-<version>.zip` is uploaded, not the CRX and not the PEM.
- Confirm the privacy policy URL is public before submitting.
- Confirm no real API key, PEM, local logs, or user data are included in the uploaded ZIP.
