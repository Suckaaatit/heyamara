const $ = (selector) => document.querySelector(selector);

const healthDot = $('#healthDot');
const healthText = $('#healthText');
const refreshBtn = $('#refreshBtn');

const configOut = $('#configOut');
const reportOut = $('#reportOut');
const reportMini = $('#reportMini');
const rulesOut = $('#rulesOut');
const matchesOut = $('#matchesOut');
const compileInput = $('#compileInput');
const compileBtn = $('#compileBtn');
const compileOut = $('#compileOut');
const ruleName = $('#ruleName');
const ruleDesc = $('#ruleDesc');
const ruleCondition = $('#ruleCondition');
const createBtn = $('#createBtn');
const createOut = $('#createOut');
const rulesCount = $('#rulesCount');
const matchesCount = $('#matchesCount');
const eventsCount = $('#eventsCount');
const metricModel = $('#metricModel');
const metricTotalTokens = $('#metricTotalTokens');
const metricPromptTokens = $('#metricPromptTokens');
const metricCompletionTokens = $('#metricCompletionTokens');
const metricRequests = $('#metricRequests');
const metricSuccessRate = $('#metricSuccessRate');
const metricLatency = $('#metricLatency');
const metricUptime = $('#metricUptime');
const cfgWatchRoot = $('#cfgWatchRoot');
const cfgModel = $('#cfgModel');
const cfgDebounce = $('#cfgDebounce');
const cfgIgnored = $('#cfgIgnored');
const cfgPort = $('#cfgPort');
const rulesTotalMetric = $('#rulesTotalMetric');
const rulesEnabledMetric = $('#rulesEnabledMetric');
const rulesMatchesMetric = $('#rulesMatchesMetric');
const rulesTopMetric = $('#rulesTopMetric');
const matchesTotalMetric = $('#matchesTotalMetric');
const matchesLatestTime = $('#matchesLatestTime');
const matchesLatestRule = $('#matchesLatestRule');
const matchesLatestPath = $('#matchesLatestPath');
const latestMatchSummary = $('#latestMatchSummary');
const latestMatchMeta = $('#latestMatchMeta');
const reportModel = $('#reportModel');
const reportTotalTokens = $('#reportTotalTokens');
const reportRequests = $('#reportRequests');
const reportSuccessRate = $('#reportSuccessRate');
const reportLatency = $('#reportLatency');

const pretty = (data) => JSON.stringify(data, null, 2);
let lastCompiled = null;

const shortPath = (value, segments = 2) => {
  if (!value || typeof value !== 'string') return '—';
  const parts = value.split(/[/\\]+/).filter(Boolean);
  return parts.slice(-segments).join('/');
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? safeParse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.error || response.statusText);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const setHealth = (ok, message) => {
  healthDot.classList.remove('ok', 'bad');
  healthDot.classList.add(ok ? 'ok' : 'bad');
  healthText.textContent = message;
};

const setCode = (el, data) => {
  el.textContent = typeof data === 'string' ? data : pretty(data);
};

const setMetric = (el, value) => {
  if (!el) return;
  el.textContent = value ?? '—';
};

const renderReportMini = (report) => {
  if (!report) {
    reportMini.textContent = 'Unavailable';
    return;
  }
  const summary = {
    model: report.llm?.model,
    tokenUsage: report.llm?.tokenUsage,
    uptime: `${report.uptime}s`,
  };
  reportMini.textContent = pretty(summary);
};

const updateLlmMetrics = (report) => {
  if (!report) {
    setMetric(metricModel, '—');
    setMetric(metricTotalTokens, '—');
    setMetric(metricPromptTokens, '—');
    setMetric(metricCompletionTokens, '—');
    setMetric(metricRequests, '—');
    setMetric(metricSuccessRate, '—');
    setMetric(metricLatency, '—');
    setMetric(metricUptime, '—');
    return;
  }
  const usage = report.llm?.tokenUsage || {};
  setMetric(metricModel, report.llm?.model || '—');
  setMetric(metricTotalTokens, usage.total ?? '—');
  setMetric(metricPromptTokens, usage.prompt ?? '—');
  setMetric(metricCompletionTokens, usage.completion ?? '—');
  setMetric(metricRequests, usage.requests ?? '—');
  setMetric(metricSuccessRate, usage.successRate ?? '—');
  setMetric(metricLatency, usage.averageLatency != null ? `${usage.averageLatency} ms` : '—');
  setMetric(metricUptime, report.uptime != null ? `${report.uptime}s` : '—');
};

const updateConfigMetrics = (config) => {
  if (!config) {
    setMetric(cfgWatchRoot, '—');
    setMetric(cfgModel, '—');
    setMetric(cfgDebounce, '—');
    setMetric(cfgIgnored, '—');
    setMetric(cfgPort, '—');
    return;
  }
  setMetric(cfgWatchRoot, shortPath(config.watchDir, 2));
  setMetric(cfgModel, config.ollamaModel || '—');
  setMetric(cfgDebounce, config.watchDebounceMs != null ? `${config.watchDebounceMs} ms` : '—');
  setMetric(cfgIgnored, Array.isArray(config.ignored) ? config.ignored.length : '—');
  setMetric(cfgPort, config.apiPort ?? '—');
};

