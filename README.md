# FlowForge · n8n

Describe a process in plain language and download a workflow `.json` ready to import into [n8n](https://n8n.io).

**Try it online:** https://flowforge.neuralcodelab.com (bring your own API key)
**Run it yourself:** this repository. The hosted site can't reach models on your computer, so local models (Ollama, LM Studio…) only work when you run FlowForge on your own machine.

An LLM designs the nodes, connections and positions; FlowForge then cleans up the answer: unique ids, valid node types, credentials removed, automatic layout, connection checks and a warning when the trigger looks wrong.

## Pick your AI: your own key, or fully local

| Provider | How | Get a key |
|---|---|---|
| OpenAI | Paste your API key in the app | https://platform.openai.com/api-keys |
| Anthropic Claude | Paste your API key (default model `claude-opus-5-5`) | https://platform.claude.com/settings/keys |
| Google Gemini | Paste your API key | https://aistudio.google.com/apikey |
| OpenRouter | One key for hundreds of models | https://openrouter.ai/keys |
| Groq | Paste your API key | https://console.groq.com/keys |
| Ollama | Runs on your machine, no key, free | https://ollama.com |
| Custom | Any OpenAI-compatible server (LM Studio, vLLM, llama.cpp…) | — |

Click **Load available models** to fetch the live model list for your key.

### Where does my key go?
The key is sent with each request to the FlowForge server, which forwards it to the provider you chose. The server never stores or logs it. Tick **Remember keys on this device** to keep it in your browser's `localStorage`; untick it to erase saved keys.

**License:** MIT

## Run it

Requires Node.js 20+.

```bash
git clone https://github.com/devlewiso/flowforge.git
cd flowforge
npm install
npm run dev     # http://127.0.0.1:3050
npm test
```

### Run it locally with Ollama (free and private)
The public site can't reach your computer, so local models need your own copy:

```bash
ollama pull qwen2.5-coder:7b   # or qwen3:8b, llama3.1:8b…
```

Small local models (7–8B) are free and private but make more mistakes than Claude, GPT-4o or Gemini Pro. Always review the warnings tab before importing.

## Optional server configuration (`.env.local`)

Nothing is required. Use it to give the server its own keys (anyone who can open the app can then use them) or defaults:

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b

# Any OpenAI-compatible server
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=
LLM_API_KEY=

# Let the browser choose the Ollama/custom endpoint. Default: on in dev, off in production.
# Keep it OFF on a public server: it would let visitors make the server call any URL.
ALLOW_CUSTOM_BASE_URL=false

LLM_TIMEOUT_MS=

# Extra hosts a browser-supplied endpoint may use (default: only localhost)
ALLOWED_ENDPOINT_HOSTS=192.168.1.50,gpu-box.lan

# Per-IP limits per 10 minutes (0 = off) and proxy trust
RATE_LIMIT_GENERATE=20
RATE_LIMIT_MODELS=30
TRUST_PROXY=false   # true only behind your own reverse proxy (uses X-Forwarded-For)

AUDIT_LOG=true      # one JSON line per API call; never the key or the prompt
```

## Legal pages (required before production)
`/privacy`, `/terms`, `/security` and `/licenses` describe exactly what this code does (no accounts, no database, no cookies, what the audit log contains, links to each AI provider's own terms). Set who runs the instance:

```env
NEXT_PUBLIC_OPERATOR_NAME=          # who runs this instance
NEXT_PUBLIC_CONTACT_EMAIL=          # required: shown on every policy
NEXT_PUBLIC_GOVERNING_LAW=          # optional, e.g. "Guatemala"
NEXT_PUBLIC_LOG_RETENTION_DAYS=     # optional: how long your host keeps logs
```

Run `npm run check:prod` before deploying; it fails if the contact email is missing. `npm run licenses` refreshes the third-party license list.

## Hosting it publicly
- Visitors bring their own keys, so you don't pay for their usage. Don't set server keys unless you add authentication and rate limits.
- `ALLOW_CUSTOM_BASE_URL` is off in production. A hosted server can't reach a visitor's local Ollama anyway; local models are for people who run FlowForge themselves.
- `npm run dev` / `npm start` listen on `127.0.0.1` only. Put a reverse proxy in front to publish it.

## Security
- **Dangerous nodes are blocked.** Workflows with shell commands, SSH, server file access, the n8n API or code that reaches the OS are refused unless you tick *Allow dangerous nodes*; even then they are flagged, and an unauthenticated webhook/form leading to them is called out.
- **Cross-site requests are rejected** (JSON only, same Origin), so a website you visit cannot drive your local FlowForge.
- **Custom endpoints** may only point at this machine unless listed in `ALLOWED_ENDPOINT_HOSTS`; redirects are not followed and their error bodies are never shown.
- **Rate limits** per IP, **security headers** (CSP, no framing) and an **audit log** line per API call (`[audit] {...}`) with provider, key source (user/server), endpoint host, Origin and status.

See [SECURITY.md](SECURITY.md) for the full threat model.

## How to use
1. Describe the trigger, the steps and the expected result.
2. Choose a provider and model (advanced: node-name language, retries, preferred trigger).
3. Review the **diagram**, the **JSON** and the **warnings**.
4. Open **Review**: every node was chosen by the model, and the ones that need a credential, write data or point at a sheet, table, channel or URL are flagged. Mark each one *Approve as generated* or *I changed it*, then **Download review log** to keep a record of what the model picked and what a person changed.
5. Click **Download .json** and import it in n8n: *Workflows → Import from File*. Then connect your credentials in each node.

## How it was built
FlowForge is built by [NeuralCodeLab](https://neuralcodelab.com), working with [Claude](https://claude.com/claude-code) (Anthropic) as an AI collaborator:

- **Planning:** Claude helped break the product into milestones and shape the provider and review flows.
- **Code review:** every change was reviewed by Claude before release.
- **Security exercise:** Claude ran the red, blue and purple team agents. The red team only simulated attacks on an isolated lab copy, the blue team checked that abuse leaves a trace, and the purple team turned each finding into a fix and re-tested it. The results are summarized in [SECURITY.md](SECURITY.md) and on the `/security` page.

Every decision and every release is approved by a person.
