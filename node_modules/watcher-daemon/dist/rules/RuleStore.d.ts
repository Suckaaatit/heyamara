import { Rule } from './types';
import { CompiledRule } from '../llm/types';
type RuleUpdates = Partial<Pick<Rule, 'name' | 'description' | 'enabled'>>;
export declare class RuleStore {
    private dbPath;
    private data;
    private saveQueue;
    private SCHEMA_VERSION;
    constructor(dbPath: string);
    init(): Promise<void>;
    private isRuleSafe;
    private save;
    addRule(params: {
        name: string;
        description: string;
        condition: string;
        compiled: CompiledRule;
        source: 'llm' | 'manual';
    }): Promise<Rule>;
    findDuplicateRule(condition: string, compiled: CompiledRule): Rule | null;
    getRule(id: string): Promise<Rule | null>;
    getAllRules(): Promise<Rule[]>;
    getEnabledRules(): Promise<Rule[]>;
    updateRule(id: string, updates: RuleUpdates): Promise<boolean>;
    deleteRule(id: string): Promise<boolean>;
    recordMatch(ruleId: string): Promise<void>;
    private generateId;
    close(): void;
}
export {};
//# sourceMappingURL=RuleStore.d.ts.map
