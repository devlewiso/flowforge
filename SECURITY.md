# Security

FlowForge turns text into n8n workflows that people will run on their own servers, so it is built to fail safe. Last reviewed 2026-11-20 (red/blue/purple exercise, all findings fixed and re-tested).

## What FlowForge protects

| Risk | Protection |
|---|---|
| Your API key leaking | The key goes from your browser to this server and straight to the provider. It is never stored, logged or returned. "Remember keys" keeps it only in your browser. |
| A generated workflow that hands over your n8n server | Nodes that run shell commands, SSH, read/write server files, call the n8n API, or code that reaches the OS are **blocked by default**. If you allow them, they are flagged in red, and any unauthenticated webhook/form that reaches them is called out. |
| Credentials inside workflows | Any `credentials` the model invents are stripped; you connect your own inside n8n. |
| Server-side request forgery | Custom endpoints are off in production. When on (local use), they may only target `localhost` unless listed in `ALLOWED_ENDPOINT_HOSTS`. Redirects are not followed and error bodies from custom endpoints are never shown. |
| A website you visit driving your local FlowForge | API calls must be JSON from the same origin (`Origin` / `Sec-Fetch-Site`), otherwise 403. |
| Abuse and runaway costs | Per-IP rate limits on generation and model listing. |
| Someone intercepting traffic (man in the middle) | HTTPS everywhere on a hosted instance, with HSTS so browsers never fall back to plain http. Calls to cloud providers use HTTPS with certificate checks. Local models stay on `localhost`; a model on another machine over plain http is unencrypted on that network. |
| Clickjacking / injected scripts | Strict Content-Security-Policy (no external scripts), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`. | `Strict-Transport-Security`.
| Silent attacks | One `[audit]` JSON line per API call: route, status, provider, key source (user/server), custom endpoint host, Origin, reason. Never the key or the prompt. |
| Vulnerable dependencies | `npm audit`: 0 known vulnerabilities (PostCSS pinned to a patched release via `overrides`). |

## Before you publish it
- Put it behind HTTPS and a reverse proxy; set `TRUST_PROXY=true` so rate limits see real client IPs.
- Do **not** set server API keys on a public instance unless you add login, or anyone can spend them.
- Keep `ALLOW_CUSTOM_BASE_URL` off.
- Rate limits live in memory (per process). With several instances, add limits at the edge (e.g. a WAF rule).

## Always review before activating
FlowForge generates a starting point. Open each node in n8n, connect your credentials, and test with sample data before turning a workflow on.

## Reporting
Found a problem? Open a private security advisory on the repository.
