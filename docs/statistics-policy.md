# Statistics Policy

AgentDesk aims to use a **final effective call** accounting policy for usage.

## Preferred Record

A usage record should represent one final model call with concrete token metadata:

- `inputTokens`  
- `cacheReadTokens`  
- `cacheWriteTokens`  
- `outputTokens`  
- `reasoningTokens`, when available  
- `totalTokens`, when provided by the source  

When `totalTokens` is not available, AgentDesk computes:

```text
total = input + cache_read + cache_write + output + reasoning
```

## Date Bucketing

Records are grouped by **local calendar day**. This is intentional for a personal desktop ledger.

If another tool uses UTC or server-side time, daily totals can differ even when all-time totals match.

## Deduplication

Supported tools often write repeated snapshots, checkpoints, retries, or reset files. AgentDesk deduplicates with source-specific rules:

- Prefer stable request or message identifiers when available.  
- Use model and token composition as a fallback.  
- Select the most relevant OpenClaw session version when primary, reset, and checkpoint files overlap.  
- Avoid counting repeated Codex token snapshots inside the same session file.  

## Codex local vs account UI

Codex usage is scanned from **this machine only**:

| Path | Content |
|------|---------|
| `~/.codex/sessions/**/*.jsonl` | Active rollouts |
| `~/.codex/archived_sessions/**/*.jsonl` and `*.jsonl.zst` | Archived rollouts (zstd) |

Accounting: sum `event_msg` → `token_count` → `info.last_token_usage` (per-turn), deduped within each file by token composition.

**Not equal to Codex App “累计 Token”** when:

1. Sessions were deleted and not archived on disk  
2. History exists only on OpenAI account / another device  
3. Multiple ChatGPT / API accounts were used historically  
4. `session_index.jsonl` lists more thread ids than rollout files still present  

AgentDesk surfaces `diagnostics.codexCoverage` (live/archived file counts, session_index size, gap hint) so you can see coverage limits.  

## Cache Tokens

Cache tokens are not a bug. They usually mean the provider reused context from previous calls.

AgentDesk separates:

- normal input tokens  
- cache read tokens  
- cache write tokens  
- output tokens  

This matters because cache read/write tokens usually have different prices from normal input tokens.

## Unsupported Tools

If a tool does not expose local token metadata, AgentDesk should **not** estimate exact token usage by reading source files or conversations.

Approximate text-token estimation may be added only as an explicit opt-in feature, and it must be labeled as an estimate.

## Projects & skills (non-token metrics)

- **Projects** are inferred from session working directories and related path metadata; they are not a substitute for git analytics.  
- **Skills** reflect install presence / path layout across agents; sync actions are local filesystem operations you approve in the UI.  

## Why Numbers Can Differ

Different tools may disagree because of:

- UTC vs local timezone grouping  
- Different definitions of a “call”  
- Cache accounting differences  
- Incomplete local metadata  
- Dedup rules that drop duplicate snapshots  

When in doubt, treat AgentDesk as a **local operational view**, not a billing invoice from the provider.
