# AgentDesk

[English](README.md)

**AgentDesk** 是跑在本机的 **多 Agent 运维台**：扫描各 AI Agent 的本地日志与配置，统一呈现：

| 模块 | 你能看到什么 |
|------|----------------|
| **用量** | Token、预估成本、工具与模型占比 |
| **项目** | 从会话 cwd / git 推断历史项目，过滤临时任务，可手动标注 |
| **能力** | 多 Agent Skill 矩阵；复制 / 软链同步 |

原名 **Token Ledger**（仅 Token 统计）。产品已升级为完整运维台；旧仓库路径 `jarvis-xy/token-ledger` 会重定向到本仓库。

**仓库：** https://github.com/jarvis-xy/AgentDesk  
**面板：** `http://127.0.0.1:5188`  
**隐私：** 无云账号、无遥测，不上传代码或对话。

---

## 界面导航

| 页 | 说明 |
|----|------|
| **总览** | 今日成本、正式项目、Skill 覆盖 |
| **用量** | 日趋势、工具占比、模型分布、明细表 |
| **项目** | 项目图谱 + 标注（`~/.agentdesk/project-overrides.json`） |
| **能力** | Skill 安装矩阵与跨 Agent 同步 |

## 支持的用量数据源

- Codex  
- Claude Code  
- Grok CLI（本地有用量元数据时）  
- OpenClaw  
- Hermes  

**实验性 / 受限：** Gemini CLI、Cursor、Trae — 仅当工具暴露本地 token 元数据时。没有元数据 ≠ 用量为 0。

## 隐私（本地优先）

AgentDesk：

- **不**上传源码、提示词、对话、文件内容  
- 只读本机 **用量元数据**（模型、时间戳、token 计数）与 **skill/会话路径元信息**  
- 项目标注仅写入 `~/.agentdesk/`  

详见：[docs/privacy.md](docs/privacy.md) · [docs/statistics-policy.md](docs/statistics-policy.md) · [docs/pricing.md](docs/pricing.md)

---

## 安装与启动

需要 **Node.js 18+**（macOS / Linux / Windows）。

### 方式一：让 AI 安装

把下面整段复制给 Claude Code、Codex、Grok CLI 等有终端权限的助手：

```text
请在我的电脑上安装并启动 AgentDesk（https://github.com/jarvis-xy/AgentDesk）：确认 Node.js 18+ 可用，将仓库克隆到合适目录，执行 npm install 并启动服务，最后打开 http://127.0.0.1:5188。它只读本机 AI 工具元数据，不上传代码或对话。
```

### 方式二：手动安装

```bash
git clone https://github.com/jarvis-xy/AgentDesk.git
cd AgentDesk
npm install
npm start
```

若 `git clone` 连不上 GitHub，可用源码包：

```bash
mkdir -p ~/Applications && cd ~/Applications
curl -L https://api.github.com/repos/jarvis-xy/AgentDesk/zipball/main -o agentdesk.zip
unzip -q agentdesk.zip && mv jarvis-xy-AgentDesk-* AgentDesk
cd AgentDesk && npm install && npm start
```

浏览器访问：

```text
http://127.0.0.1:5188
```

已安装：

```bash
cd AgentDesk && npm start
```

### 可选：后台常驻（macOS LaunchAgent）

仓库内示例 `com.tokenledger.local.plist` 为历史文件名。建议 **不要** 在每次唤醒时自动弹浏览器，避免窗口刷屏。

---

## Skill 同步（速记）

- **Claude / Cursor** 的 skill，多数可被 Grok 直接发现。  
- **Codex** 等不在默认扫描路径时，用 **能力** 页软链到 `~/.grok/skills`，或：

```bash
mkdir -p ~/.grok/skills
ln -sfn ~/.codex/skills/<name> ~/.grok/skills/<name>
```

---

## 配置与数据

| 项 | 位置 |
|----|------|
| 价格表 | `pricing.json`（USD / 百万 token） |
| 项目标注 | `~/.agentdesk/project-overrides.json` |
| 主题 | 浏览器 `localStorage` |

改 `pricing.json` 后重启服务。说明见 [docs/pricing.md](docs/pricing.md)。

## 开发

```bash
npm install
npm start
```

贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)  
产品背景：[docs/PRD-agentdesk.md](docs/PRD-agentdesk.md)

## License

[MIT](LICENSE)

## 更名说明

| | |
|--|--|
| **产品名** | AgentDesk |
| **曾用名** | Token Ledger |
| **GitHub** | https://github.com/jarvis-xy/AgentDesk |
| **旧地址** | https://github.com/jarvis-xy/token-ledger → 重定向到 AgentDesk |
