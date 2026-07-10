# Privacy

Token Ledger is designed as a local-first usage dashboard.

## What It Reads

The scanner reads local usage metadata exposed by supported tools. Depending on the tool, this can include:

- Timestamp
- Tool name
- Model name
- Input token count
- Cache read token count
- Cache write token count
- Output token count
- Reasoning token count
- Total token count
- Request or message identifiers used only for local deduplication

## What It Does Not Upload

Token Ledger does not upload:

- Source code
- Prompts
- Assistant replies
- Conversation content
- Project file paths
- Repository names
- Local directory structures

The dashboard and API run on `127.0.0.1` by default.

## Local API

The local API is intended for the local browser only:

```text
http://127.0.0.1:5188/api/usage
```

If you expose the port to a network, you are responsible for access control.

## Accuracy Boundaries

Token Ledger only reports what local tools record. If a tool does not store token metadata locally, Token Ledger should mark it as unsupported or unavailable instead of guessing from text.

