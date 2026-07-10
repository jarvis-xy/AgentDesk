# Statistics Policy

Token Ledger aims to use a final effective call accounting policy.

## Preferred Record

A usage record should represent one final model call with concrete token metadata:

- `inputTokens`
- `cacheReadTokens`
- `cacheWriteTokens`
- `outputTokens`
- `reasoningTokens`, when available
- `totalTokens`, when provided by the source

When `totalTokens` is not available, Token Ledger computes:

```text
total = input + cache_read + cache_write + output + reasoning
```

## Date Bucketing

Records are grouped by local calendar day. This is intentional because the product is a personal desktop usage ledger.

If another tool uses UTC or server-side time, daily totals can differ even when all-time totals match.

## Deduplication

Supported tools often write repeated snapshots, checkpoints, retries, or reset files. Token Ledger deduplicates with source-specific rules:

- Prefer stable request or message identifiers when available.
- Use model and token composition as a fallback.
- Select the most relevant OpenClaw session version when primary, reset, and checkpoint files overlap.
- Avoid counting repeated Codex token snapshots inside the same session file.

## Cache Tokens

Cache tokens are not a bug. They usually mean the model provider reused context from previous calls.

Token Ledger separates:

- normal input tokens
- cache read tokens
- cache write tokens
- output tokens

This matters because cache read/write tokens usually have different prices from normal input tokens.

## Unsupported Tools

If a tool does not expose local token metadata, Token Ledger should not estimate exact token usage by reading source files or conversations.

Approximate text-token estimation may be added only as an explicit opt-in feature, and it must be labeled as an estimate.

## Why Numbers Can Differ

Different tools may disagree because of:

- UTC vs local timezone grouping
- final calls vs snapshots
- retry counting
- cached input handling
- whether failed calls are included
- whether reasoning tokens are included
- session checkpoint duplication
- provider-side billing adjustments

