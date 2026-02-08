'use strict';

const { exec } = require('child_process');
const DEFAULT_BASE = 'http://localhost:3000';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
let baseUrl = process.env.API_URL || DEFAULT_BASE;
if (urlIndex !== -1) {
  baseUrl = args[urlIndex + 1] || baseUrl;
  args.splice(urlIndex, 2);
}

const cmd = (args[0] || 'help').toLowerCase();
const rest = args.slice(1);

const pretty = (data) => JSON.stringify(data, null, 2);

async function fetchJson(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const payload = text ? safeParse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.error || response.statusText);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function printHelp() {
  console.log(`Watcher Daemon CLI

Usage:
  node scripts/cli.js status
  node scripts/cli.js config
  node scripts/cli.js rules
  node scripts/cli.js matches
  node scripts/cli.js report
  node scripts/cli.js ui
  node scripts/cli.js compile "When a new .ts file is created in src/, alert me"
  node scripts/cli.js create "Rule Name" "Alert when TypeScript files change" "optional description"

Options:
  --url http://localhost:3000

Examples:
  node scripts/cli.js status
  node scripts/cli.js rules
  node scripts/cli.js ui
  node scripts/cli.js compile "Alert when .ts files are modified"
`);
}

async function runStatus() {
  const [health, config, report, rules, matches] = await Promise.all([
    fetchJson('/health'),
    fetchJson('/config'),
    fetchJson('/report'),
    fetchJson('/rules'),
    fetchJson('/matches'),
  ]);

  console.log(`Health: ${health.status} (${new Date(health.timestamp).toLocaleTimeString()})`);
  console.log(`API: ${baseUrl}`);
  console.log(`WatchDir: ${config.watchDir}`);
  console.log(`Ignored: ${(config.ignored || []).join(', ') || 'none'}`);
  console.log(`Model: ${config.ollamaModel || report.llm?.model || 'unknown'}`);
  console.log(`Rules: ${rules.count ?? 0}`);
  console.log(`Matches: ${matches.count ?? 0}`);
  console.log(`Events: ${report.engine?.eventsObserved ?? 0}`);
}

async function run() {
  try {
    switch (cmd) {
      case 'status':
        await runStatus();
        return;
      case 'config':
        console.log(pretty(await fetchJson('/config')));
        return;
      case 'rules':
        console.log(pretty(await fetchJson('/rules')));
        return;
      case 'matches':
        console.log(pretty(await fetchJson('/matches')));
        return;
      case 'report':
        console.log(pretty(await fetchJson('/report')));
        return;
      case 'ui': {
        const url = `${baseUrl.replace(/\/$/, '')}/ui/`;
        console.log(`Opening UI: ${url}`);
        openUrl(url);
        return;
      }
      case 'compile': {
        const condition = rest.join(' ').trim();
        if (!condition) {
          console.log('Error: condition is required.');
          printHelp();
          return;
        }
        const result = await fetchJson('/rules/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition }),
        });
        console.log(pretty(result));
        return;
      }
      case 'create': {
        const [name, condition, description = ''] = rest;
        if (!name || !condition) {
          console.log('Error: name and condition are required.');
          printHelp();
          return;
        }
        const result = await fetchJson('/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, condition }),
        });
        console.log(pretty(result));
        return;
      }
      case 'help':
      default:
        printHelp();
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.payload) {
      console.error(pretty(error.payload));
    }
    process.exitCode = 1;
  }
}

function openUrl(url) {
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`, { shell: 'cmd.exe' });
    return;
  }
  if (process.platform === 'darwin') {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

run();
