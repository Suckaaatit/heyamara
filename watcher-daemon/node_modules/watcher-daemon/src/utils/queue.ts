import Logger from '../logger/Logger';

interface QueueItem<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  priority: number;
  timestamp: number;
  enqueueTime: number;
}

export class LLMQueue<T = any> {
  private maxConcurrent: number;
  private maxQueueSize: number;
  private queue: Array<QueueItem<T>> = [];
  private active = 0;
  private processing = false;
  private shuttingDown = false;
  private readonly AGING_THRESHOLD = 10000; // 10 seconds

  constructor(maxConcurrent = 5, maxQueueSize = 100) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
  }

  async enqueue(task: () => Promise<T>, priority = 1): Promise<T> {
    if (this.shuttingDown) {
      return Promise.reject(new Error('Queue is shutting down'));
    }

    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        this.queue.sort((a, b) => a.priority - b.priority);
        const dropped = this.queue.pop();
        if (dropped) {
          Logger.warn('Queue full - dropped low priority task', {
            droppedPriority: dropped.priority,
          });
          dropped.reject(new Error('Queue overflow - task dropped'));
        }
      }

      const now = Date.now();
      const item: QueueItem<T> = {
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
  async drain(timeoutMs = 30000): Promise<void> {
    this.shuttingDown = true;
    Logger.info('Queue draining started', {
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
        Logger.warn('Queue drain timed out', {
          active: this.active,
          waited: Date.now() - startTime,
        });
        break;
      }
      Logger.debug('Waiting for active tasks', {
        active: this.active,
        elapsed: Date.now() - startTime,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    Logger.info('Queue drain complete', {
      waited: Date.now() - startTime,
      remainingActive: this.active,
    });
  }

  private sortQueue(): void {
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

  private processQueue(): void {
    if (this.processing || this.shuttingDown) return;
    this.processing = true;

    setImmediate(async () => {
      while (this.active < this.maxConcurrent && this.queue.length > 0 && !this.shuttingDown) {
        this.sortQueue(); // Re-sort to account for aging
        const item = this.queue.shift();
        if (!item) break;

        this.active++;
        item
          .task()
          .then((result) => {
            item.resolve(result);
          })
          .catch((error) => {
            Logger.error('Queue task failed', { error: (error as Error).message });
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

  getQueueDepth(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.active;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
