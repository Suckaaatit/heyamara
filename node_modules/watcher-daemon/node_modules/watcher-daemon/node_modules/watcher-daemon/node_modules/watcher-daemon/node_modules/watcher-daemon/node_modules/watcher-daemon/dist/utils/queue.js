"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMQueue = void 0;
const Logger_1 = __importDefault(require("../logger/Logger"));
class LLMQueue {
    maxConcurrent;
    maxQueueSize;
    queue = [];
    active = 0;
    processing = false;
    shuttingDown = false;
    AGING_THRESHOLD = 10000; // 10 seconds
    constructor(maxConcurrent = 5, maxQueueSize = 100) {
        this.maxConcurrent = maxConcurrent;
        this.maxQueueSize = maxQueueSize;
    }
    async enqueue(task, priority = 1) {
        if (this.shuttingDown) {
            return Promise.reject(new Error('Queue is shutting down'));
        }
        return new Promise((resolve, reject) => {
            if (this.queue.length >= this.maxQueueSize) {
                this.queue.sort((a, b) => a.priority - b.priority);
                const dropped = this.queue.pop();
                if (dropped) {
                    Logger_1.default.warn('Queue full - dropped low priority task', {
                        droppedPriority: dropped.priority,
                    });
                    dropped.reject(new Error('Queue overflow - task dropped'));
                }
            }
            const now = Date.now();
            const item = {
                task,
                resolve,
                reject,
                priority,
                timestamp: now,
                enqueueTime: now,
            };
            this.queue.push(item);
            this.sortQueue();
            this.processQueue();
        });
    }
    /**
     * Gracefully drains the queue, waiting for active tasks to complete.
     * @param timeoutMs Maximum time to wait in milliseconds
     */
    async drain(timeoutMs = 30000) {
        this.shuttingDown = true;
        Logger_1.default.info('Queue draining started', {
            active: this.active,
            queued: this.queue.length,
            timeout: timeoutMs,
        });
        const startTime = Date.now();
        // Reject pending items
        const pendingItems = [...this.queue];
        this.queue = [];
        pendingItems.forEach((item) => {
            item.reject(new Error('Queue draining - task cancelled'));
        });
        // Wait for active tasks with timeout
        while (this.active > 0) {
            if (Date.now() - startTime > timeoutMs) {
                Logger_1.default.warn('Queue drain timed out', {
                    active: this.active,
                    waited: Date.now() - startTime,
                });
                break;
            }
            Logger_1.default.debug('Waiting for active tasks', {
                active: this.active,
                elapsed: Date.now() - startTime,
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        Logger_1.default.info('Queue drain complete', {
            waited: Date.now() - startTime,
            remainingActive: this.active,
        });
    }
    sortQueue() {
        const now = Date.now();
        this.queue.forEach((item) => {
            const age = now - item.enqueueTime;
            if (age > this.AGING_THRESHOLD) {
                // Boost priority for tasks waiting too long
                item.priority = Math.max(0, item.priority - 1);
            }
        });
        this.queue.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
    }
    processQueue() {
        if (this.processing || this.shuttingDown)
            return;
        this.processing = true;
        setImmediate(async () => {
            while (this.active < this.maxConcurrent && this.queue.length > 0 && !this.shuttingDown) {
                this.sortQueue(); // Re-sort to account for aging
                const item = this.queue.shift();
                if (!item)
                    break;
                this.active++;
                item
                    .task()
                    .then((result) => {
                    item.resolve(result);
                })
                    .catch((error) => {
                    Logger_1.default.error('Queue task failed', { error: error.message });
                    item.reject(error);
                })
                    .finally(() => {
                    this.active--;
                    this.processing = false;
                    this.processQueue();
                });
            }
            this.processing = false;
        });
    }
    getQueueDepth() {
        return this.queue.length;
    }
    getActiveCount() {
        return this.active;
    }
    isShuttingDown() {
        return this.shuttingDown;
    }
}
exports.LLMQueue = LLMQueue;
//# sourceMappingURL=queue.js.map