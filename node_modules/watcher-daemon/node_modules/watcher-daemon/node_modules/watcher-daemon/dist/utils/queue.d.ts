export declare class LLMQueue<T = any> {
    private maxConcurrent;
    private maxQueueSize;
    private queue;
    private active;
    private processing;
    private shuttingDown;
    private readonly AGING_THRESHOLD;
    constructor(maxConcurrent?: number, maxQueueSize?: number);
    enqueue(task: () => Promise<T>, priority?: number): Promise<T>;
    /**
     * Gracefully drains the queue, waiting for active tasks to complete.
     * @param timeoutMs Maximum time to wait in milliseconds
     */
    drain(timeoutMs?: number): Promise<void>;
    private sortQueue;
    private processQueue;
    getQueueDepth(): number;
    getActiveCount(): number;
    isShuttingDown(): boolean;
}
//# sourceMappingURL=queue.d.ts.map