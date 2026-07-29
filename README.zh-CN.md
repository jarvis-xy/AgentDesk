# AgentDesk

> 原名 **Token Ledger**。现升级为本地多 Agent 运维台。  
> GitHub 仓库仍为 [jarvis-xy/token-ledger](https://github.com/jarvis-xy/token-ledger)（兼容旧链接）。

[English](README.md) · [产品 PRD](docs/PRD-agentdesk.md)

**AgentDesk** 扫描本机 AI Agent 的日志与配置，统一呈现：

- **用量** Token / 成本 / 工具与模型占比（Claude、Codex、Grok、OpenClaw、Hermes…）
- **项目** 从会话 cwd / git 推断历史项目，过滤临时任务，可手动分类
- **能力** 多 Agent Skill 矩阵，复制 / 软链同步

全部本地运行：`http://127.0.0.1:5188`，不上传代码、对话或遥测。

## 功能

- 本地网页面板
- 用量看板（继承 Token Ledger）
- 项目图谱 + `~/.agentdesk/` 标注
- Skill 安装矩阵与跨 Agent 同步
- 输入 / 缓存 / 输出 token 拆分
- 基于 `pricing.json` 的预估成本
- 深色 / 浅色模式
- 手动重新扫描
- 适合 LaunchAgent（不在每次唤醒时强弹浏览器）

## 支持的数据源（用量）

- Codex
- Claude Code
- Grok CLI（本地有用量元数据时）
- OpenClaw
- Hermes

实验性 / 受限：Gemini CLI、Cursor、Trae — 仅当本地存在 token 元数据时。

## 隐私

- 不上传代码、提示词、对话、项目文件内容
- 只读用量元数据与 skill/会话路径元信息
- 用户项目标注仅写入 `~/.agentdesk/`

详见 [privacy.md](docs/privacy.md)。

## 安装与启动

需要 **Node.js 18+**。

### 方式一：让 AI 安装

```text
请在我的电脑上安装并启动 AgentDesk / Token Ledger（https://github.com/jarvis-xy/token-ledger）：确认 Node.js 18+ 可用，克隆仓库，npm install 并启动，打开 http://127.0.0.1:5188；只读本机 AI 工具元数据，不上传代码或对话。
```

### 方式二：手动

```bash
git clone https://github.com/jarvis-xy/token-ledger.git
cd token-ledger
npm install
npm start
```

无法 `git clone` 时可用源码包：

```bash
mkdir -p ~/Applications && cd ~/Applications
curl -L https://api.github.com/repos/jarvis-xy/token-ledger/zipball/main -o token-ledger.zip
unzip -q token-ledger.zip && mv jarvis-xy-token-ledger-* token-ledger
cd token-ledger && npm install && npm start
```

访问：`http://127.0.0.1:5188`  
已安装则在项目目录执行 `npm start`。

## 主导航

| 页 | 说明 |
|----|------|
| 总览 | 今日成本、正式项目、Skill 覆盖 |
| 用量 | 原 Token Ledger 看板 |
| 项目 | 历史项目图谱 + 标注 |
| 能力 | Skill 安装矩阵与跨 Agent 同步 |

## Skill 同步

Claude / Cursor 的 skill 多数可被 Grok 直接发现。Codex 等可用「能力」页软链到 `~/.grok/skills`，或手动 `ln -s`。

## License

MIT — 见 [LICENSE](LICENSE)。
