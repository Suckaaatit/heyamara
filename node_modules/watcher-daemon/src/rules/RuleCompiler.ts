import Logger from '../logger/Logger';
import { LLMClient } from '../llm/LLMClient';
import { CompileResult, CompiledRule } from '../llm/types';
import { EventType, MatchFilter, RuleType } from './types';
import { extractIntent } from './intent';

export class RuleCompiler {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async compile(condition: string): Promise<CompileResult> {
    const prompt = `You are a rules compiler for a local file watcher daemon.
Convert the user's natural-language rule into a STRICT JSON object.

Allowed rule types:
1) Pattern rule:
{
  "type": "pattern",
  "match": {
    "pathIncludes": ["src/", "components/"],
    "pathExcludes": ["node_modules/"],
    "extensions": [".ts", ".tsx"],
    "eventTypes": ["created", "modified", "deleted"]
  }
}

2) Threshold rule:
{
  "type": "threshold",
  "match": {
    "pathIncludes": ["__tests__/"],
    "extensions": [".test.ts"]
  },
  "windowSeconds": 600,
  "count": 5
}

If the rule is vague, unsafe, or unbounded, respond with:
{ "reject": { "reason": "short reason", "details": "optional details" } }

Rules:
- Output JSON only. No extra text.
- Use eventTypes ONLY from: created, modified, deleted.
- Use extensions with leading dot, like ".ts".
- Use seconds for windowSeconds.
- If the user explicitly mentions an event (create/modify/delete), ONLY include those events.
- Only include extensions if the user explicitly mentions an extension or language.
- Only include pathIncludes if the user explicitly mentions a directory/path.

User rule:
"${condition}"

JSON response only:`;

    try {
      const response = await this.llmClient.generate(prompt, 2);
      const parsed = this.parseResponse(response);
      if (parsed.reject) {
        return { reject: parsed.reject, rawResponse: response };
      }
      if (!parsed.rule) {
        return {
          reject: { reason: 'Failed to compile rule', details: 'No valid rule in LLM response' },
          rawResponse: response,
        };
      }
      const alignedRule = this.alignRuleToIntent(condition, parsed.rule);
      return { rule: alignedRule, rawResponse: response };
    } catch (error) {
      Logger.error('Rule compilation failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return {
        reject: { reason: 'LLM unavailable', details: 'Rule compilation failed' },
      };
    }
  }

  private parseResponse(response: string): CompileResult {
    const jsonSnippet = this.extractJsonSnippet(response);
    if (!jsonSnippet) {
      return {
        reject: { reason: 'Invalid response', details: 'No JSON found in LLM response' },
        rawResponse: response,
      };
    }

    const parsed = this.parseJsonWithRepairs(jsonSnippet);
    if (!parsed) {
      return {
        reject: { reason: 'Invalid JSON', details: 'Failed to parse LLM response JSON' },
        rawResponse: response,
      };
    }

    if (parsed.reject) {
      return {
        reject: {
          reason: typeof parsed.reject.reason === 'string' ? parsed.reject.reason : 'Rejected',
          details: typeof parsed.reject.details === 'string' ? parsed.reject.details : undefined,
        },
        rawResponse: response,
      };
    }

    const type = this.normalizeRuleType(parsed.type);
    if (!type) {
      return {
        reject: { reason: 'Invalid rule type', details: 'Type must be pattern or threshold' },
        rawResponse: response,
      };
    }

    const match = this.normalizeMatchFilter(parsed.match);
    const rule: CompiledRule = {
      type,
      match,
    };

    if (type === 'threshold') {
      const windowSeconds = Number(parsed.windowSeconds);
      const count = Number(parsed.count);
      rule.windowSeconds = Number.isFinite(windowSeconds) ? windowSeconds : undefined;
      rule.count = Number.isFinite(count) ? count : undefined;
    }

    return { rule, rawResponse: response };
  }

  private extractJsonSnippet(response: string): string | null {
    const cleaned = response
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return cleaned.slice(start, end + 1);
  }

