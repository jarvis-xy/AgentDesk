# Token Ledger

[English](README.md)

Token Ledger 是一个本地优先的 AI 编程 Token 消耗统计面板。

它会扫描你电脑上 AI 编程工具保存在本地的用量元数据，按日期、工具和模型聚合 token 消耗，并基于可配置的价格表估算成本。它适合想了解 AI 编程真实消耗、但又不想上传代码、提示词、对话或文件路径的用户。

## 功能特性

- 本地网页面板：`http://127.0.0.1:5188`
- 不需要云端账号
- 不上传遥测数据
- 只扫描本地用量元数据
- 每日 token 消耗趋势
- 工具占比
- 模型消耗分布
- 按天明细表
- 输入、缓存、输出 token 拆分
- 基于 `pricing.json` 的预估成本
- 深色 / 浅色模式
- 手动重新扫描

## 当前支持的数据源

当前已支持：

- Codex
- Claude Code
- OpenClaw
- Hermes

实验性或受限支持：

- Gemini CLI：只有在本地存在 token 元数据时才会统计。没有发现 token 元数据时，不应该理解为“用量为 0”。
- Cursor、Trae 等 IDE：只有在工具本身暴露本地 token 元数据时，才能进行准确统计。

## 隐私说明

Token Ledger 是本地优先工具：

- 不上传代码
- 不上传提示词或对话
- 不上传文件路径
- 只读取模型名称、时间戳、输入 token、缓存 token、输出 token、总 token 等用量元数据

详细说明见 [docs/privacy.md](docs/privacy.md)。

## 快速开始

环境要求：

- Node.js 18 或更高版本
- macOS、Linux 或 Windows

安装依赖：

```bash
npm install
```

启动本地服务：

```bash
npm start
```

打开：

```text
http://127.0.0.1:5188
```

如果要重新扫描，在页面点击 `重新扫描`。

## 如何使用

1. 启动本地服务：

```bash
npm start
```

2. 打开本地面板：

```text
http://127.0.0.1:5188
```

3. 等待首次扫描完成。扫描器会读取本机支持工具的 token 用量元数据，并展示：

- 全量历史 token
- 最近一天 token
- 有消耗的天数
- 预估成本
- 每日 token 消耗趋势
- 工具占比
- 模型消耗分布
- 按天明细
- 扫描诊断

4. 当你需要刷新数据时，点击页面里的 `重新扫描`。

5. 使用顶部工具切换栏，可以查看全电脑数据，也可以单独查看 Codex、OpenClaw、Claude Code、Hermes 等工具的数据。

6. 鼠标悬浮到每日趋势柱上，可以查看当天的用量详情。

7. 在 `模型消耗分布` 中点击展开，可以查看所有检测到的模型消耗。

8. 如果某个工具没有数据，或者和其他统计工具不一致，查看 `扫描诊断`。这里会展示记录数、扫描规则、跳过原因和数据源明细。

## 常见使用场景

### 查看今天用了多少 token

打开面板后查看 `最近一天 token`。如果要看每个工具的明细，滚动到 `按天明细`。

### 修改模型价格

编辑 [pricing.json](pricing.json)，然后重启本地服务：

```bash
npm start
```

价格单位是美元 / 100 万 token。

### 强制重新扫描

可以点击页面里的 `重新扫描`，也可以访问本地 API：

```text
http://127.0.0.1:5188/api/usage?refresh=1
```

### 换一个端口运行

```bash
PORT=5199 npm start
```

然后打开：

```text
http://127.0.0.1:5199
```

### 停止本地服务

在运行 `npm start` 的终端里按 `Ctrl+C`。

## 预估成本

Token Ledger 的成本估算公式：

```text
cost = input_tokens * input_price
     + cache_read_tokens * cache_read_price
     + cache_write_tokens * cache_write_price
     + output_tokens * output_price
```

所有价格保存在 [pricing.json](pricing.json) 中，单位为美元 / 100 万 token。

部分模型价格来自官方价格；部分模型价格标记为估算。你可以根据自己的供应商价格或套餐规则修改价格表。

详细说明见 [docs/pricing.md](docs/pricing.md)。

## 统计口径

Token Ledger 优先采用“最终有效调用明细”口径：

- 只统计有明确 token 元数据的用量记录
- 尽可能拆分输入、缓存读取、缓存写入、输出和 reasoning token
- 对重复快照、重试、会话 checkpoint 副本做去重
- 按本地时区归档每日数据
- 不通过读取源代码或对话内容来推算精确 token 用量

详细说明见 [docs/statistics-policy.md](docs/statistics-policy.md)。

## 本地 API

本地服务提供：

```text
GET /api/usage
GET /api/usage?refresh=1
```

`refresh=1` 会强制重新扫描本地数据。

## 构建

项目目前使用 `pkg` 做实验性独立二进制打包：

```bash
npm run build:mac
npm run build:win
```

开源版本推荐的主要使用方式仍然是：

```bash
npm install
npm start
```

## 项目结构

```text
.
├── app.js
├── index.html
├── pricing.json
├── server.js
├── styles.css
└── docs/
```

## 适合谁使用

- 高频使用 Codex、Claude Code、OpenClaw 等 AI 编程工具的人
- 想知道每天、每周、每月 AI 编程 token 消耗的人
- 想区分输入、输出、缓存 token 成本的人
- 不希望把代码、对话和文件路径上传到第三方平台的人
- 想研究不同 AI 编程工具真实消耗差异的人

## 许可证

MIT
