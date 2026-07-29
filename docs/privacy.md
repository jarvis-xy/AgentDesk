# Privacy

AgentDesk (formerly Token Ledger) is a **local-first** multi-agent ops desk.

## What It Reads

The scanner reads **local metadata** exposed by supported tools. Depending on the tool and feature, this can include:

### Usage

- Timestamp  
- Tool name  
- Model name  
- Input / cache read / cache write / output / reasoning token counts  
- Total token count (when provided)  
- Request or message identifiers used only for **local** deduplication  

### Skills & sessions (paths only)

- Skill directory paths and `SKILL.md` presence  
- Session storage paths, cwd, and related path-level metadata for project inference  

AgentDesk does **not** open project source files or conversation bodies for token estimation.

## What It Does Not Upload

AgentDesk does not upload:

- Source code  
- Prompts  
- Assistant replies  
- Conversation content  
- Project file contents  
- Telemetry to a cloud product backend  

The dashboard and API run on `127.0.0.1` by default.

## Local API

Intended for the local browser only:

```text
http://127.0.0.1:5188/api/usage
```

If you expose the port to a network, you are responsible for access control.

## Local user data

Optional labels and overrides are stored only under:

```text
~/.agentdesk/
```

## Accuracy boundaries

AgentDesk only reports what local tools record. If a tool does not store token metadata locally, it should be marked unsupported or unavailable — not guessed from text.
