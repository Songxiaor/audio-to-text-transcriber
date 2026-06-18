# Audio to Text Transcriber

Chrome / Chromium MV3 extension for turning supported web video audio into text with a user-provided ASR API key.

The extension is intentionally named by its core job: audio-to-text transcription. Platform adapters and ASR provider integration are implementation details. The current build supports Douyin and Xiaohongshu page adapters, and uses the StepFun StepAudio ASR endpoint by default.

## Project Layout

- `douyin-stepasr-extension/`: extension source.
- `scripts/`: release checks, unit checks, store asset generation, and optional live ASR smoke test.
- `store-assets/`: Chrome Web Store screenshots and promo image.
- `build-package.sh`: creates release ZIP/CRX artifacts under `dist/`.

## Build

```bash
node scripts/verify-release.mjs
./build-package.sh
```

Release artifacts:

- `dist/audio-to-text-transcriber-<version>.zip`
- `dist/audio-to-text-transcriber-<version>.crx`
- `dist/audio-to-text-transcriber-latest.zip`
- `dist/audio-to-text-transcriber-latest.crx`

The signing key is intentionally excluded from git. Local builds reuse `signing-key/stepaudio-douyin-transcriber.pem` when present to preserve the extension ID across the historical rename.

## Privacy Boundary

The extension stores settings and transcription history in local browser extension storage. Audio is sent to the configured ASR endpoint only when the user triggers transcription. Optional Feishu sync sends selected records only when the user triggers a sync action.

See `douyin-stepasr-extension/PRIVACY.md` for the full policy draft.
