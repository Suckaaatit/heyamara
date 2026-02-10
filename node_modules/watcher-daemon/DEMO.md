# Demo Runbook

This demo shows a full rule lifecycle: create rule, trigger file change, observe match, and fetch report.

Notes:
- Rule evaluation requires Ollama to be running. If Ollama is not available, the daemon keeps watching but pauses rule evaluation.
- The default API endpoint is `http://localhost:3000`.
- Headless by design, with an optional local UI at `http://localhost:3000/ui`.

## Quick Demo (Windows PowerShell)

```powershell
cd watcher-daemon
.\scripts\demo.ps1
```

## Quick CLI Status

```powershell
cd watcher-daemon
npm run cli -- status
```

## Quick UI Open (Windows)

```cmd
watcher-ui.cmd
```

## Quick Demo (macOS/Linux)

```bash
cd watcher-daemon
bash scripts/demo.sh
```

## Manual Demo Steps

1. Install dependencies:

```bash
npm install
```

2. Start the daemon:

```bash
npm start
```

3. Add a rule (new terminal).

PowerShell:

```powershell
$body = @{
  name = "TS Change Demo"
  description = "Alert on .ts changes"
  condition = "Alert when TypeScript files change"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/rules -ContentType "application/json" -Body $body
```

macOS/Linux:

```bash
curl -X POST http://localhost:3000/rules -H "Content-Type: application/json" -d "{\"name\":\"TS Change Demo\",\"description\":\"Alert on .ts changes\",\"condition\":\"Alert when TypeScript files change\"}"
```

4. Trigger a file event:

PowerShell:

```powershell
Set-Content -Path watched/demo.ts -Value "// demo change"
```

macOS/Linux:

```bash
echo "// demo change" > watched/demo.ts
```

5. Check report:

PowerShell:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3000/report
```

macOS/Linux:

```bash
curl http://localhost:3000/report
```

You should see a notification and a log entry for the rule match if Ollama is running.
