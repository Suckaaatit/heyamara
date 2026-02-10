import { TokenUsage } from './types';
export declare class LLMClient {
    private client;
    private model;
    private tokenUsage;
    constructor(host: string, model: string);
    checkHealth(): Promise<boolean>;
    generate(prompt: string, retries?: number): Promise<string>;
    private updateTokenUsage;
    getTokenUsage(): TokenUsage;
    getModel(): string;
    resetTokenUsage(): void;
}
//# sourceMappingURL=LLMClient.d.ts.map