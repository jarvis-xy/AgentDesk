# AgentDesk 产品需求文档（PRD）

| 字段 | 内容 |
|------|------|
| 产品名 | **AgentDesk**（中文定位：**本地多 Agent 运维台**） |
| 原名 | Token Ledger |
| GitHub | https://github.com/jarvis-xy/AgentDesk |
| 文档版本 | v0.2 |
| 日期 | 2026-07-29 |
| 状态 | 已定名 · 仓库已更名为 AgentDesk · v1.3 含用量 / 项目 / 能力 |
| 原则 | 本地优先 · 文件即真相 · 先观测后自动化 |

---

## 1. 一句话定位

**AgentDesk** 是跑在本机的多 Agent 运维台：扫描各 AI Agent 的本地日志与配置，统一呈现 **用量、能力（Skill）、项目与运行历史**，并在此基础上给出可落地的工作流 / 自动化方案建议——**不上传对话与代码**。

---

## 2. 命名升级

### 2.1 为什么要改名

| 原名 Token Ledger | 问题 |
|-------------------|------|
| 强调 token 记账 | 产品已扩展到 Skill 管理、将扩展到项目图谱与工作流 |
| Ledger = 账本 | 无法覆盖「运维台 / 能力治理 / 项目复盘」心智 |
| 对外传播易被当成纯成本工具 | 与目标用户（多 Agent 重度使用者）不完全匹配 |

### 2.2 命名原则

1. **本地、多 Agent、运维/工作台** 三者至少命中两项  
2. 中英都好念、好搜，避免与现有大厂产品强冲突  
3. 可从 Token Ledger **平滑迁移**（副标题可保留「原 Token Ledger」一段时间）  
4. 不暗示「云端 Agent 平台」或「又一个聊天客户端」

### 2.3 候选名

| 候选 | 中文可感 | 优点 | 风险 |
|------|----------|------|------|
| **AgentDesk** ⭐推荐 | 多 Agent 工作台 / 运维台 | 直观；Desk=台；可扩展 | 略通用，需副标题定调 |
| **AgentBay** | Agent 港湾 | 有「本机停靠」感 | 易联想到云厂商 Bay |
| **LocalFleet** | 本机机队 | 强调多 Agent 编队 | 偏运维黑话 |
| **PolyOps** | 多端运维 | 短、技术感 | 难懂、缺 Agent 字样 |
| **AgentLedger** | Agent 总账 | 承接 Token Ledger | 仍偏「账」，限制叙事 |
| **OpenDeck** | 开放驾驶台 | Deck=控制台 | 与 OpenClaw 等「Open*」易混 |
| **Homebase** | 本机大本营 | 温暖、本地感强 | 行业含义杂 |

### 2.4 推荐定名

**主名：AgentDesk**  
**副标题：本地多 Agent 运维台**  
**一句话：See what your agents did. Govern what they can do.**

迁移话术示例：

> Token Ledger 现更名为 **AgentDesk**——从 token 统计升级为本地多 Agent 运维台。

确认命名后，需批量替换：窗口标题、README、LaunchAgent label（可保留 `com.tokenledger.local` 兼容或迁移为 `com.agentdesk.local`）、pkg 产物名等（见 §10）。

---

## 3. 问题与用户

### 3.1 要解决的问题

1. 本机安装了多种 Agent，**用量、配置、Skill 散落各目录**，没有统一视图  
2. Token 在烧，但说不清 **贵在哪个项目 / 哪次会话**  
3. Skill 越装越多，**真身 / 软链 / 冲突 / 僵尸能力** 不清晰  
4. 历史跑过什么项目、哪些是临时任务，**无法复盘**  
5. 有能力资产，却缺少 **可复用的工作流方案**（先建议，后执行）

### 3.2 目标用户

| 画像 | 描述 |
|------|------|
| P0 | 本机同时使用 2+ 种 AI 编程 / Agent 工具的个人开发者 |
| P1 | 用 OpenClaw / Hermes 等做自动化与多技能编排的用户 |
| P2 | 需要向自己或团队解释「AI 花在哪」的独立开发者 / 小团队（仍本地部署） |

