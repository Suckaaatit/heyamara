"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIServer = void 0;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const Logger_1 = __importDefault(require("../logger/Logger"));
const RuleCompiler_1 = require("../rules/RuleCompiler");
const RuleValidator_1 = require("../rules/RuleValidator");
const config_1 = __importDefault(require("../utils/config"));
class APIServer {
    port;
    ruleEngine;
    llmClient;
    compiler;
    app;
    server;
    ignoredPatterns = ['dotfiles', 'node_modules', '.git', 'dist', '.next'];
    constructor(port, ruleEngine, llmClient) {
        this.port = port;
        this.ruleEngine = ruleEngine;
        this.llmClient = llmClient;
        this.compiler = new RuleCompiler_1.RuleCompiler(llmClient);
        this.app = (0, express_1.default)();
        this.app.use(express_1.default.json({ limit: '100kb' }));
        this.setupRoutes();
    }
    setupRoutes() {
        this.app.use('/ui', express_1.default.static(path_1.default.join(__dirname, '..', 'ui')));
        this.app.get('/', (_req, res) => {
            res.redirect('/ui');
        });
        this.app.get('/health', (_req, res) => {
            res.json({ status: 'ok', timestamp: Date.now() });
        });
        this.app.get('/config', (_req, res) => {
            res.json({
                watchDir: config_1.default.watchDir,
                dbPath: config_1.default.dbPath,
                logFile: config_1.default.logFile,
                ollamaHost: config_1.default.ollamaHost,
                ollamaModel: config_1.default.ollamaModel,
                apiPort: config_1.default.apiPort,
                notificationsEnabled: config_1.default.notificationsEnabled,
                watchDebounceMs: config_1.default.watchDebounceMs,
                matchHistoryLimit: config_1.default.matchHistoryLimit,
                ignored: this.ignoredPatterns,
            });
        });
        this.app.get('/rules', async (_req, res) => {
            try {
                const rules = await this.ruleEngine.getAllRules();
                res.json({ rules, count: rules.length });
            }
            catch (error) {
                Logger_1.default.error('API: Failed to get rules', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.post('/rules/compile', async (req, res) => {
            try {
                const { condition } = req.body;
                const errors = {};
                if (typeof condition !== 'string') {
                    errors.condition = 'Condition must be a string';
                }
                else if (condition.trim().length < 10) {
                    errors.condition = 'Condition must be at least 10 characters';
                }
                else if (condition.length > 1000) {
                    errors.condition = 'Condition must be 1000 characters or less';
                }
                if (Object.keys(errors).length > 0) {
                    res.status(400).json({
                        error: 'Validation failed',
                        details: errors,
                    });
                    return;
                }
                const llmAvailable = await this.llmClient.checkHealth();
                if (!llmAvailable) {
                    res.status(503).json({
                        error: 'LLM unavailable',
                        details: 'Start Ollama and ensure the model is available before compiling rules.',
                    });
                    return;
                }
                const compiled = await this.compiler.compile(condition.trim());
                if (compiled.reject) {
                    res.status(400).json({
                        error: 'Rule rejected',
                        details: compiled.reject,
                    });
                    return;
                }
                if (!compiled.rule) {
                    res.status(400).json({
                        error: 'Rule compilation failed',
                        details: 'No valid rule returned by compiler',
                    });
                    return;
                }
                const validation = (0, RuleValidator_1.validateCompiledRuleWithIntent)(compiled.rule, condition.trim());
                if (!validation.valid) {
                    res.status(400).json({
                        error: 'Rule validation failed',
                        details: validation.errors,
                        compiled: compiled.rule,
                    });
                    return;
                }
                res.json({
                    compiled: compiled.rule,
                    validation,
                });
            }
            catch (error) {
                Logger_1.default.error('API: Failed to compile rule', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.get('/rules/:id', async (req, res) => {
            try {
                const rule = await this.ruleEngine.getRule(req.params.id);
                if (!rule) {
                    res.status(404).json({ error: 'Rule not found' });
                    return;
                }
                res.json(rule);
            }
            catch (error) {
                Logger_1.default.error('API: Failed to get rule', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.post('/rules', async (req, res) => {
            try {
                const { name, description, condition, compiled } = req.body;
                const errors = {};
                if (typeof name !== 'string') {
                    errors.name = 'Name must be a string';
                }
                else if (name.trim().length === 0) {
                    errors.name = 'Name cannot be empty';
                }
                else if (name.length > 100) {
                    errors.name = 'Name must be 100 characters or less';
                }
                if (typeof condition !== 'string') {
                    errors.condition = 'Condition must be a string';
                }
                else if (condition.trim().length < 10) {
                    errors.condition = 'Condition must be at least 10 characters';
                }
                else if (condition.length > 1000) {
                    errors.condition = 'Condition must be 1000 characters or less';
                }
                if (description !== undefined && typeof description !== 'string') {
                    errors.description = 'Description must be a string';
                }
                else if (description && description.length > 500) {
                    errors.description = 'Description must be 500 characters or less';
                }
                if (compiled !== undefined && (typeof compiled !== 'object' || compiled === null)) {
                    errors.compiled = 'Compiled rule must be an object';
                }
                if (Object.keys(errors).length > 0) {
                    res.status(400).json({
                        error: 'Validation failed',
                        details: errors,
                    });
                    return;
                }
                let compiledRule = compiled;
                if (!compiledRule) {
                    const llmAvailable = await this.llmClient.checkHealth();
                    if (!llmAvailable) {
                        res.status(503).json({
                            error: 'LLM unavailable',
                            details: 'Start Ollama and ensure the model is available before adding rules.',
                        });
                        return;
                    }
                    const compiledResult = await this.compiler.compile(condition.trim());
                    if (compiledResult.reject) {
                        res.status(400).json({
                            error: 'Rule rejected',
                            details: compiledResult.reject,
                        });
                        return;
                    }
                    if (!compiledResult.rule) {
                        res.status(400).json({
                            error: 'Rule compilation failed',
                            details: 'No valid rule returned by compiler',
                        });
                        return;
                    }
                    compiledRule = compiledResult.rule;
                }
                const validation = (0, RuleValidator_1.validateCompiledRuleWithIntent)(compiledRule, condition.trim());
                if (!validation.valid) {
                    res.status(400).json({
                        error: 'Rule validation failed',
                        details: validation.errors,
                        compiled: compiledRule,
                    });
                    return;
                }
                const duplicate = this.ruleEngine.findDuplicateRule(condition.trim(), compiledRule);
                if (duplicate) {
                    res.status(409).json({
                        error: 'Rule already exists',
                        existingRule: duplicate,
                    });
                    return;
                }
                const rule = await this.ruleEngine.addRule({
                    name: name.trim(),
                    description: description ? description.trim() : '',
                    condition: condition.trim(),
                    compiled: compiledRule,
                    source: 'llm',
                });
                Logger_1.default.info('API: Rule added', { id: rule.id, name: rule.name, type: rule.type });
                res.status(201).json(rule);
            }
            catch (error) {
                Logger_1.default.error('API: Failed to add rule', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.patch('/rules/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                const success = await this.ruleEngine.updateRule(id, updates);
                if (!success) {
                    res.status(404).json({ error: 'Rule not found or no changes made' });
                    return;
                }
                const updated = await this.ruleEngine.getRule(id);
                res.json(updated);
            }
            catch (error) {
                Logger_1.default.error('API: Failed to update rule', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.delete('/rules/:id', async (req, res) => {
            try {
                const success = await this.ruleEngine.deleteRule(req.params.id);
                if (!success) {
                    res.status(404).json({ error: 'Rule not found' });
                    return;
                }
                res.status(204).send();
            }
            catch (error) {
                Logger_1.default.error('API: Failed to delete rule', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.get('/matches', (_req, res) => {
            try {
                const matches = this.ruleEngine
                    .getRecentMatches()
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                res.json({ matches, count: matches.length });
            }
            catch (error) {
                Logger_1.default.error('API: Failed to get matches', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        this.app.get('/report', async (_req, res) => {
            try {
                const rules = await this.ruleEngine.getAllRules();
                const tokenUsage = this.llmClient.getTokenUsage();
                const stats = this.ruleEngine.getStats();
                const report = {
                    timestamp: Date.now(),
                    uptime: Math.floor(process.uptime()),
                    llm: {
                        model: this.llmClient.getModel(),
                        tokenUsage: {
                            total: tokenUsage.totalTokens,
                            prompt: tokenUsage.promptTokens,
                            completion: tokenUsage.completionTokens,
                            requests: tokenUsage.requestCount,
                            successRate: tokenUsage.requestCount > 0
                                ? (tokenUsage.successCount / tokenUsage.requestCount).toFixed(2)
                                : '0.00',
                            averageLatency: Math.round(tokenUsage.averageLatency),
                        },
                        note: 'Token usage resets on daemon restart.',
                    },
                    rules: {
                        total: rules.length,
                        enabled: rules.filter((r) => r.enabled).length,
                        totalMatches: rules.reduce((sum, r) => sum + r.matchCount, 0),
                        topMatches: rules
                            .sort((a, b) => b.matchCount - a.matchCount)
                            .slice(0, 5)
                            .map((r) => ({ name: r.name, matches: r.matchCount })),
                    },
                    engine: {
                        eventsObserved: stats.eventsObserved,
                        rulesEvaluated: stats.rulesEvaluated,
                        matches: stats.matches,
                    },
                };
                res.json(report);
            }
            catch (error) {
                Logger_1.default.error('API: Failed to generate report', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    start() {
        this.server = this.app.listen(this.port, '127.0.0.1', () => {
            Logger_1.default.info('API server started', { port: this.port });
            console.log(`\n📡 API Server: http://localhost:${this.port}`);
        });
    }
    stop() {
        if (this.server) {
            this.server.close(() => {
                Logger_1.default.info('API server stopped');
            });
        }
    }
}
exports.APIServer = APIServer;
//# sourceMappingURL=APIServer.js.map
