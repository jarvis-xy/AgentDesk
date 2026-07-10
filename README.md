# Token Ledger

[简体中文](README.zh-CN.md)

Token Ledger is a local-first dashboard for tracking AI coding token usage on your own computer.

It scans local usage metadata from supported AI coding tools, aggregates token usage by day, tool, and model, and estimates cost from a configurable price table. It is designed for users who want to understand AI coding spend without uploading code, prompts, conversations, or file paths.

## Features

- Local web dashboard at `http://127.0.0.1:5188`
- No cloud account and no telemetry
- Scans local usage metadata only
- Daily token trend
- Tool share
- Model usage distribution
- Daily detail table
- Input, cache, output token breakdown
- Estimated cost from `pricing.json`
- Dark and light mode
- Manual rescan

## Supported Sources

Current scanner support:

- Codex
- Claude Code
- OpenClaw
- Hermes

Experimental or limited support:

- Gemini CLI is detected only when local token metadata exists. If no token metadata is found, it should not be treated as zero usage.
- Cursor, Trae, and similar IDEs can only be counted accurately if they expose local token usage metadata.

## Privacy

Token Ledger is local-first:

- It does not upload code.
- It does not upload prompts or conversations.
- It does not upload file paths.
- It reads local usage metadata fields such as model name, timestamp, input tokens, cache tokens, output tokens, and total tokens.

See [docs/privacy.md](docs/privacy.md) for details.

## Quick Start

Requirements:

- Node.js 18 or later
- macOS, Linux, or Windows

Install dependencies:

```bash
npm install
```

Start the local server:

```bash
npm start
```

Open:

```text
http://127.0.0.1:5188
```

Force a rescan from the UI with the `重新扫描` button.

## Cost Estimation

Token Ledger estimates cost with:

```text
cost = input_tokens * input_price
     + cache_read_tokens * cache_read_price
     + cache_write_tokens * cache_write_price
     + output_tokens * output_price
```

All prices are stored in [pricing.json](pricing.json) and are expressed in USD per 1M tokens.

Some models use official prices when known. Others are marked as estimated. Update the price table to match your provider contract.

See [docs/pricing.md](docs/pricing.md).

## Statistics Policy

The preferred accounting policy is final effective calls:

- Count only usage records with concrete token metadata.
- Split input, cache read, cache write, output, and reasoning tokens where possible.
- Deduplicate repeated snapshots, retries, and session checkpoint copies.
- Bucket days by the local timezone.
- Do not infer exact token usage by reading source code or conversations.

See [docs/statistics-policy.md](docs/statistics-policy.md).

## API

The local server exposes:

```text
GET /api/usage
GET /api/usage?refresh=1
```

`refresh=1` forces a fresh local scan.

## Build

This project currently uses `pkg` for experimental standalone binaries:

```bash
npm run build:mac
npm run build:win
```

The primary open-source workflow is still `npm install && npm start`.

## Project Structure

```text
.
├── app.js
├── index.html
├── pricing.json
├── server.js
├── styles.css
└── docs/
```

## License

MIT