### 3.3 非目标（明确不做）

- 云端账号体系与多租户 SaaS（除非未来独立商业版）  
- 替代 Cursor / Claude / Codex 成为 IDE 或主聊天窗口  
- 完整 skills 市场（不与 skills.sh 竞争）  
- 一上来就做无人值守的复杂自动化运行时（Phase 3 仅「方案建议」）

---

## 4. 产品原则

1. **本地文件是唯一真相源**；网络仅用于用户主动的打开文档/更新检查（可选）。  
2. **推断可错，必须可改**（项目类型、临时标记、能力标签）。  
3. **先观测 → 再治理 → 最后自动化建议**。  
4. **Connector 插件化**：每个 Agent 一个适配器，字段归一。  
5. **隐私默认**：不上传对话、提示词、代码；路径可脱敏展示与导出。  
6. **工作流默认是 Playbook（可读方案）**，不是后台偷偷执行。

---

## 5. 信息架构（IA）

```text
AgentDesk
├── 总览 Overview          今日成本 / 活跃 Agent / 项目数 / Skill 健康
├── 用量 Usage             Token 趋势 · 工具 · 模型 · 诊断（现有增强）
├── 项目 Projects          历史项目图谱 · 分类 · 临时过滤          ← Phase 1 新
├── 能力 Skills            安装矩阵 · 来源 · 冲突 · 能力分类
├── Agent 实例 Agents      发现安装 · 配置路径 · 运行状态
└── 方案 Playbooks         基于能力/项目的工作流建议               ← Phase 3
```

**导航原则：** 五个一级入口足够；避免「设置」淹没主路径。  
**默认首页：** 总览（不是纯 Token 大盘）。

---

## 6. 核心数据实体

| 实体 | 含义 | 主要来源（示例） |
|------|------|------------------|
| **AgentInstance** | 本机一种 Agent 安装 | 目录存在性、version 文件、config |
| **UsageEvent** | 一次用量记录 | 各工具 jsonl / sqlite / unified log |
| **SkillPackage** | 一个 skill 安装位置 | `**/skills/**/SKILL.md`、commands、lockfile |
| **SessionRun** | 一次会话或一轮可识别运行 | session 目录、jsonl 会话头 |
| **ProjectEntity** | 推断的项目（可编辑） | cwd 聚合、git root、用户 pin |
| **CapabilityTag** | 能力标签 | skill 描述聚类 + 用户标注 |
| **Playbook** | 工作流方案卡片 | 规则/模板生成，非强制执行 |

### 6.1 统一用量字段（已有，保持）

`tool, model, date, input, cache, output, tokens, cost, sessionId…`

### 6.2 项目推断字段（Phase 1）

| 字段 | 说明 |
|------|------|
| `projectKey` | 优先 git root；否则归一化 cwd |
| `displayName` | 目录名或用户自定义 |
| `kind` | `ai_coding` / `content` / `ops` / `media` / `research` / `other` / `temp` / `unknown` |
| `confidence` | 0–1 推断置信度 |
| `firstSeen` / `lastSeen` | 活跃区间 |
| `totalTokens` / `sessionCount` | 汇总 |
| `agentsUsed` | 用过哪些 Agent |
| `userPinned` | 用户钉选，覆盖自动分类 |

### 6.3 临时任务过滤（默认规则，可配置）

标记为 `temp` 的启发式（满足任一条且未 pin）：

- 路径落在 `/tmp`、`*/Cache/*`、`Downloads` 下无 git 的一次性目录  
- `cwd === $HOME` 且会话轮次极少  
- 会话时长 / 消息数低于阈值  
- 路径匹配用户自定义 ignore 列表  

用户可：**升为正式项目 / 标为临时 / 合并到某项目**。

---

## 7. 功能范围与阶段

### Phase 0 — 品牌与骨架（当前文档驱动）

