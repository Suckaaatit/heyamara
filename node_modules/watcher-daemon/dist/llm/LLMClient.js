"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const axios_1 = __importDefault(require("axios"));
const Logger_1 = __importDefault(require("../logger/Logger"));
class LLMClient {
    client;
    model;
    tokenUsage;
    constructor(host, model) {
        this.client = axios_1.default.create({
            baseURL: host,
            timeout: 30000,
        });
        this.model = model;
        this.tokenUsage = {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            requestCount: 0,
            successCount: 0,
            failureCount: 0,
            averageLatency: 0,
        };
        Logger_1.default.debug('LLMClient initialized', { host, model });
    }
    async checkHealth() {
        try {
            const response = await this.client.get('/api/tags');
            const models = response.data.models || [];
            const hasModel = models.some((m) => m.name.includes(this.model));
            if (!hasModel) {
                Logger_1.default.warn('Model not found in Ollama', {
                    model: this.model,
                    available: models.map((m) => m.name),
                });
                return false;
            }
            Logger_1.default.info('LLM health check passed', { model: this.model });
            return true;
        }
        catch (error) {
            Logger_1.default.error('LLM health check failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    async generate(prompt, retries = 2) {
        const startTime = Date.now();
        const baseDelay = 1000;
        const maxDelay = 10000;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const payload = {
                    model: this.model,
                    prompt,
                    stream: false,
                    // Request structured JSON output to improve small-model compliance.
                    format: 'json',
                    options: {
                        // Favor deterministic, shorter outputs for reliability on small models.
                        temperature: 0,
                        num_ctx: 2048,
                        num_predict: 256,
                    },
                };
                Logger_1.default.debug('Sending LLM request', {
                    attempt,
                    model: this.model,
                    promptLength: prompt.length,
                });
                const response = await this.client.post('/api/generate', payload);
                const data = response.data;
                const latency = Date.now() - startTime;
                if (attempt > 1) {
                    Logger_1.default.info('LLM request succeeded after retry', { attempt });
                }
                this.updateTokenUsage(prompt, data.response, data, latency, true);
                Logger_1.default.debug('LLM response received', {
                    latency,
                    promptEvalCount: data.prompt_eval_count,
                    evalCount: data.eval_count,
                });
                return data.response;
            }
            catch (error) {
                const isLastAttempt = attempt === retries;
                const latency = Date.now() - startTime;
                Logger_1.default.warn('LLM request failed', {
                    attempt,
                    maxRetries: retries,
                    error: error instanceof Error ? error.message : 'Unknown',
                });
                if (isLastAttempt) {
                    this.updateTokenUsage(prompt, '', null, latency, false);
                    throw error;
                }
                const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
                Logger_1.default.debug('Retrying after delay', { delay, nextAttempt: attempt + 1 });
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw new Error('All retry attempts exhausted');
    }
    updateTokenUsage(prompt, response, ollamaData, latency, success) {
        const previousTotal = this.tokenUsage.totalTokens;
        this.tokenUsage.requestCount++;
        if (success) {
            this.tokenUsage.successCount++;
            if (ollamaData?.prompt_eval_count && ollamaData?.eval_count) {
                this.tokenUsage.promptTokens += ollamaData.prompt_eval_count;
                this.tokenUsage.completionTokens += ollamaData.eval_count;
                Logger_1.default.debug('Token usage from API', {
                    promptTokens: ollamaData.prompt_eval_count,
                    completionTokens: ollamaData.eval_count,
                });
            }
            else {
                const estimatedPrompt = Math.ceil(prompt.length / 3.5);
                const estimatedCompletion = Math.ceil(response.length / 3.5);
                this.tokenUsage.promptTokens += estimatedPrompt;
                this.tokenUsage.completionTokens += estimatedCompletion;
                Logger_1.default.debug('Token usage estimated', {
                    estimatedPrompt,
                    estimatedCompletion,
                });
            }
            this.tokenUsage.totalTokens = this.tokenUsage.promptTokens + this.tokenUsage.completionTokens;
        }
        else {
            this.tokenUsage.failureCount++;
        }
        const n = this.tokenUsage.requestCount;
        this.tokenUsage.averageLatency = (this.tokenUsage.averageLatency * (n - 1) + latency) / n;
        Logger_1.default.debug('Token usage updated', {
            requestNumber: this.tokenUsage.requestCount,
            previousTotal,
            newTotal: this.tokenUsage.totalTokens,
            delta: this.tokenUsage.totalTokens - previousTotal,
            source: ollamaData?.prompt_eval_count ? 'api' : 'estimated',
        });
    }
    getTokenUsage() {
        return { ...this.tokenUsage };
    }
    getModel() {
        return this.model;
    }
    resetTokenUsage() {
        this.tokenUsage = {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            requestCount: 0,
            successCount: 0,
            failureCount: 0,
            averageLatency: 0,
        };
        Logger_1.default.info('Token usage reset');
    }
}
exports.LLMClient = LLMClient;
//# sourceMappingURL=LLMClient.js.map
