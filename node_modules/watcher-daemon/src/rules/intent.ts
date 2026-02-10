import { EventType } from './types';

export interface RuleIntent {
  eventTypes: EventType[];
  extensions: string[];
  pathIncludes: string[];
  count?: number;
  windowSeconds?: number;
}

const EVENT_ORDER: EventType[] = ['created', 'modified', 'deleted'];

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
  python: ['.py'],
  markdown: ['.md', '.markdown'],
  json: ['.json'],
  yaml: ['.yml', '.yaml'],
  yml: ['.yml', '.yaml'],
  html: ['.html', '.htm'],
  css: ['.css'],
  text: ['.txt'],
  csv: ['.csv'],
  java: ['.java'],
  rust: ['.rs'],
  go: ['.go'],
  kotlin: ['.kt', '.kts'],
  csharp: ['.cs'],
  'c#': ['.cs'],
  cplusplus: ['.cpp', '.hpp', '.h'],
  'c++': ['.cpp', '.hpp', '.h'],
  c: ['.c', '.h'],
};

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  'inside',
  'within',
  'under',
  'from',
  'in',
  'on',
  'at',
  'to',
  'of',
  'for',
  'with',
  'without',
  'folder',
  'directory',
  'dir',
  'root',
  'path',
  'file',
  'files',
  'any',
]);

function normalizePathToken(token: string): string {
  let normalized = token.replace(/\\/g, '/');
  if (!normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }
  return normalized;
}

function isStopwordToken(token: string): boolean {
  const cleaned = token.replace(/[\\/]+$/, '').toLowerCase();
  if (!cleaned) return true;
  if (/^\d+$/.test(cleaned)) return true;
  return STOPWORDS.has(cleaned);
}

const LANGUAGE_MATCHERS: Array<{ key: string; regex: RegExp }> = [
  { key: 'typescript', regex: /\btypescript\b/ },
  { key: 'javascript', regex: /\bjavascript\b/ },
  { key: 'python', regex: /\bpython\b/ },
  { key: 'markdown', regex: /\bmarkdown\b/ },
  { key: 'json', regex: /\bjson\b/ },
  { key: 'yaml', regex: /\byaml\b/ },
  { key: 'yml', regex: /\byml\b/ },
  { key: 'html', regex: /\bhtml\b/ },
  { key: 'css', regex: /\bcss\b/ },
  { key: 'text', regex: /\btext\b/ },
  { key: 'csv', regex: /\bcsv\b/ },
  { key: 'java', regex: /\bjava\b/ },
  { key: 'rust', regex: /\brust\b/ },
  { key: 'go', regex: /\bgo\b/ },
  { key: 'kotlin', regex: /\bkotlin\b/ },
  { key: 'csharp', regex: /\bcsharp\b/ },
  { key: 'c#', regex: /\bc#\b/ },
  { key: 'cplusplus', regex: /\bcplusplus\b/ },
  { key: 'c++', regex: /\bc\+\+\b/ },
  { key: 'c', regex: /\bc\b/ },
];

function parseThresholdCount(text: string): number | undefined {
  const patterns: RegExp[] = [
    /\b(?:at\s+least|no\s+less\s+than|>=)\s*(\d+)\b/i,
    /\b(\d+)\s*(?:or\s+more|or\s+greater|or\s+above|or\s+over|\+)\s*(?:files?|events?|changes?|times?)?\b/i,
    /\b(\d+)\s+(?:files?|events?|changes?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = Number(match[1]);
      if (Number.isFinite(count) && count > 0) {
        return count;
      }
    }
  }
  return undefined;
}

function parseWindowSeconds(text: string): number | undefined {
  const match = text.match(/\b(?:within|in|over|during|for)\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = match[2].toLowerCase();
  if (unit.startsWith('hour') || unit.startsWith('hr')) return value * 3600;
  if (unit.startsWith('min')) return value * 60;
  return value;
}

export function extractIntent(condition: string): RuleIntent {
  const text = condition.toLowerCase();
  const eventTypes = new Set<EventType>();
  const extensions = new Set<string>();
  const pathIncludes = new Set<string>();

  const sawDelete = /\b(delete|deleted|deleting|remove|removed|unlink)\b/.test(text);
  const sawCreate = /\b(create|created|creating|creates|add|added|new)\b/.test(text);
  const sawModify = /\b(modify|modified|modifying|update|updated|updating|edit|edited|editing)\b/.test(text);
  const sawChange = /\b(change|changed|changes|changing)\b/.test(text);

  if (sawDelete) {
    eventTypes.add('deleted');
  }
  if (sawCreate) {
    eventTypes.add('created');
  }
  if (sawModify) {
    eventTypes.add('modified');
  }
  if (sawChange) {
    if (!sawDelete && !sawCreate && !sawModify) {
      eventTypes.add('created');
      eventTypes.add('modified');
    } else if (!eventTypes.has('modified')) {
      eventTypes.add('modified');
    }
  }

  const extensionMatches = text.matchAll(/\.[a-z0-9]{1,6}\b/g);
  for (const match of extensionMatches) {
    extensions.add(match[0]);
  }

  if (extensions.size === 0) {
    for (const matcher of LANGUAGE_MATCHERS) {
      if (matcher.regex.test(text)) {
        const exts = LANGUAGE_EXTENSIONS[matcher.key];
        if (exts) {
          exts.forEach((ext) => extensions.add(ext));
        }
      }
    }
  }

  const pathMatches = text.matchAll(/([a-z0-9_.-]+[\\/])/gi);
  for (const match of pathMatches) {
    if (!isStopwordToken(match[1])) {
      pathIncludes.add(normalizePathToken(match[1]));
    }
  }

  const phraseMatches = text.matchAll(
    /\b(in|from|under|inside|within)\s+(?:the|a|an)?\s*([a-z0-9_.-]+)\b/gi
  );
  for (const match of phraseMatches) {
    if (!isStopwordToken(match[2])) {
      pathIncludes.add(normalizePathToken(match[2]));
    }
  }

  return {
    eventTypes: EVENT_ORDER.filter((eventType) => eventTypes.has(eventType)),
    extensions: Array.from(extensions),
    pathIncludes: Array.from(pathIncludes),
    count: parseThresholdCount(text),
    windowSeconds: parseWindowSeconds(text),
  };
}
