# AgentDesk

[简体中文](README.zh-CN.md)

**AgentDesk** is a **local multi-agent ops desk**. It scans AI agent logs and configs on your own machine and surfaces:

| Area | What you get |
|------|----------------|
| **Usage** | Tokens, estimated cost, tool & model mix |
| **Projects** | History from session `cwd` / git, temp-task filtering, manual labels |
| **Skills** | Install matrix across agents; copy or symlink sync |

Formerly **Token Ledger** (token-usage dashboard only). The product grew into a full local ops desk; the old GitHub path `jarvis-xy/token-ledger` redirects here.

**Repo:** https://github.com/jarvis-xy/AgentDesk  
**Dashboard:** `http://127.0.0.1:5188`  
**Privacy:** no cloud account, no telemetry, no upload of code or conversations.

---

## Screens / navigation

| Tab | Role |
|-----|------|
| **Overview** | Today cost, real projects, skill coverage |
| **Usage** | Daily trend, tool share, model distribution, detail table |
| **Projects** | Project graph + labels (`~/.agentdesk/project-overrides.json`) |
| **Skills** | Multi-agent skill matrix + sync (copy / symlink) |

## Supported usage sources

- Codex  
- Claude Code  
- Grok CLI (when local usage metadata exists)  
- OpenClaw  
- Hermes  

**Limited / experimental:** Gemini CLI, Cursor, Trae — only when the tool exposes local token metadata. Missing metadata is *not* “zero usage”.

## Privacy (local-first)

AgentDesk:

- Does **not** upload source code, prompts, conversations, or file contents  
- Reads local **usage metadata** (model, timestamps, token counters) and **skill/session path metadata**  
- Stores optional project labels only under `~/.agentdesk/`  

Details: [docs/privacy.md](docs/privacy.md) · [docs/statistics-policy.md](docs/statistics-policy.md) · [docs/pricing.md](docs/pricing.md)

---

## Install & start

Requires **Node.js 18+** (macOS, Linux, Windows).

### Option 1 — Ask an AI assistant

Copy this into Claude Code, Codex, Grok CLI, or any agent with terminal access:

```text
Please install and start AgentDesk (https://github.com/jarvis-xy/AgentDesk) on my computer: confirm Node.js 18+ is available, clone the repository into an appropriate folder, run npm install, start the service, and open http://127.0.0.1:5188. It must only read local AI-tool metadata and must not upload code or conversations.
```

### Option 2 — Manual

```bash
git clone https://github.com/jarvis-xy/AgentDesk.git
cd AgentDesk
npm install
npm start
```

If `git clone` cannot reach GitHub (e.g. port 443 blocked), use the zipball fallback:

```bash
mkdir -p ~/Applications && cd ~/Applications
curl -L https://api.github.com/repos/jarvis-xy/AgentDesk/zipball/main -o agentdesk.zip
unzip -q agentdesk.zip && mv jarvis-xy-AgentDesk-* AgentDesk
cd AgentDesk && npm install && npm start
```

Open:

```text
http://127.0.0.1:5188
```

Already installed?

```bash
cd AgentDesk && npm start
```

### Optional: run in background (macOS LaunchAgent)

A sample plist lives at `com.tokenledger.local.plist` (legacy filename). Prefer **not** auto-opening the browser on every wake; set `NO_OPEN=1` or use the project’s documented LaunchAgent pattern so restarts don’t spam windows.

---

## Skill sync (quick tip)

- **Claude / Cursor** skills are often discovered by Grok automatically.  
- **Codex** (and other trees outside Grok’s default scan) → use the **Skills** tab to soft-link into `~/.grok/skills`, or:

```bash
mkdir -p ~/.grok/skills
ln -sfn ~/.codex/skills/<name> ~/.grok/skills/<name>
```

---

## Configuration & data

| Item | Location |
|------|----------|
| Pricing table | `pricing.json` (USD per 1M tokens) |
| Project overrides | `~/.agentdesk/project-overrides.json` |
| Theme (UI) | browser `localStorage` |

Edit `pricing.json` and restart to refresh cost estimates. See [docs/pricing.md](docs/pricing.md).

## Development

```bash
npm install
npm start
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

Product background (Chinese): [docs/PRD-agentdesk.md](docs/PRD-agentdesk.md)

## License

[MIT](LICENSE)

## Rename note

| | |
|--|--|
| **Product name** | AgentDesk |
| **Former name** | Token Ledger |
| **GitHub** | https://github.com/jarvis-xy/AgentDesk |
| **Old URL** | https://github.com/jarvis-xy/token-ledger → redirects to AgentDesk |
