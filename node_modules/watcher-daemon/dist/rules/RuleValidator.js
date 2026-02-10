"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCompiledRuleWithIntent = exports.validateCompiledRule = void 0;
const intent_1 = require("./intent");
const MIN_WINDOW_SECONDS = 10;
const MAX_WINDOW_SECONDS = 86400;
const MIN_THRESHOLD_COUNT = 1;
const MAX_THRESHOLD_COUNT = 1000;
function validateCompiledRule(rule) {
    const errors = [];
    if (!rule.type) {
        errors.push({ field: 'type', message: 'Rule type is required' });
    }
    const matchErrors = validateMatchFilter(rule.match);
    errors.push(...matchErrors);
    if (rule.type === 'threshold') {
        if (typeof rule.windowSeconds !== 'number' || Number.isNaN(rule.windowSeconds)) {
            errors.push({ field: 'windowSeconds', message: 'windowSeconds must be a number' });
        }
        else if (rule.windowSeconds < MIN_WINDOW_SECONDS || rule.windowSeconds > MAX_WINDOW_SECONDS) {
            errors.push({
                field: 'windowSeconds',
                message: `windowSeconds must be between ${MIN_WINDOW_SECONDS} and ${MAX_WINDOW_SECONDS}`,
            });
        }
        if (typeof rule.count !== 'number' || Number.isNaN(rule.count)) {
            errors.push({ field: 'count', message: 'count must be a number' });
        }
        else if (rule.count < MIN_THRESHOLD_COUNT || rule.count > MAX_THRESHOLD_COUNT) {
            errors.push({
                field: 'count',
                message: `count must be between ${MIN_THRESHOLD_COUNT} and ${MAX_THRESHOLD_COUNT}`,
            });
        }
    }
    // Prevent overly broad rules
    const hasPathOrExtension = (rule.match.pathIncludes && rule.match.pathIncludes.length > 0) ||
        (rule.match.extensions && rule.match.extensions.length > 0);
    if (!hasPathOrExtension) {
        errors.push({
            field: 'match',
            message: 'Rule is too broad. Add pathIncludes or extensions to narrow scope.',
        });
    }
    return { valid: errors.length === 0, errors };
}
exports.validateCompiledRule = validateCompiledRule;

function validateCompiledRuleWithIntent(rule, condition) {
    const base = validateCompiledRule(rule);
    const errors = [...base.errors];
    const intent = (0, intent_1.extractIntent)(condition);
    const thresholdRequested = intent.count !== undefined && intent.windowSeconds !== undefined;
    if (thresholdRequested && rule.type !== 'threshold') {
        errors.push({
            field: 'type',
            message: 'Rule mentions a count and time window but compiled rule is not threshold.',
        });
    }
    if (thresholdRequested && rule.type === 'threshold') {
        if (rule.count !== intent.count) {
            errors.push({
                field: 'count',
                message: `Rule mentions count ${intent.count} but compiled count is ${rule.count}.`,
            });
        }
        if (rule.windowSeconds !== intent.windowSeconds) {
            errors.push({
                field: 'windowSeconds',
                message: `Rule mentions window ${intent.windowSeconds}s but compiled window is ${rule.windowSeconds}s.`,
            });
        }
    }
    if (intent.eventTypes.length > 0) {
        const eventTypes = rule.match.eventTypes || [];
        if (eventTypes.length === 0) {
            errors.push({
                field: 'eventTypes',
                message: 'Rule mentions specific events but compiled rule has none.',
            });
        }
        else {
            const extra = eventTypes.filter((eventType) => !intent.eventTypes.includes(eventType));
            if (extra.length > 0) {
                errors.push({
                    field: 'eventTypes',
                    message: `Rule mentions ${intent.eventTypes.join(', ')} but compiled includes ${extra.join(', ')}.`,
                });
            }
        }
    }
    if (intent.extensions.length > 0) {
        const extensions = rule.match.extensions || [];
        const missing = intent.extensions.filter((ext) => !extensions.some((value) => value.toLowerCase() === ext.toLowerCase()));
        if (missing.length > 0) {
            errors.push({
                field: 'extensions',
                message: `Rule mentions ${missing.join(', ')} but compiled rule omitted them.`,
            });
        }
        const extras = extensions.filter((ext) => !intent.extensions.some((value) => value.toLowerCase() === ext.toLowerCase()));
        if (extras.length > 0) {
            errors.push({
                field: 'extensions',
                message: `Compiled rule added unexpected extensions: ${extras.join(', ')}.`,
            });
        }
    }
    if (intent.pathIncludes.length > 0) {
        const pathIncludes = rule.match.pathIncludes || [];
        const missing = intent.pathIncludes.filter((inc) => !pathIncludes.some((value) => value.toLowerCase().includes(inc.toLowerCase())));
        if (missing.length > 0) {
            errors.push({
                field: 'pathIncludes',
                message: `Rule mentions ${missing.join(', ')} but compiled rule omitted them.`,
            });
        }
        const extras = pathIncludes.filter((inc) => !intent.pathIncludes.some((value) => inc.toLowerCase().includes(value.toLowerCase())));
        if (extras.length > 0) {
            errors.push({
                field: 'pathIncludes',
                message: `Compiled rule added unexpected paths: ${extras.join(', ')}.`,
            });
        }
    }
    return { valid: errors.length === 0, errors };
}
exports.validateCompiledRuleWithIntent = validateCompiledRuleWithIntent;
function validateMatchFilter(match) {
    const errors = [];
    if (!match || typeof match !== 'object') {
        errors.push({ field: 'match', message: 'match filter is required' });
        return errors;
    }
    const validateArray = (field) => {
        const value = match[field];
        if (value !== undefined && (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))) {
            errors.push({ field: String(field), message: `${String(field)} must be an array of strings` });
        }
    };
    validateArray('pathIncludes');
    validateArray('pathExcludes');
    validateArray('extensions');
    validateArray('eventTypes');
    if (match.extensions) {
        for (const ext of match.extensions) {
            if (!ext.startsWith('.')) {
                errors.push({ field: 'extensions', message: `Extension "${ext}" must start with "."` });
            }
        }
    }
    if (match.eventTypes) {
        const allowed = ['created', 'modified', 'deleted'];
        for (const eventType of match.eventTypes) {
            if (!allowed.includes(eventType)) {
                errors.push({ field: 'eventTypes', message: `Invalid event type "${eventType}"` });
            }
        }
    }
    return errors;
}
//# sourceMappingURL=RuleValidator.js.map
