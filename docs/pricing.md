# Pricing Table

Token Ledger estimates cost from `pricing.json`.

Prices are expressed in USD per 1M tokens.

## Formula

```text
estimated_cost =
  input_tokens / 1_000_000 * input_price
+ cache_read_tokens / 1_000_000 * cache_read_price
+ cache_write_tokens / 1_000_000 * cache_write_price
+ output_tokens / 1_000_000 * output_price
```

If `cacheWrite` is not configured for a model, Token Ledger falls back to the cache read price.

## Official vs Estimated

Each row in `pricing.json` can include a `source` field:

- `official`: copied from provider pricing at the listed update date
- `estimated`: manually estimated or inferred from a related model/provider

Cost values in the UI should be treated as estimates unless every model in the dataset has official, current pricing.

## Updating Prices

Edit `pricing.json` and restart the local server:

```bash
npm start
```

Each row supports:

```json
{
  "model": "gpt-5.5",
  "match": "^gpt-5\\.5",
  "input": 5,
  "cache": 0.5,
  "cacheWrite": 0.5,
  "output": 30,
  "source": "official",
  "updatedAt": "2026-06-25"
}
```

`match` is a regular expression matched against the local model name.

