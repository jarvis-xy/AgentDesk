# Pricing Table

AgentDesk estimates cost from `pricing.json`.

Prices are expressed in **USD per 1M tokens**.

## Formula

```text
estimated_cost =
  input_tokens / 1_000_000 * input_price
+ cache_read_tokens / 1_000_000 * cache_read_price
+ cache_write_tokens / 1_000_000 * cache_write_price
+ output_tokens / 1_000_000 * output_price
```

If `cacheWrite` is not configured for a model, AgentDesk falls back to the cache read price.

## Official vs Estimated

Each row in `pricing.json` can include a `source` field:

- `official`: copied from provider pricing at the listed update date  
- `estimated`: manually estimated or inferred from a related model/provider  

Cost values in the UI should be treated as **estimates** unless every model in the dataset has official, current pricing.

## Updating Prices

Edit `pricing.json` and restart the local server:

```bash
npm start
```

Each row supports:

```json
{
  "model": "gpt-5.5",
  "input": 1.25,
  "output": 10.0,
  "cacheRead": 0.125,
  "cacheWrite": 1.25,
  "source": "official",
  "updated": "2026-07-01"
}
```

Field names may vary slightly by version; follow the shape already present in the repo’s `pricing.json`.

## Why cache matters

Cache read/write tokens often use different unit prices than normal input. AgentDesk keeps them separate in usage breakdowns so cost is not understated or overstated.
