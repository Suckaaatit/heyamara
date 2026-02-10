import { MatchFilter, RuleType } from '../rules/types';

export interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
  averageLatency: number;
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
  total_duration?: number;
}

export interface CompiledRule {
  type: RuleType;
  match: MatchFilter;
  windowSeconds?: number;
  count?: number;
}

export interface CompileReject {
  reason: string;
  details?: string;
}

export interface CompileResult {
  rule?: CompiledRule;
  reject?: CompileReject;
  rawResponse?: string;
}
