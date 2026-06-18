# 音频转文案插件

扩展名称：Audio to Text Transcriber

这是一个 Chrome / Chromium MV3 扩展，用于把受支持网页视频里的音频转成文案。插件的命名按核心任务来定：音频转文字。平台适配和 ASR 服务适配只是实现细节。

当前版本支持抖音和小红书页面适配，默认使用用户自己配置的 StepFun StepAudio ASR 接口。

## 目录结构

- `douyin-stepasr-extension/`：扩展源码。
- `scripts/`：发布校验、单元测试、商店素材生成、可选的真实 ASR 连通性测试脚本。
- `store-assets/`：Chrome Web Store 截图和推广图。
- `build-package.sh`：生成发布 ZIP / CRX 包，输出到 `dist/`。

## 构建与校验

```bash
node scripts/verify-release.mjs
./build-package.sh
```

构建后会生成：

- `dist/audio-to-text-transcriber-<version>.zip`
- `dist/audio-to-text-transcriber-<version>.crx`
- `dist/audio-to-text-transcriber-latest.zip`
- `dist/audio-to-text-transcriber-latest.crx`

签名 key 不进入 git。若本地存在 `signing-key/stepaudio-douyin-transcriber.pem`，构建脚本会复用这个历史签名 key，以保持改名后的扩展 ID 不变，避免用户本地设置和历史记录丢失。

## 隐私边界

插件把设置和转写历史保存在浏览器扩展本地存储中。只有用户主动点击转写时，音频数据才会发送到已配置的 ASR 接口。飞书同步是可选功能，只会在用户主动点击同步操作时发送选中的记录。

完整隐私说明见 `douyin-stepasr-extension/PRIVACY.md`。