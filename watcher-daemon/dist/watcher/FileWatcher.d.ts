import { FileEvent } from './types';
type EventListener = (event: FileEvent) => Promise<void> | void;
export declare class FileWatcher {
    private watchPath;
    private debounceMs;
    private watcher;
    private listeners;
    private debounceMap;
    constructor(watchPath: string, debounceMs?: number);
    start(): void;
    private enqueue;
    private normalizeType;
    private normalizePath;
    private emitEvent;
    onEvent(listener: EventListener): void;
    stop(): void;
}
export {};
//# sourceMappingURL=FileWatcher.d.ts.map