const updateRulesMetrics = (rules) => {
  if (!rules || !Array.isArray(rules.rules)) {
    setMetric(rulesTotalMetric, '—');
    setMetric(rulesEnabledMetric, '—');
    setMetric(rulesMatchesMetric, '—');
    setMetric(rulesTopMetric, '—');
    return;
  }
  const total = rules.count ?? rules.rules.length;
  const enabled = rules.rules.filter((r) => r.enabled).length;
  const totalMatches = rules.rules.reduce((sum, r) => sum + (r.matchCount || 0), 0);
  const topRule = [...rules.rules].sort((a, b) => (b.matchCount || 0) - (a.matchCount || 0))[0];
  setMetric(rulesTotalMetric, total);
  setMetric(rulesEnabledMetric, enabled);
  setMetric(rulesMatchesMetric, totalMatches);
  setMetric(rulesTopMetric, topRule ? `${topRule.name} (${topRule.matchCount || 0})` : '—');
};

const updateMatchesMetrics = (matches) => {
  if (!matches || !Array.isArray(matches.matches)) {
    setMetric(matchesTotalMetric, '—');
    setMetric(matchesLatestTime, '—');
    setMetric(matchesLatestRule, '—');
    setMetric(matchesLatestPath, '—');
    setMetric(latestMatchSummary, '—');
    setMetric(latestMatchMeta, '—');
    return;
  }
  const total = matches.count ?? matches.matches.length;
  const latest = [...matches.matches].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  setMetric(matchesTotalMetric, total);
  setMetric(matchesLatestTime, latest?.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : '—');
  setMetric(matchesLatestRule, latest?.ruleName || '—');
  setMetric(matchesLatestPath, latest?.path || '—');
  if (latest) {
    const summary = latest.summary || latest.reason || 'Match recorded';
    setMetric(latestMatchSummary, summary);
    const metaParts = [
      latest.ruleName ? `Rule: ${latest.ruleName}` : null,
      latest.path ? `Path: ${latest.path}` : null,
      latest.eventType ? `Event: ${latest.eventType}` : null,
    ].filter(Boolean);
    setMetric(
      latestMatchMeta,
      metaParts.length > 0
        ? metaParts.join(' · ')
        : latest.timestamp
        ? new Date(latest.timestamp).toLocaleString()
        : '—'
    );
  } else {
    setMetric(latestMatchSummary, '—');
    setMetric(latestMatchMeta, '—');
  }
};

const updateReportMetrics = (report) => {
  if (!report) {
    setMetric(reportModel, '—');
    setMetric(reportTotalTokens, '—');
    setMetric(reportRequests, '—');
    setMetric(reportSuccessRate, '—');
    setMetric(reportLatency, '—');
    return;
  }
  const usage = report.llm?.tokenUsage || {};
  setMetric(reportModel, report.llm?.model || '—');
  setMetric(reportTotalTokens, usage.total ?? '—');
  setMetric(reportRequests, usage.requests ?? '—');
  setMetric(reportSuccessRate, usage.successRate ?? '—');
  setMetric(reportLatency, usage.averageLatency != null ? `${usage.averageLatency} ms` : '—');
};

const refreshAll = async () => {
  try {
    const [health, config, rules, matches, report] = await Promise.all([
      fetchJson('/health'),
      fetchJson('/config'),
      fetchJson('/rules'),
      fetchJson('/matches'),
      fetchJson('/report'),
    ]);

    setHealth(true, `Healthy · ${new Date(health.timestamp).toLocaleTimeString()}`);
    setCode(configOut, config);
    setCode(rulesOut, rules);
    setCode(matchesOut, matches);
    setCode(reportOut, report);
    renderReportMini(report);
    updateLlmMetrics(report);
    updateConfigMetrics(config);
    updateRulesMetrics(rules);
    updateMatchesMetrics(matches);
    updateReportMetrics(report);
    rulesCount.textContent = rules.count ?? '0';
    matchesCount.textContent = matches.count ?? '0';
    eventsCount.textContent = report?.engine?.eventsObserved ?? '0';
  } catch (error) {
    setHealth(false, 'API unavailable');
    setCode(configOut, error.payload || { error: error.message });
    updateConfigMetrics(null);
    updateRulesMetrics(null);
    updateMatchesMetrics(null);
    updateReportMetrics(null);
  }
};

const compileRule = async () => {
  const condition = compileInput.value.trim();
  if (!condition) {
    setCode(compileOut, { error: 'Enter a condition to compile.' });
    return;
  }
  compileOut.textContent = 'Compiling…';
  try {
    const result = await fetchJson('/rules/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ condition }),
    });
    setCode(compileOut, result);
    if (result?.compiled) {
      lastCompiled = { condition, compiled: result.compiled };
    } else {
      lastCompiled = null;
    }
    await refreshAll();
  } catch (error) {
    setCode(compileOut, error.payload || { error: error.message });
    lastCompiled = null;
  }
};

const createRule = async () => {
const payload = {
    name: ruleName.value.trim(),
    description: ruleDesc.value.trim(),
    condition: ruleCondition.value.trim(),
  };
  if (!payload.name || !payload.condition) {
    setCode(createOut, { error: 'Name and condition are required.' });
    return;
  }
  if (lastCompiled && lastCompiled.condition === payload.condition) {
    payload.compiled = lastCompiled.compiled;
  }
  createOut.textContent = 'Creating…';
  try {
    const result = await fetchJson('/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setCode(createOut, result);
    await refreshAll();
  } catch (error) {
    setCode(createOut, error.payload || { error: error.message });
  }
};

refreshBtn.addEventListener('click', refreshAll);
compileBtn.addEventListener('click', compileRule);
createBtn.addEventListener('click', createRule);

refreshAll();
setInterval(refreshAll, 10000);
