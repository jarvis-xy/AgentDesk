# Contributing

Contributions are welcome.

## Good First Contributions

- Add support for a new tool that exposes local token metadata.
- Improve source-specific deduplication.
- Add tests with sanitized sample usage records.
- Improve documentation for pricing and statistics policy.
- Improve UI accessibility.

## Scanner Rules

Scanner contributions should follow these rules:

- Do not upload data.
- Do not read source code or conversation text unless there is explicit user opt-in.
- Prefer local usage metadata fields.
- Return clear diagnostics when token metadata is unavailable.
- Keep approximate estimates clearly labeled as estimates.

## Development

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:5188
```

## Pull Request Checklist

- The scanner does not upload local data.
- The scanner does not require secrets.
- The statistics policy is documented if behavior changes.
- New prices are marked as official or estimated.
- UI changes work in both dark and light mode.

