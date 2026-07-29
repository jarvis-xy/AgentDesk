# Contributing

Contributions to **AgentDesk** are welcome.

Repo: https://github.com/jarvis-xy/AgentDesk

## Good first contributions

- Add support for a new tool that exposes local token metadata  
- Improve source-specific deduplication  
- Add tests with sanitized sample usage records  
- Improve documentation for pricing and statistics policy  
- Improve Skills matrix / project inference UX  
- Improve UI accessibility (dark / light)  

## Scanner rules

- Do not upload data  
- Do not read source code or conversation text unless there is explicit user opt-in  
- Prefer local usage metadata fields  
- Return clear diagnostics when token metadata is unavailable  
- Keep approximate estimates clearly labeled as estimates  

## Development

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:5188
```

## Pull request checklist

- [ ] Scanner does not upload local data  
- [ ] Scanner does not require cloud secrets for basic local mode  
- [ ] Statistics policy documented if behavior changes  
- [ ] New prices marked `official` or `estimated`  
- [ ] UI works in both dark and light mode  
- [ ] Docs / README links use `https://github.com/jarvis-xy/AgentDesk`  

## Product docs

- [README.md](README.md) / [README.zh-CN.md](README.zh-CN.md)  
- [docs/privacy.md](docs/privacy.md)  
- [docs/statistics-policy.md](docs/statistics-policy.md)  
- [docs/pricing.md](docs/pricing.md)  
- [docs/PRD-agentdesk.md](docs/PRD-agentdesk.md)  
