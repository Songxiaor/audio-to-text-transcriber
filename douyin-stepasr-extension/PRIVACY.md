# Privacy Policy Draft

Audio to Text Transcriber is a browser extension that helps users download and transcribe audio from supported web video pages with their own ASR API key. The current version supports the StepFun StepAudio ASR endpoint and Douyin/Xiaohongshu platform adapters.

## Data Stored Locally

The extension stores the following data in the user's browser local extension storage:

- StepFun API endpoint and API key
- ASR model, language, hotwords, prompt, and audio conversion settings
- Optional Feishu sync settings, including app_id, app_secret, Bitable URL/token, table ID, and field mapping
- Widget position on supported Douyin and Xiaohongshu pages
- Local transcription history
- Latest API test and video detection diagnostics for troubleshooting

The extension does not store this data on a developer-operated server.

## Data Sent to Third Parties

When the user clicks "Transcribe current video", the extension may send audio data from the current supported Douyin or Xiaohongshu video to the ASR endpoint configured by the user. When the user clicks "Test API", the extension sends a very short silent PCM audio payload to the same endpoint to verify connectivity. By default, this endpoint is:

```text
https://api.stepfun.com/step_plan/v1/audio/asr/sse
```

The extension also includes host access for `https://api.stepfun.ai/*` because StepFun's English documentation uses that domain for the same Step Plan ASR path. If the user configures a custom endpoint, audio data is sent to that endpoint instead.

When the user clicks "Download audio" or "Download video", the extension passes the resolved supported-platform media URL to the browser download manager. The extension does not send downloaded media to any ASR endpoint unless the user separately clicks "Transcribe current video".

The user's StepFun API key is sent only to the configured ASR endpoint as an `Authorization` header when the user tests the API or starts transcription.

If the user enables Feishu Bitable sync and clicks a sync action, the extension sends the configured Feishu app_id and app_secret to Feishu's tenant access token API, then sends the selected transcription record fields to the configured Feishu Bitable table. The extension does not sync to Feishu automatically and does not send transcription history to Feishu unless the user triggers a sync action.

## Data Not Collected by This Extension

The extension does not operate a backend server. It does not collect analytics, sell data, or share data with advertisers.

The extension does not execute remotely hosted code. Extension scripts, styles, and assets are bundled with the extension package.

## User Control

Users can clear local transcription history from the extension settings page. Users can remove the API key or Feishu sync credentials by clearing the corresponding fields and saving settings, or by uninstalling the extension.

## Contact

This draft should be updated with the publisher's official support email and website before store submission.
