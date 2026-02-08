import { CompiledRule } from '../llm/types';
export interface ValidationError {
    field: string;
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
export declare function validateCompiledRule(rule: CompiledRule): ValidationResult;
export declare function validateCompiledRuleWithIntent(rule: CompiledRule, condition: string): ValidationResult;
//# sourceMappingURL=RuleValidator.d.ts.map
