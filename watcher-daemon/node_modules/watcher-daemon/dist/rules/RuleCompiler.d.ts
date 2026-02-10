import { LLMClient } from '../llm/LLMClient';
import { CompileResult } from '../llm/types';
export declare class RuleCompiler {
    private llmClient;
    constructor(llmClient: LLMClient);
    compile(condition: string): Promise<CompileResult>;
    private parseResponse;
    private normalizeRuleType;
    private normalizeMatchFilter;
    private normalizeEventType;
}
//# sourceMappingURL=RuleCompiler.d.ts.map