import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import Logger from '../logger/Logger';
import { Rule } from './types';
import { CompiledRule } from '../llm/types';

interface RuleStoreData {
  version: number;
  rules: Rule[];
}

type RuleUpdates = Partial<Pick<Rule, 'name' | 'description' | 'enabled'>>;

export class RuleStore {
  private dbPath: string;
  private data: RuleStoreData;
  private saveQueue: Promise<void> = Promise.resolve();
  private SCHEMA_VERSION = 2;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.data = { version: this.SCHEMA_VERSION, rules: [] };
  }

  async init(): Promise<void> {
    if (fs.existsSync(this.dbPath)) {
      try {
        const content = await fs.promises.readFile(this.dbPath, 'utf-8');
        const parsed = JSON.parse(content) as RuleStoreData;
        this.data = {
          version: this.SCHEMA_VERSION,
          rules: Array.isArray(parsed.rules) ? parsed.rules.filter(this.isRuleSafe) : [],
        };
        Logger.info('Rule store loaded', { path: this.dbPath, rules: this.data.rules.length });
      } catch (error) {
        Logger.warn('Failed to load store, starting fresh', { error });
        try {
          const corruptBackupPath = `${this.dbPath}.corrupt-${Date.now()}`;
          await fs.promises.copyFile(this.dbPath, corruptBackupPath);
          Logger.warn('Backed up unreadable store file', { backup: corruptBackupPath });
        } catch (backupError) {
          Logger.warn('Failed to back up unreadable store file', {
            path: this.dbPath,
            error: backupError instanceof Error ? backupError.message : 'Unknown',
          });
        }
        this.data = { version: this.SCHEMA_VERSION, rules: [] };
      }
    } else {
      Logger.info('Rule store initialized (new)', { path: this.dbPath });
    }
    await this.save();
  }

  private isRuleSafe(rule: any): rule is Rule {
    if (!rule || typeof rule !== 'object') return false;
    if (typeof rule.id !== 'string' || typeof rule.name !== 'string') return false;
    if (rule.type !== 'pattern' && rule.type !== 'threshold') return false;
    if (!rule.match || typeof rule.match !== 'object') return false;
    if (rule.type === 'threshold') {
      if (typeof rule.windowSeconds !== 'number' || typeof rule.count !== 'number') return false;
    }
    return true;
  }

  private async save(): Promise<void> {
    const previousSave = this.saveQueue.catch(() => undefined);
    this.saveQueue = previousSave.then(async () => {
      const serialized = JSON.stringify(this.data, null, 2);
      const tempPath = `${this.dbPath}.tmp-${process.pid}-${Date.now()}`;
      try {
        await fs.promises.writeFile(tempPath, serialized, 'utf-8');
        try {
          await fs.promises.rename(tempPath, this.dbPath);
        } catch (renameError) {
          const code =
            renameError && typeof renameError === 'object' && 'code' in renameError
              ? (renameError as { code?: string }).code
              : null;
          if (process.platform === 'win32' && (code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY')) {
            await fs.promises.copyFile(tempPath, this.dbPath);
            await fs.promises.unlink(tempPath);
          } else {
            throw renameError;
          }
        }
      } catch (error) {
        try {
          await fs.promises.unlink(tempPath);
        } catch (_cleanupError) {
          // Ignore cleanup errors
        }
        throw error;
      }
    });
    await this.saveQueue;
  }

  async addRule(params: {
    name: string;
    description: string;
    condition: string;
    compiled: CompiledRule;
    source: 'llm' | 'manual';
  }): Promise<Rule> {
    const id = this.generateId();
    const now = Date.now();
    const rule: Rule = {
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
    } as Rule;

    this.data.rules.push(rule);
    await this.save();
    Logger.info('Rule added', { id, name: rule.name, type: rule.type });
    return rule;
  }

  findDuplicateRule(condition: string, compiled: CompiledRule): Rule | null {
    const normalizedCondition = condition.trim().toLowerCase();
    const compiledSignature = this.ruleSignatureFromCompiled(compiled);

    return (
      this.data.rules.find((rule) => {
        const existingCondition = rule.originalCondition ? rule.originalCondition.trim().toLowerCase() : '';
        if (existingCondition && existingCondition === normalizedCondition) {
          return true;
        }
        const existingSignature = this.ruleSignatureFromRule(rule);
        return existingSignature === compiledSignature;
      }) || null
    );
  }

  private normalizeArray(values?: string[]): string[] | undefined {
    if (!values) return undefined;
    const normalized = values
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    if (normalized.length === 0) return undefined;
    return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));
  }

  private ruleSignatureFromCompiled(compiled: CompiledRule): string {
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

  private ruleSignatureFromRule(rule: Rule): string {
    const compiled: CompiledRule = {
      type: rule.type,
      match: rule.match,
      windowSeconds: rule.type === 'threshold' ? rule.windowSeconds : undefined,
      count: rule.type === 'threshold' ? rule.count : undefined,
    };
    return this.ruleSignatureFromCompiled(compiled);
  }

  async getRule(id: string): Promise<Rule | null> {
    const rule = this.data.rules.find((r) => r.id === id);
    return rule ? { ...rule } : null;
  }

  async getAllRules(): Promise<Rule[]> {
    return this.data.rules.map((r) => ({ ...r }));
  }

  async getEnabledRules(): Promise<Rule[]> {
    return this.data.rules.filter((r) => r.enabled).map((r) => ({ ...r }));
  }

  async updateRule(id: string, updates: RuleUpdates): Promise<boolean> {
    const rule = this.data.rules.find((r) => r.id === id);
    if (!rule) {
      return false;
    }
    const allowed: Array<keyof RuleUpdates> = ['name', 'description', 'enabled'];
    let changed = false;
    for (const key of allowed) {
      if (key in updates) {
        rule[key] = updates[key] as never;
        changed = true;
      }
    }
    if (changed) {
      await this.save();
      Logger.info('Rule updated', { id, fields: Object.keys(updates) });
    }
    return changed;
  }

  async deleteRule(id: string): Promise<boolean> {
    const index = this.data.rules.findIndex((r) => r.id === id);
    if (index === -1) {
      return false;
    }
    this.data.rules.splice(index, 1);
    await this.save();
    Logger.info('Rule deleted', { id });
    return true;
  }

  async recordMatch(ruleId: string): Promise<void> {
    const rule = this.data.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.lastMatched = Date.now();
      rule.matchCount++;
      await this.save();
    }
  }

  private generateId(): string {
    return `rule_${crypto.randomUUID()}`;
  }

  close(): void {
    Logger.info('Rule store closed');
  }
}