  private parseJsonWithRepairs(snippet: string): any | null {
    const direct = this.tryParseJson(snippet);
    if (direct) {
      return direct;
    }
    const repaired = this.repairJson(snippet);
    return this.tryParseJson(repaired);
  }

  private tryParseJson(input: string): any | null {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  private repairJson(input: string): string {
    let output = input;
    output = output.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    output = output.replace(/,\s*([}\]])/g, '$1');
    output = output.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
    output = output.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    return output;
  }

  private normalizeRuleType(input: unknown): RuleType | null {
    if (typeof input !== 'string') return null;
    const normalized = input.toLowerCase().trim();
    if (normalized === 'pattern' || normalized === 'threshold') {
      return normalized as RuleType;
    }
    return null;
  }

  private normalizeMatchFilter(match: any): MatchFilter {
    const filter: MatchFilter = {};
    if (match && typeof match === 'object') {
      if (Array.isArray(match.pathIncludes)) {
        filter.pathIncludes = match.pathIncludes
          .filter((p: any) => typeof p === 'string')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);
      }
      if (Array.isArray(match.pathExcludes)) {
        filter.pathExcludes = match.pathExcludes
          .filter((p: any) => typeof p === 'string')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);
      }
      if (Array.isArray(match.extensions)) {
        filter.extensions = match.extensions
          .filter((e: any) => typeof e === 'string')
          .map((e: string) => e.trim())
          .filter((e: string) => e.length > 0)
          .map((e: string) => (e.startsWith('.') ? e : `.${e}`));
      }
      if (Array.isArray(match.eventTypes)) {
        const normalized = match.eventTypes
          .filter((e: any) => typeof e === 'string')
          .map((e: string) => this.normalizeEventType(e))
          .filter((e: EventType | null): e is EventType => !!e);
        if (normalized.length > 0) {
          filter.eventTypes = normalized;
        }
      }
    }
    return filter;
  }

  private normalizeEventType(input: string): EventType | null {
    const value = input.toLowerCase().trim();
    const map: Record<string, EventType> = {
      add: 'created',
      added: 'created',
      create: 'created',
      created: 'created',
      new: 'created',
      change: 'modified',
      changed: 'modified',
      modify: 'modified',
      modified: 'modified',
      update: 'modified',
      updated: 'modified',
      delete: 'deleted',
      deleted: 'deleted',
      remove: 'deleted',
      removed: 'deleted',
      unlink: 'deleted',
    };
    return map[value] || null;
  }

  private alignRuleToIntent(condition: string, rule: CompiledRule): CompiledRule {
    const intent = extractIntent(condition);
    const match: MatchFilter = { ...rule.match };
    let adjusted = false;

    const thresholdRequested = intent.count !== undefined && intent.windowSeconds !== undefined;
    if (thresholdRequested) {
      rule.type = 'threshold';
      rule.count = intent.count;
      rule.windowSeconds = intent.windowSeconds;
      adjusted = true;
    } else if (rule.type === 'threshold') {
      rule.type = 'pattern';
      delete rule.count;
      delete rule.windowSeconds;
      adjusted = true;
    }

    if (intent.eventTypes.length > 0) {
      match.eventTypes = intent.eventTypes;
      adjusted = true;
    }

    if (intent.extensions.length > 0) {
      match.extensions = intent.extensions;
      adjusted = true;
    } else if (match.extensions && match.extensions.length > 0) {
      delete match.extensions;
      adjusted = true;
    }

    if (intent.pathIncludes.length > 0) {
      const unique = Array.from(
        new Set(intent.pathIncludes.map((value) => value.trim()).filter((value) => value.length > 0))
      );
      match.pathIncludes = unique;
      adjusted = true;
    } else if (match.pathIncludes && match.pathIncludes.length > 0) {
      delete match.pathIncludes;
      adjusted = true;
    }

    if (!/(exclude|excluding|except|ignore|ignoring)\b/i.test(condition)) {
      if (match.pathExcludes && match.pathExcludes.length > 0) {
        delete match.pathExcludes;
        adjusted = true;
      }
    }

    if (adjusted) {
      Logger.info('Rule compiler: adjusted output to match user intent', {
        condition,
        intent,
      });
    }

    return { ...rule, match };
  }
}
