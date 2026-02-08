import path from 'path';
import Logger from '../logger/Logger';
import { Rule, RuleMatch } from './types';
import { CompiledRule } from '../llm/types';
import { FileEvent } from '../watcher/types';
import { RuleStore } from './RuleStore';
import { SecurityValidator } from '../utils/security';

interface EngineStats {
  eventsObserved: number;
  rulesEvaluated: number;
  matches: number;
}

export class RuleEngine {
  private ruleStore: RuleStore;
  private securityValidator: SecurityValidator;
  private stats: EngineStats = { eventsObserved: 0, rulesEvaluated: 0, matches: 0 };
  private recentMatches: RuleMatch[] = [];
  private recentMatchLimit: number;
  private thresholdWindows = new Map<string, number[]>();
  private watchDir: string;

  constructor(ruleStore: RuleStore, watchDir: string, recentMatchLimit = 100, securityValidator?: SecurityValidator) {
    this.ruleStore = ruleStore;
    this.watchDir = watchDir;
    this.recentMatchLimit = recentMatchLimit;
    this.securityValidator = securityValidator || new SecurityValidator();
  }

  async init(): Promise<void> {
    await this.ruleStore.init();
  }

  async evaluateEvent(event: FileEvent): Promise<RuleMatch[]> {
    this.stats.eventsObserved++;
    Logger.info('Event observed', { type: event.type, path: event.path, timestamp: event.timestamp });

    const absolutePath = path.resolve(this.watchDir, event.path);
    const isValid = await this.securityValidator.validateFilePath(absolutePath);
    if (!isValid) {
      Logger.warn('Security: Skipping evaluation for invalid path', { path: event.path });
      return [];
    }

    const rules = await this.ruleStore.getEnabledRules();
    this.stats.rulesEvaluated += rules.length;

    const matches: RuleMatch[] = [];
    for (const rule of rules) {
      const match = this.evaluateRule(event, rule);
      if (match) {
        matches.push(match);
        this.stats.matches++;
        await this.ruleStore.recordMatch(rule.id);
        this.recordMatch(match);
        Logger.info('Rule matched', { ruleId: rule.id, ruleName: rule.name, type: rule.type });
      }
    }
    return matches;
  }

  private evaluateRule(event: FileEvent, rule: Rule): RuleMatch | null {
    if (!this.matchesFilter(event, rule.match)) {
      Logger.debug('Rule filter did not match', { ruleId: rule.id, ruleName: rule.name, path: event.path });
      return null;
    }

    if (rule.type === 'pattern') {
      const reason = `File ${event.path} was ${event.type}`;
      const summary = reason;
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.type,
        timestamp: Date.now(),
        summary,
        reason,
        path: event.path,
        eventType: event.type,
      };
    }

    if (rule.type === 'threshold') {
      const now = Date.now();
      const windowMs = rule.windowSeconds * 1000;
      const timestamps = this.thresholdWindows.get(rule.id) || [];
      timestamps.push(now);
      const filtered = timestamps.filter((t) => now - t <= windowMs);
      this.thresholdWindows.set(rule.id, filtered);

      if (filtered.length >= rule.count) {
        // Reset window after match to prevent rapid repeat alerts
        this.thresholdWindows.set(rule.id, []);
        const filterSummary = this.describeFilter(rule.match);
        const reason = `${filtered.length} ${filterSummary} in the last ${rule.windowSeconds}s (threshold: ${rule.count})`;
        const summary = reason;
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          timestamp: now,
          summary,
          reason,
          count: filtered.length,
          windowSeconds: rule.windowSeconds,
        };
      }
    }

    return null;
  }

  private matchesFilter(event: FileEvent, match: Rule['match']): boolean {
    const normalizedPath = event.path.toLowerCase();

    if (match.pathExcludes && match.pathExcludes.length > 0) {
      const excluded = match.pathExcludes.some((exc) => normalizedPath.includes(exc.toLowerCase()));
      if (excluded) return false;
    }

    if (match.pathIncludes && match.pathIncludes.length > 0) {
      const included = match.pathIncludes.some((inc) => normalizedPath.includes(inc.toLowerCase()));
      if (!included) return false;
    }

    if (match.extensions && match.extensions.length > 0) {
      const extension = path.extname(event.path).toLowerCase();
      const allowed = match.extensions.map((ext) => ext.toLowerCase());
      if (!allowed.includes(extension)) return false;
    }

    if (match.eventTypes && match.eventTypes.length > 0) {
      if (!match.eventTypes.includes(event.type)) return false;
    }

    return true;
  }

  private describeFilter(match: Rule['match']): string {
    const parts: string[] = [];
    if (match.extensions && match.extensions.length > 0) {
      parts.push(`files with ${match.extensions.join(', ')}`);
    }
    if (match.pathIncludes && match.pathIncludes.length > 0) {
      parts.push(`paths including ${match.pathIncludes.join(', ')}`);
    }
    if (match.eventTypes && match.eventTypes.length > 0) {
      parts.push(`events ${match.eventTypes.join(', ')}`);
    }
    if (parts.length === 0) {
      return 'events';
    }
    return parts.join(' and ');
  }

  private recordMatch(match: RuleMatch): void {
    this.recentMatches.push(match);
    if (this.recentMatches.length > this.recentMatchLimit) {
      this.recentMatches.shift();
    }
  }

  async addRule(rule: {
    name: string;
    description: string;
    condition: string;
    compiled: import('../llm/types').CompiledRule;
    source: 'llm' | 'manual';
  }): Promise<Rule> {
    return this.ruleStore.addRule(rule);
  }

  findDuplicateRule(condition: string, compiled: CompiledRule): Rule | null {
    return this.ruleStore.findDuplicateRule(condition, compiled);
  }

  async getAllRules(): Promise<Rule[]> {
    return this.ruleStore.getAllRules();
  }

  async getRule(id: string): Promise<Rule | null> {
    return this.ruleStore.getRule(id);
  }

  async updateRule(id: string, updates: Partial<Rule>): Promise<boolean> {
    return this.ruleStore.updateRule(id, updates);
  }

  async deleteRule(id: string): Promise<boolean> {
    return this.ruleStore.deleteRule(id);
  }

  getStats(): EngineStats {
    return { ...this.stats };
  }

  getRecentMatches(): RuleMatch[] {
    return [...this.recentMatches];
  }
}
