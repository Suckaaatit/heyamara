import { RuleEngine } from '../rules/RuleEngine';
import { LLMClient } from '../llm/LLMClient';
export declare class APIServer {
    private port;
    private ruleEngine;
    private llmClient;
    private compiler;
    private app;
    private server?;
    constructor(port: number, ruleEngine: RuleEngine, llmClient: LLMClient);
    private setupRoutes;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=APIServer.d.ts.map