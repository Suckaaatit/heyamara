"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleStore = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const Logger_1 = __importDefault(require("../logger/Logger"));
class RuleStore {
    dbPath;
    data;
    saveQueue = Promise.resolve();
    SCHEMA_VERSION = 2;
    constructor(dbPath) {
        this.dbPath = dbPath;
        const dbDir = path_1.default.dirname(dbPath);
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
        this.data = { version: this.SCHEMA_VERSION, rules: [] };
    }
    async init() {
        if (fs_1.default.existsSync(this.dbPath)) {
            try {
                const content = await fs_1.default.promises.readFile(this.dbPath, 'utf-8');
                const parsed = JSON.parse(content);
                this.data = {
                    version: this.SCHEMA_VERSION,
                    rules: Array.isArray(parsed.rules) ? parsed.rules.filter(this.isRuleSafe) : [],
                };
                Logger_1.default.info('Rule store loaded', { path: this.dbPath, rules: this.data.rules.length });
            }
            catch (error) {
                Logger_1.default.warn('Failed to load store, starting fresh', { error });
                try {
                    const corruptBackupPath = `${this.dbPath}.corrupt-${Date.now()}`;
                    await fs_1.default.promises.copyFile(this.dbPath, corruptBackupPath);
                    Logger_1.default.warn('Backed up unreadable store file', { backup: corruptBackupPath });
                }
                catch (backupError) {
                    Logger_1.default.warn('Failed to back up unreadable store file', {
                        path: this.dbPath,
                        error: backupError instanceof Error ? backupError.message : 'Unknown',
                    });
                }
                this.data = { version: this.SCHEMA_VERSION, rules: [] };
            }
        }
        else {
            Logger_1.default.info('Rule store initialized (new)', { path: this.dbPath });
        }
        await this.save();
    }
    isRuleSafe(rule) {
        if (!rule || typeof rule !== 'object')
            return false;
        if (typeof rule.id !== 'string' || typeof rule.name !== 'string')
            return false;
        if (rule.type !== 'pattern' && rule.type !== 'threshold')
            return false;
        if (!rule.match || typeof rule.match !== 'object')
            return false;
        if (rule.type === 'threshold') {
            if (typeof rule.windowSeconds !== 'number' || typeof rule.count !== 'number')
                return false;
        }
        return true;
    }
    async save() {
        const previousSave = this.saveQueue.catch(() => undefined);
        this.saveQueue = previousSave.then(async () => {
            const serialized = JSON.stringify(this.data, null, 2);
            const tempPath = `${this.dbPath}.tmp-${process.pid}-${Date.now()}`;
            try {
                await fs_1.default.promises.writeFile(tempPath, serialized, 'utf-8');
                try {
                    await fs_1.default.promises.rename(tempPath, this.dbPath);
                }
                catch (renameError) {
                    const code = renameError && typeof renameError === 'object' && 'code' in renameError
                        ? renameError.code
                        : null;
                    if (process.platform === 'win32' && (code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY')) {
                        await fs_1.default.promises.copyFile(tempPath, this.dbPath);
                        await fs_1.default.promises.unlink(tempPath);
                    }
                    else {
                        throw renameError;
                    }
                }
            }
            catch (error) {
                try {
                    await fs_1.default.promises.unlink(tempPath);
                }
                catch (_cleanupError) {
                    // Ignore cleanup errors
                }
                throw error;
            }
        });
        await this.saveQueue;
    }
    async addRule(params) {
        const id = this.generateId();
        const now = Date.now();
        const rule = {
            id,
            name: params.name,
            description: params.description,
            enabled: true,
            createdAt: now,
            matchCount: 0,
            type: params.compiled.type,
            match: params.compiled.match,
            action: 'notify',
            source: params.source,
            originalCondition: params.condition,
            ...(params.compiled.type === 'threshold'
                ? {
                    windowSeconds: params.compiled.windowSeconds || 0,
                    count: params.compiled.count || 0,
                }
                : {}),
        };
        this.data.rules.push(rule);
        await this.save();
        Logger_1.default.info('Rule added', { id, name: rule.name, type: rule.type });
        return rule;
    }
    findDuplicateRule(condition, compiled) {
        const normalizedCondition = condition.trim().toLowerCase();
        const compiledSignature = this.ruleSignatureFromCompiled(compiled);
        return (this.data.rules.find((rule) => {
            const existingCondition = rule.originalCondition ? rule.originalCondition.trim().toLowerCase() : '';
            if (existingCondition && existingCondition === normalizedCondition) {
                return true;
            }
            const existingSignature = this.ruleSignatureFromRule(rule);
            return existingSignature === compiledSignature;
        }) || null);
    }
    normalizeArray(values) {
        if (!values)
            return undefined;
        const normalized = values
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value.length > 0);
        if (normalized.length === 0)
            return undefined;
        return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
    }
    ruleSignatureFromCompiled(compiled) {
        const normalized = {
            type: compiled.type,
            match: {
                pathIncludes: this.normalizeArray(compiled.match.pathIncludes),
                pathExcludes: this.normalizeArray(compiled.match.pathExcludes),
                extensions: this.normalizeArray(compiled.match.extensions),
                eventTypes: this.normalizeArray(compiled.match.eventTypes),
            },
            windowSeconds: compiled.windowSeconds ?? null,
            count: compiled.count ?? null,
        };
        return JSON.stringify(normalized);
    }
    ruleSignatureFromRule(rule) {
        const compiled = {
            type: rule.type,
            match: rule.match,
            windowSeconds: rule.type === 'threshold' ? rule.windowSeconds : undefined,
            count: rule.type === 'threshold' ? rule.count : undefined,
        };
        return this.ruleSignatureFromCompiled(compiled);
    }
    async getRule(id) {
        const rule = this.data.rules.find((r) => r.id === id);
        return rule ? { ...rule } : null;
    }
    async getAllRules() {
        return this.data.rules.map((r) => ({ ...r }));
    }
    async getEnabledRules() {
        return this.data.rules.filter((r) => r.enabled).map((r) => ({ ...r }));
    }
    async updateRule(id, updates) {
        const rule = this.data.rules.find((r) => r.id === id);
        if (!rule) {
            return false;
        }
        const allowed = ['name', 'description', 'enabled'];
        let changed = false;
        for (const key of allowed) {
            if (key in updates) {
                rule[key] = updates[key];
                changed = true;
            }
        }
        if (changed) {
            await this.save();
            Logger_1.default.info('Rule updated', { id, fields: Object.keys(updates) });
        }
        return changed;
    }
    async deleteRule(id) {
        const index = this.data.rules.findIndex((r) => r.id === id);
        if (index === -1) {
            return false;
        }
        this.data.rules.splice(index, 1);
        await this.save();
        Logger_1.default.info('Rule deleted', { id });
        return true;
    }
    async recordMatch(ruleId) {
        const rule = this.data.rules.find((r) => r.id === ruleId);
        if (rule) {
            rule.lastMatched = Date.now();
            rule.matchCount++;
            await this.save();
        }
    }
    generateId() {
        return `rule_${crypto_1.default.randomUUID()}`;
    }
    close() {
        Logger_1.default.info('Rule store closed');
    }
}
exports.RuleStore = RuleStore;
//# sourceMappingURL=RuleStore.js.map
