# 音频转文案插件

扩展名称：Audio to Text Transcriber

这是一个 Chrome / Chromium MV3 扩展，用于把受支持网页视频里的音频转成文案。插件按核心任务命名：音频转文字。平台适配和 ASR 服务适配只是实现细节。

当前版本支持抖音和小红书页面适配，默认使用用户自己配置的 StepFun StepAudio ASR 接口。

## 适合谁

- 想把短视频、口播、访谈、课程片段转成文字稿的人。
- 想在浏览器里直接从当前视频提取音频并转写的人。
- 想保留本地转写历史，并按需复制、导出或同步到飞书多维表格的人。

## 主要功能

- 在受支持的视频页面注入右下角「转写」浮窗。
- 点击「转写」后自动检测当前媒体，检测成功后直接开始转写。
- 转写中显示流式文本或进度提示，并支持取消。
- 支持下载当前媒体的音频或视频资源。
- 侧边栏保存 API 设置、历史记录、后处理选项和同步配置。
- 历史记录支持复制、编辑、删除、搜索、多选、导出 TXT / Markdown / JSON。
- 可选同步到飞书多维表格，只同步用户主动选择的记录。
- 提供不含 API Key、Prompt、热词原文和正文内容的诊断报告。

## 安装方式

### 方式一：使用 Release 包

1. 打开 [Releases](https://github.com/Songxiaor/audio-to-text-transcriber/releases)。
2. 下载最新的 `audio-to-text-transcriber-<version>.zip`。
3. 解压 ZIP。
4. 打开 Chrome / Chromium 的扩展管理页面：
   - Chrome：`chrome://extensions/`
   - ChatGPT Atlas：`atlas://extensions/`
5. 开启「开发者模式」。
6. 点击「加载已解压的扩展程序」。
7. 选择解压后的扩展目录。

本地安装会显示“来源无法验证”一类提示，这是浏览器对非商店扩展的正常提示。面向普通用户分发时，应通过 Chrome Web Store 或目标浏览器扩展商店发布。

### 方式二：使用本地构建包

```bash
node scripts/verify-release.mjs
./build-package.sh
```

构建后会生成：

- `dist/audio-to-text-transcriber-<version>.zip`
- `dist/audio-to-text-transcriber-<version>.crx`
- `dist/audio-to-text-transcriber-latest.zip`
- `dist/audio-to-text-transcriber-latest.crx`

推荐上传扩展商店的是 ZIP，不是 CRX，也不是 PEM。

## 快速开始

1. 安装扩展后，点击浏览器工具栏里的扩展图标，打开右侧侧边栏。
2. 进入设置区域，填入你的 ASR API Key。
3. 保持默认 Endpoint，除非你的账号提供了不同地址。
4. 点击「测试 API」，确认 Key、Endpoint、模型权限和额度可用。
5. 打开一条受支持的视频页面，例如抖音或小红书视频页。
6. 点击页面右下角浮窗里的「转写」。
7. 等待转写结果出现后，可以复制、清空、下载媒体，或到侧边栏查看历史记录。

## 日常使用

### 转写当前视频

打开受支持的视频页面后，点击浮窗里的「转写」。插件会先检测当前媒体，检测成功后自动进入转写流程，不需要再点第二次。

### 取消转写

转写过程中主按钮会变成「取消」。点击后会中断当前请求，并保留已有界面状态。

### 下载音频或视频

检测到媒体后，可以使用下载按钮保存当前平台资源。下载走浏览器下载管理器，不会自动发送到 ASR 服务。

### 查看和管理历史

点击浮窗里的「☰ 记录」或浏览器扩展图标打开侧边栏。历史记录支持：

- 搜索记录。
- 复制文案。
- 编辑正文。
- 删除单条记录。
- 多选后批量复制、导出、删除或同步。

### 导出结果

历史记录可以导出为：

- TXT
- Markdown
- JSON

### 后处理文案

侧边栏提供后处理选项，包括智能分段、标点规范化、去口水词。选项会保存到本地，刷新后仍然生效。

## API 配置

默认 Endpoint：

```text
https://api.stepfun.com/step_plan/v1/audio/asr/sse
https://api.stepfun.ai/step_plan/v1/audio/asr/sse
```

默认 Model：

```text
stepaudio-2.5-asr
```

API Key 存在浏览器本地 `chrome.storage.local`，不会写入页面 DOM。这个版本是纯插件直连模式，适合个人使用和小范围测试。大规模商业分发时，建议改成「插件 -> 你的后端 -> ASR 服务」的结构。

## 飞书同步

飞书同步是可选功能。用户需要在侧边栏填写：

- 飞书 `app_id`
- 飞书 `app_secret`
- 多维表格链接
- 字段映射

只有用户点击「同步到飞书」或「批量同步飞书」时，插件才会把选中的转写记录写入指定多维表格。插件不会自动上传全部历史记录。

## 排错

### 没检测到媒体

1. 确认当前页面是受支持的视频页。
2. 刷新页面后重试。
3. 点击「检测媒体诊断」。
4. 打开侧边栏，点击「复制诊断」。
5. 把诊断报告发给维护者。

诊断报告不会包含 API Key、热词原文、Prompt 或转写正文。

### API 测试失败

检查：

- API Key 是否填入。
- Endpoint 是否正确。
- Model 是否有权限。
- 账号是否有 ASR 额度。
- 网络是否能访问 ASR Endpoint。

### 浏览器提示来源无法验证

这是本地 CRX 或开发者模式安装的正常提示。想让普通用户无提示安装，需要发布到扩展商店。

## 开发

源码目录：

```text
douyin-stepasr-extension/
```

常用校验：

```bash
node scripts/verify-release.mjs
node scripts/verify-release.mjs --dist
```

可选真实 ASR 连通性测试：

```bash
node scripts/live-test-stepaudio.mjs
```

脚本会隐藏输入 API Key，不会把 Key 写入文件或输出到终端。

## 发布

```bash
./build-package.sh
```

发布前确认：

- `node scripts/verify-release.mjs` 通过。
- `node scripts/verify-release.mjs --dist` 通过。
- ZIP 不包含 `_metadata`、PEM、签名 key、内部进度记录。
- 隐私说明覆盖 ASR 请求、下载、历史记录、诊断报告和飞书同步。

签名 key 不进入 git。若本地存在 `signing-key/stepaudio-douyin-transcriber.pem`，构建脚本会复用这个历史签名 key，以保持改名后的扩展 ID 不变，避免用户本地设置和历史记录丢失。

## 隐私边界

插件把设置和转写历史保存在浏览器扩展本地存储中。只有用户主动点击转写时，音频数据才会发送到已配置的 ASR 接口。飞书同步是可选功能，只会在用户主动点击同步操作时发送选中的记录。

完整隐私说明见 `douyin-stepasr-extension/PRIVACY.md`。