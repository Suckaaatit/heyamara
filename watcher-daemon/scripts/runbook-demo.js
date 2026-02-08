const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const nodePath = fs.existsSync('C:\\Program Files\\nodejs\\node.exe')
  ? 'C:\\Program Files\\nodejs\\node.exe'
  : 'node';

const configModule = require(path.join(root, 'dist', 'utils', 'config'));
const config = configModule.default || configModule;

const demoRoot = path.join(root, 'demo-run');
const watchDir = path.join(demoRoot, 'watched');
const dbPath = path.join(demoRoot, 'rules.db');
const logFile = path.join(demoRoot, 'daemon.log');

const apiHost = '127.0.0.1';
const apiPort = config.apiPort || 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestJson = (method, apiPath, body) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: apiHost,
        port: apiPort,
        path: apiPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = { raw: data };
          }
          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(parsed?.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.payload = parsed;
            reject(err);
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const waitForHealth = async (timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const health = await requestJson('GET', '/health');
      if (health?.status === 'ok') return health;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error('Timeout waiting for /health');
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeFile = (relativePath, contents) => {
  const fullPath = path.join(watchDir, relativePath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, contents, 'utf8');
  return fullPath;
};

const logStep = (title) => {
  console.log(`\n=== ${title} ===`);
};

const trimJson = (value) => JSON.stringify(value, null, 2);

const checkOllama = () => {
  const ollamaPath = 'C:\\Users\\AKASH\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
  if (!fs.existsSync(ollamaPath)) {
    console.log('Ollama binary not found at', ollamaPath);
    return;
  }
  try {
    const output = execSync(`${ollamaPath} list`, { encoding: 'utf8' });
    console.log('Ollama models:\n' + output.trim());
  } catch (error) {
    console.log('Ollama list failed:', error.message);
  }
};


const main = async () => {
  console.log('Runbook demo starting...');
  checkOllama();

  if (fs.existsSync(demoRoot)) {
    fs.rmSync(demoRoot, { recursive: true, force: true });
  }
  ensureDir(watchDir);
  ensureDir(path.dirname(dbPath));

  logStep('STEP 0: Start daemon');
  const daemonEnv = {
    ...process.env,
    WATCH_DIR: watchDir,
    DB_PATH: dbPath,
    LOG_FILE: logFile,
    OLLAMA_HOST: config.ollamaHost || 'http://localhost:11434',
    OLLAMA_MODEL: config.ollamaModel || 'tinyllama',
    API_PORT: String(apiPort),
  };
  const daemon = spawn(nodePath, ['dist/index.js'], {
    cwd: root,
    env: daemonEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  daemon.on('error', (err) => {
    console.error('Daemon spawn failed:', err.message);
  });
  daemon.on('exit', (code, signal) => {
    console.log('Daemon exited early:', { code, signal });
  });

  daemon.stdout.on('data', (chunk) => {
    process.stdout.write(`[daemon] ${chunk}`);
  });
  daemon.stderr.on('data', (chunk) => {
    process.stderr.write(`[daemon] ${chunk}`);
  });

  const health = await waitForHealth();
  console.log('Daemon healthy:', trimJson(health));

  logStep('STEP 1: UI/health observability');
  const [rules0, matches0, report0] = await Promise.all([
    requestJson('GET', '/rules'),
    requestJson('GET', '/matches'),
    requestJson('GET', '/report'),
  ]);
  console.log('Rules count:', rules0.count);
  console.log('Matches count:', matches0.count);
  console.log('Token usage:', trimJson(report0.llm?.tokenUsage || {}));

  logStep('STEP 2: watcher works before rules');
  writeFile('tmp.txt', 'test');
  await sleep(500);
  const matchesAfterTmp = await requestJson('GET', '/matches');
  console.log('Matches after tmp.txt:', matchesAfterTmp.count);

  logStep('STEP 3: Compile rule (LLM usage starts)');
  const compileCondition = 'When a new .ts file is created in src/, alert me';
  const reportBeforeCompile = await requestJson('GET', '/report');
  const compiled = await requestJson('POST', '/rules/compile', { condition: compileCondition });
  const reportAfterCompile = await requestJson('GET', '/report');
  const compiledRule = compiled?.compiled;
  console.log('Compiled:', trimJson(compiled));
  console.log(
    'Token delta:',
    (reportAfterCompile.llm?.tokenUsage?.total || 0) -
      (reportBeforeCompile.llm?.tokenUsage?.total || 0)
  );

  logStep('STEP 4: Create rule (persistence)');
  const reportBeforeCreate = await requestJson('GET', '/report');
  const created = await requestJson('POST', '/rules', {
    name: 'Simple create rule (happy path)',
    description: 'Alert on new .ts files in src/',
    condition: compileCondition,
    compiled: compiledRule,
  });
  const reportAfterCreate = await requestJson('GET', '/report');
  console.log('Created rule:', trimJson(created));
  console.log(
    'Token delta:',
    (reportAfterCreate.llm?.tokenUsage?.total || 0) -
      (reportBeforeCreate.llm?.tokenUsage?.total || 0)
  );

  logStep('STEP 5: Trigger simple rule');
  writeFile('src/demo.ts', '// demo');
  await sleep(500);
  const matchesAfterDemo = await requestJson('GET', '/matches');
  console.log('Matches after demo.ts:', matchesAfterDemo.count);
  console.log('Latest match:', trimJson(matchesAfterDemo.matches?.[0] || {}));

  logStep('STEP 6: Matches + report');
  const [matches6, report6] = await Promise.all([
    requestJson('GET', '/matches'),
    requestJson('GET', '/report'),
  ]);
  console.log('Matches:', trimJson(matches6));
  console.log('Report:', trimJson(report6));

  logStep('STEP 7: Threshold rule');
  const thresholdCondition = 'If 3 or more files under __tests__/ are changed within 5 minutes, alert me';
  const thresholdRule = await requestJson('POST', '/rules', {
    name: 'Threshold rule (tests/)',
    description: '3+ changes within 5 minutes',
    condition: thresholdCondition,
  });
  console.log('Threshold rule:', trimJson(thresholdRule));

  logStep('STEP 8: Trigger threshold');
  writeFile('__tests__/1.ts', 'a');
  await sleep(500);
  writeFile('__tests__/2.ts', 'b');
  await sleep(500);
  writeFile('__tests__/3.ts', 'c');
  await sleep(500);
  const matches8 = await requestJson('GET', '/matches');
  console.log('Matches after threshold:', matches8.count);
  console.log('Latest match:', trimJson(matches8.matches?.[0] || {}));

  logStep('STEP 9: Restart daemon');
  daemon.kill('SIGINT');
  await sleep(800);
  const daemon2 = spawn(nodePath, ['dist/index.js'], {
    cwd: root,
    env: daemonEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  daemon2.stdout.on('data', (chunk) => {
    process.stdout.write(`[daemon] ${chunk}`);
  });
  daemon2.stderr.on('data', (chunk) => {
    process.stderr.write(`[daemon] ${chunk}`);
  });
  await waitForHealth();
  const rulesAfterRestart = await requestJson('GET', '/rules');
  console.log('Rules after restart:', rulesAfterRestart.count);
  const reportFinal = await requestJson('GET', '/report');
  daemon2.kill('SIGINT');

  logStep('STEP 10: Token usage summary');
  console.log('Final token usage:', trimJson(reportFinal.llm?.tokenUsage || {}));

  if (fs.existsSync(demoRoot)) {
    fs.rmSync(demoRoot, { recursive: true, force: true });
  }
  console.log('Runbook demo complete.');
};

main().catch((error) => {
  console.error('Runbook demo failed:', error.message);
  if (error.payload) {
    console.error('Details:', trimJson(error.payload));
  }
  process.exit(1);
});