- [ ] 确认产品名（默认推进 **AgentDesk**）  
- [ ] 文案与 UI 主标题切换；保留短迁移说明  
- [ ] IA：总览 + 用量 + 能力（现有两 Tab 升维）  
- [ ] LaunchAgent / 无弹窗守护策略保持  

### Phase 1 — 运维台 MVP（优先开发）

**目标：** 10 秒看懂本机 Agent 生态；能回答「最近正经做过哪些项目」。

| 模块 | 需求要点 | 优先级 |
|------|----------|--------|
| 总览 | 今日 token/成本、有数据的 Agent 数、Skill 数、项目数、健康告警条数 | P0 |
| 用量 | 现有能力 + Grok；增加按项目筛选入口 | P0 |
| **项目图谱** | 从 Session 的 cwd/git 聚合；临时过滤；pin/改名/分类 | P0 |
| 能力 | 矩阵 + 真身/软链/只读/冲突；OpenClaw/Hermes 已纳入 | P0 |
| Agent 实例 | 列表：是否检测到、主路径、skill 根、最近活跃 | P1 |

**Phase 1 验收：**

1. 至少 Claude / Codex / Grok / OpenClaw / Hermes 的用量或会话 cwd 可进入项目聚合（能接多少接多少，缺数据诚实标注）。  
2. 用户能过滤「仅正式项目」，并手动纠正分类。  
3. Skill 矩阵可见安装差异，支持复制/软链同步（已有）。  
4. 全程本地，无强制联网。

### Phase 2 — 分类与能力地图

- 项目类型完善（AI 编程 vs 内容 vs 飞书运营 vs 视频等）  
- Skill → CapabilityTag 自动打标 + 手动改  
- 僵尸 skill（长期无关联会话）提示  
- 读 `~/.agents/.skill-lock.json`：来源、安装时间、可更新提示  
- 用量按项目 / 按能力维度交叉  

**验收：** 「我有什么能力、哪些项目在用」可回答。

### Phase 3 — Playbook（方案层，默认不执行）

- 基于能力包与项目类型生成 **Playbook 卡片**（步骤、推荐 Agent、所需 skill、风险）  
- 导出为 Markdown / 可复制 prompt  
- （可选后续）对接 OpenClaw / cron 的「一键安装方案」——**单独评估，不进 Phase 3 必做**

**验收：** 用户认为方案「可执行、可改」，而非空话。

---

## 8. Connector（适配器）规范

每个 Agent 实现统一接口（逻辑概念）：

```text
detect()        -> 是否安装、版本、主目录
listSessions()  -> SessionRun[]
listUsage()     -> UsageEvent[]
listSkills()    -> SkillPackage[]
listConfig()    -> 关键配置路径（只读摘要）
```

| Agent | 用量 | 会话/cwd | Skills |
|-------|------|----------|--------|
| Claude Code | ✅ | Phase 1 | ✅ |
| Codex | ✅ | Phase 1 | ✅ |
| Grok | ✅ | Phase 1 | ✅ |
| OpenClaw | ✅ | Phase 1 | ✅ |
| Hermes | ✅ | Phase 1 | ✅ |
| Gemini CLI | 实验 | 有则接 | 可选 |
| Cursor | 实验 | 有则接 | ✅ 部分 |

**产品承诺：** 「未发现本地元数据」≠「用量为 0」。诊断面板必须写清规则。

---

## 9. 页面级需求摘要

### 9.1 总览 Overview

- 指标卡：今日成本、今日 token、7 日成本、活跃项目数、Skill 冲突/坏链数  
- 快捷入口：未对齐 Skill、待确认临时会话、超预算（若已设预算）  
- 最近活跃项目 Top 5  

### 9.2 用量 Usage

- 继承现有趋势 / 占比 / 模型 / 按天明细 / 诊断  
- 增加：Scope = 全机 | Agent | **项目**  
- 后续：预算阈值（本机通知即可）  

### 9.3 项目 Projects

