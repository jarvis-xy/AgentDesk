# AgentDesk

> Formerly **Token Ledger**. Now a local multi-agent ops desk.  
> Repository path stays `jarvis-xy/token-ledger` for continuity.

[简体中文](README.zh-CN.md) · [PRD](docs/PRD-agentdesk.md)

**AgentDesk** scans local AI agent logs and configs on your machine and surfaces:

- **Usage** — tokens, estimated cost, tool/model mix (Claude Code, Codex, Grok, OpenClaw, Hermes, …)
- **Projects** — history inferred from session `cwd` / git, with temp-task filtering and manual labels
- **Skills** — multi-agent skill matrix, copy / symlink sync across agents

All local: `http://127.0.0.1:5188`. No cloud account, no telemetry, no upload of code or conversations.

## Features

- Local web dashboard
- Usage dashboard (Token Ledger heritage)
- Project graph + overrides under `~/.agentdesk/`
- Skill install matrix and cross-agent sync
- Input / cache / output token breakdown
- Cost estimate from `pricing.json`
- Dark / light mode
- Manual rescan
- LaunchAgent-friendly (does not force-open a browser on every wake)

## Supported sources (usage)

- Codex
- Claude Code
- Grok CLI (when local usage metadata exists)
- OpenClaw
- Hermes

Experimental / limited: Gemini CLI, Cursor, Trae — only when local token metadata is present.

## Privacy

Local-first:

- Does not upload code, prompts, conversations, or project file contents
- Reads local usage metadata (model, timestamp, token counters) and skill/session path metadata
- Project labels you set are stored only under `~/.agentdesk/`

See [docs/privacy.md](docs/privacy.md).

## Install and start

Requires **Node.js 18+**.

### Option 1: Ask an AI assistant

```text
Please install and start AgentDesk / Token Ledger (https://github.com/jarvis-xy/token-ledger) on my computer: confirm Node.js 18+, clone the repo, npm install, start the service, open http://127.0.0.1:5188. It must only read local AI-tool metadata and must not upload code or conversations.
```

### Option 2: Manual

```bash
git clone https://github.com/jarvis-xy/token-ledger.git
cd token-ledger
npm install
npm start
```

If `git clone` cannot reach GitHub, use the zipball fallback:

```bash
mkdir -p ~/Applications && cd ~/Applications
curl -L https://api.github.com/repos/jarvis-xy/token-ledger/zipball/main -o token-ledger.zip
unzip -q token-ledger.zip && mv jarvis-xy-token-ledger-* token-ledger
cd token-ledger && npm install && npm start
```

Open:

```text
http://127.0.0.1:5188
```

Already installed? From the project folder:

```bash
npm start
```

## Navigation

| Tab | Role |
|-----|------|
| Overview | Today cost, real projects, skill coverage |
| Usage | Token Ledger-style spend board |
| Projects | Project graph + labels |
| Skills | Install matrix + sync (copy / symlink) |

## Skill sync tip

Claude / Cursor skills are often already discovered by Grok. For Codex and other trees, use the Skills tab to soft-link into `~/.grok/skills`, or symlink manually.

## License

MIT — see [LICENSE](LICENSE).
