export type EventType = 'created' | 'modified' | 'deleted';

export interface MatchFilter {
  pathIncludes?: string[];
  pathExcludes?: string[];
  extensions?: string[];
  eventTypes?: EventType[];
}

export type RuleType = 'pattern' | 'threshold';

export interface BaseRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: number;
  lastMatched?: number;
  matchCount: number;
  type: RuleType;
  match: MatchFilter;
  action: 'notify';
  source: 'llm' | 'manual';
  originalCondition?: string;
}

export interface PatternRule extends BaseRule {
  type: 'pattern';
}

export interface ThresholdRule extends BaseRule {
  type: 'threshold';
  windowSeconds: number;
  count: number;
}

export type Rule = PatternRule | ThresholdRule;

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  timestamp: number;
  summary: string;
  reason?: string;
  path?: string;
  eventType?: EventType;
  count?: number;
  windowSeconds?: number;
}
