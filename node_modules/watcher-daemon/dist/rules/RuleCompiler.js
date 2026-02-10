"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleCompiler = void 0;
const Logger_1 = __importDefault(require("../logger/Logger"));
const intent_1 = require("./intent");
class RuleCompiler {
    llmClient;
    constructor(llmClient) {
        this.llmClient = llmClient;
    }
    async compile(condition) {
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
        }
        catch (error) {
            Logger_1.default.error('Rule compilation failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return {
                reject: { reason: 'LLM unavailable', details: 'Rule compilation failed' },
            };
        }
    }
    parseResponse(response) {
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
        const rule = {
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
    extractJsonSnippet(response) {
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
    parseJsonWithRepairs(snippet) {
        const direct = this.tryParseJson(snippet);
        if (direct) {
            return direct;
        }
        const repaired = this.repairJson(snippet);
        return this.tryParseJson(repaired);
    }
    tryParseJson(input) {
        try {
            return JSON.parse(input);
        }
        catch (_a) {
            return null;
        }
    }
    repairJson(input) {
        let output = input;
        output = output.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        output = output.replace(/,\s*([}\]])/g, '$1');
        output = output.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
        output = output.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
        return output;
    }
    normalizeRuleType(input) {
        if (typeof input !== 'string')
            return null;
        const normalized = input.toLowerCase().trim();
        if (normalized === 'pattern' || normalized === 'threshold') {
            return normalized;
        }
        return null;
    }
    normalizeMatchFilter(match) {
        const filter = {};
        if (match && typeof match === 'object') {
            if (Array.isArray(match.pathIncludes)) {
                filter.pathIncludes = match.pathIncludes
                    .filter((p) => typeof p === 'string')
                    .map((p) => p.trim())
                    .filter((p) => p.length > 0);
            }
            if (Array.isArray(match.pathExcludes)) {
                filter.pathExcludes = match.pathExcludes
                    .filter((p) => typeof p === 'string')
                    .map((p) => p.trim())
                    .filter((p) => p.length > 0);
            }
            if (Array.isArray(match.extensions)) {
                filter.extensions = match.extensions
                    .filter((e) => typeof e === 'string')
                    .map((e) => e.trim())
                    .filter((e) => e.length > 0)
                    .map((e) => (e.startsWith('.') ? e : `.${e}`));
            }
            if (Array.isArray(match.eventTypes)) {
                const normalized = match.eventTypes
                    .filter((e) => typeof e === 'string')
                    .map((e) => this.normalizeEventType(e))
                    .filter((e) => !!e);
                if (normalized.length > 0) {
                    filter.eventTypes = normalized;
                }
            }
        }
        return filter;
    }
    normalizeEventType(input) {
        const value = input.toLowerCase().trim();
        const map = {
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
    alignRuleToIntent(condition, rule) {
        const intent = (0, intent_1.extractIntent)(condition);
        const match = { ...rule.match };
        let adjusted = false;
        const thresholdRequested = intent.count !== undefined && intent.windowSeconds !== undefined;
        if (thresholdRequested) {
            rule.type = 'threshold';
            rule.count = intent.count;
            rule.windowSeconds = intent.windowSeconds;
            adjusted = true;
        }
        else if (rule.type === 'threshold') {
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
        }
        else if (match.extensions && match.extensions.length > 0) {
            delete match.extensions;
            adjusted = true;
        }
        if (intent.pathIncludes.length > 0) {
            const unique = Array.from(new Set(intent.pathIncludes.map((value) => value.trim()).filter((value) => value.length > 0)));
            match.pathIncludes = unique;
            adjusted = true;
        }
        else if (match.pathIncludes && match.pathIncludes.length > 0) {
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
            Logger_1.default.info('Rule compiler: adjusted output to match user intent', {
                condition,
                intent,
            });
        }
        return { ...rule, match };
    }
}
exports.RuleCompiler = RuleCompiler;
//# sourceMappingURL=RuleCompiler.js.map