- 列表：名称、类型、置信度、token、会话数、涉及 Agent、最近活跃  
- 筛选：正式 / 临时 / 未知；类型；Agent  
- 详情：会话列表、用量拆分、关联 Skill（Phase 2）  
- 操作：pin、改名、合并、标临时/正式、改类型  

### 9.4 能力 Skills

- 现有矩阵与同步  
- 增加：来源（agents lock / 软链目标 / bundled）、能力分类标签  
- 健康：断链、同名不同指纹  

### 9.5 Agent 实例

- 卡片：名称、状态、路径、用量占比、skill 数、最近会话时间  

### 9.6 Playbooks（Phase 3）

- 卡片流：标题、适用场景、依赖 skill、推荐步骤、导出  

---

## 10. 工程与迁移清单（命名确认后）

| 项 | 动作 |
|----|------|
| `package.json` name | `token-ledger` → `agentdesk`（或保留包名仅改展示名） |
| UI 标题 / README | 全面更换 + 迁移说明 |
| LaunchAgent | 新 label `com.agentdesk.local` 或保留旧 label 兼容 |
| 端口 | 默认仍 `5188`（减少用户成本）；可选配置 |
| 数据缓存 | 可增加 `~/.agentdesk/` 存放用户标注的项目分类（**不把对话写入**） |
| 版本 | 1.1.x 用量+Skill → 1.2.0 对齐品牌；1.3.0 项目图谱 |

**用户标注存储建议：**  
`~/.agentdesk/project-overrides.json`（projectKey → kind/name/pinned）  
保证换机器可备份，且与扫描缓存分离。

---

## 11. 成功指标（本地产品、偏定性）

| 指标 | 说明 |
|------|------|
| 首次 5 分钟 | 用户能指出 1 个正式项目 + 今日最贵 Agent |
| 周留存信号 | 是否反复点「重新扫描 / 项目 / Skill 同步」 |
| 纠错率 | 用户修改项目分类的比例（过高说明规则差，过低可能没人用） |
| 信任 | 无意外外连；路径脱敏可选 |

---

## 12. 风险与对策

| 风险 | 对策 |
|------|------|
| 项目识别不准 | 置信度 + 默认可纠正；文案写「推断」 |
| Agent 日志格式变更 | Connector 隔离；诊断显示解析失败原因 |
| Skill 过多导致矩阵不可用 | 搜索、筛选「未对齐 / 仅冲突」、能力分类折叠 |
| 范围膨胀到自动化平台 | Playbook 阶段只出方案；执行另立项 |
| 改名导致老用户找不到 | 副标题与 README 明确「原 Token Ledger」 |

---

## 13. 开放问题（需你拍板）

1. ~~主名~~ **已敲定 AgentDesk**  
2. **用户标注数据目录：** `~/.agentdesk/` 是否可接受？  
3. **LaunchAgent label** 是否迁移（会动开机自启配置）？  
4. **Phase 1 项目源优先级：** 先做哪 3 个 Agent 的 cwd 聚合？（建议：Claude、Codex、Grok）  
5. **默认语言：** 界面是否继续中文优先？  

---

## 14. 下一步

| 顺序 | 事项 | 产出 |
|------|------|------|
| 1 | 确认命名 | 本文档 §2 定稿 |
| 2 | 品牌替换 PR | UI/README/package 展示名 |
| 3 | Phase 1 技术设计 | Project 聚合算法 + overrides 文件格式 |
| 4 | 实现项目图谱原型 | `/api/projects` + 项目页 |

---

## 附录 A · 与现有能力的映射

| 现有 | 归入 |
|------|------|
| Token 扫描与看板 | Usage |
| Skill 矩阵与同步 | Skills |
| Grok / OpenClaw / Hermes 接入 | Connectors |
| LaunchAgent 守护、禁止死循环弹窗 | Agents / 运行时 |
| pricing.json | Usage 成本估算 |

## 附录 B · 推荐对外一句话（中英）

- 中文：*AgentDesk——在你自己的电脑上，看清多 Agent 的用量、能力与项目。*  
- English: *AgentDesk — a local ops desk for every AI agent on your machine.*
