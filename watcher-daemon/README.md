# Watcher Daemon (TypeScript)

TypeScript source lives in `src/` and compiles into `dist/`.

## Quick Start

```bash
# from repository root
npm install
npm start
```

Or run from the daemon folder:

```bash
cd watcher-daemon
npm install
npm start
```

If your npm version has workspace issues, run:

```bash
cd watcher-daemon
npm install --workspaces=false
npm start
```

## No UI (How Output Looks)

This daemon is **headless by design**, but a lightweight local UI is included for convenience.
Open: `http://localhost:3000/ui`

If you prefer no UI, just use the API directly.
This UI is a local inspector; the daemon runs independently.

## Simple CLI

Quick status:

```bash
cd watcher-daemon
npm run cli -- status
```

Windows shortcut from repo root:

```cmd
watcher.cmd status
```

Open UI (Windows):

```cmd
watcher-ui.cmd
```

List rules:

```bash
npm run cli -- rules
```

Compile (no save):

```bash
npm run cli -- compile "When a new .ts file is created in src/, alert me"
```
Output is delivered via:
- **Local API** (`http://localhost:3000`) for `/rules`, `/matches`, `/report`
- **Logs** (`logs/daemon.log`)
- **OS notifications** (if enabled)

You do **not** open Ollama manually. Just make sure Ollama is running and the model is pulled. The daemon calls Ollama over HTTP.

### Ollama (Windows)

The executable is typically:
`C:\Users\AKASH\AppData\Local\Programs\Ollama\ollama.exe`

Example:

```powershell
& "C:\Users\AKASH\AppData\Local\Programs\Ollama\ollama.exe" list
& "C:\Users\AKASH\AppData\Local\Programs\Ollama\ollama.exe" pull tinyllama
```

## What Files Are Tracked

The daemon watches **only** the directory in `.env`:
- `WATCH_DIR=./watched` (default, relative to `watcher-daemon/`)

It **ignores**:
- dotfiles
- `node_modules`
- `.git`
- `dist`, `.next`

To change the watch root, update `WATCH_DIR` in `.env` and restart.

## What “Commands” It Gives

It does **not** generate shell commands. It emits **matches** with reasons:
- Check `/matches` for recent matches
- Check `/report` for engine stats
- Check logs for match details

## Build / Check

```bash
npm run build
npm test
```

`build` compiles TypeScript from `src/` into `dist/`.

## Demo

Run the scripted demo:

```powershell
cd watcher-daemon
.\scripts\demo.ps1
```

Or on macOS/Linux:

```bash
cd watcher-daemon
bash scripts/demo.sh
```

See `DEMO.md` for manual steps and expected output.

## Keep The Daemon Running (Windows)

Install a scheduled task that starts the daemon on login and restarts it if it exits:

```cmd
cd watcher-daemon
scripts\install-daemon-task.cmd
```

If Task Scheduler is blocked, use Startup folder (no admin):

```cmd
cd watcher-daemon
scripts\install-startup.cmd
```

To remove it:

```cmd
cd watcher-daemon
scripts\uninstall-daemon-task.cmd
```

Or remove Startup entry:

```cmd
cd watcher-daemon
scripts\uninstall-startup.cmd
```

## Architecture (Deterministic Core)

- Watcher: emits normalized events (created/modified/deleted) with debounce.
- Rule Compiler (LLM once): converts natural language into structured rules.
- Rule Engine: deterministic evaluation (no LLM) including time-windowed thresholds.
- Rule Store: JSON persistence, restart-safe.
- Notifications: console + OS notifications.

## Tech Stack

- **Language**: TypeScript (compiled to Node.js)
- **Runtime**: Node.js
- **API**: Express
- **File watching**: Chokidar
- **LLM**: Ollama (local, HTTP)
- **HTTP client**: Axios
- **Notifications**: node-notifier
- **Logging**: Winston
- **Persistence**: JSON file store (`data/rules.db`)
- **UI**: Vanilla HTML/CSS/JS (local inspector)

## API (Localhost Only)

- `GET /health`
- `GET /config`
- `GET /ui` (local UI)
- `GET /rules`
- `GET /rules/:id`
- `POST /rules`
- `POST /rules/compile` (compile-only, does not store)
- `DELETE /rules/:id`
- `GET /matches`
- `GET /report`

## PowerShell Examples

Compile a rule (no save):

```powershell
$body = @{ condition = "When a new .ts file is created in src/, alert me" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/rules/compile -ContentType "application/json" -Body $body
```

Create & store a rule:

```powershell
$body = @{
  name = "TS Change Demo"
  description = "Alert on .ts changes"
  condition = "Alert when TypeScript files change"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/rules -ContentType "application/json" -Body $body
```

Trigger a file event:

```powershell
Set-Content -Path watched/demo.ts -Value "// demo change"
```

## LLM Availability Behavior

- File watching and deterministic rule evaluation always stay active.
- LLM is only used to compile new rules from natural language.
- If Ollama is unavailable, rule creation is disabled but existing rules keep working.

## Config

Use `.env` (see `.env.example`) for settings such as:
- `WATCH_DIR`
- `DB_PATH`
- `LOG_FILE`
- `OLLAMA_HOST`
- `OLLAMA_MODEL`
- `API_ENABLED`
- `API_PORT`
- `NOTIFICATIONS_ENABLED`
- `WATCH_DEBOUNCE_MS`
- `MATCH_HISTORY_LIMIT`

If `.env` is missing, the daemon defaults to `tinyllama` to avoid high-RAM models.

## Failure Modes (Expected)

- Very large directories can increase memory pressure.
- Very high event rates can cause evaluation lag.
- Extremely broad rules are rejected intentionally.
- Threshold counters reset on restart (in-memory windows).

## Known Limitations

- Very high file churn may delay evaluations.
- Match history is in-memory only.
- Extremely broad rules are rejected intentionally.
