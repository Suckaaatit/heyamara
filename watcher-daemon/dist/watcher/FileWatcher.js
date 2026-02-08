"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWatcher = void 0;
const path_1 = __importDefault(require("path"));
const chokidar_1 = __importDefault(require("chokidar"));
const Logger_1 = __importDefault(require("../logger/Logger"));
class FileWatcher {
    watchPath;
    debounceMs;
    watcher = null;
    listeners = [];
    debounceMap = new Map();
    constructor(watchPath, debounceMs = 250) {
        this.watchPath = watchPath;
        this.debounceMs = debounceMs;
    }
    start() {
        Logger_1.default.info('Starting file watcher', { path: this.watchPath, debounceMs: this.debounceMs });
        this.watcher = chokidar_1.default.watch(this.watchPath, {
            ignored: [
                /(^|[\/\\])\../, // dotfiles
                /node_modules/,
                /\.git/,
                /dist/,
                /\.next/,
            ],
            persistent: true,
            ignoreInitial: false,
            awaitWriteFinish: {
                stabilityThreshold: 200,
                pollInterval: 100,
            },
        });
        this.watcher
            .on('add', (filePath) => this.enqueue('add', filePath))
            .on('change', (filePath) => this.enqueue('change', filePath))
            .on('unlink', (filePath) => this.enqueue('unlink', filePath))
            .on('error', (error) => Logger_1.default.error('Watcher error', { error: error.message }))
            .on('ready', () => Logger_1.default.info('File watcher ready'));
        Logger_1.default.debug('File watcher configured', {
            watchPath: this.watchPath,
            ignoredPatterns: ['dotfiles', 'node_modules', '.git', 'dist', '.next'],
        });
    }
    enqueue(type, filePath) {
        const existing = this.debounceMap.get(filePath);
        const state = existing || {
            timer: setTimeout(() => undefined, 0),
            added: false,
            changed: false,
            deleted: false,
        };
        if (type === 'add')
            state.added = true;
        if (type === 'change')
            state.changed = true;
        if (type === 'unlink')
            state.deleted = true;
        if (existing) {
            clearTimeout(existing.timer);
        }
        state.timer = setTimeout(() => {
            this.debounceMap.delete(filePath);
            const normalizedType = this.normalizeType(state);
            const normalizedPath = this.normalizePath(filePath);
            if (!normalizedPath)
                return;
            this.emitEvent(normalizedType, normalizedPath);
        }, this.debounceMs);
        this.debounceMap.set(filePath, state);
    }
    normalizeType(state) {
        if (state.deleted)
            return 'deleted';
        if (state.added)
            return 'created';
        return 'modified';
    }
    normalizePath(filePath) {
        const relative = path_1.default.relative(this.watchPath, filePath);
        if (relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
            Logger_1.default.warn('Skipped path outside watch directory', { path: filePath });
            return null;
        }
        return relative.split(path_1.default.sep).join('/');
    }
    async emitEvent(type, normalizedPath) {
        const event = {
            type,
            path: normalizedPath,
            timestamp: Date.now(),
        };
        Logger_1.default.debug('File event detected', {
            type,
            path: event.path,
        });
        for (const listener of this.listeners) {
            try {
                await listener(event);
            }
            catch (error) {
                Logger_1.default.error('Error in event listener', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    }
    onEvent(listener) {
        this.listeners.push(listener);
        Logger_1.default.debug('Event listener registered', { totalListeners: this.listeners.length });
    }
    stop() {
        if (this.watcher) {
            Logger_1.default.info('Stopping file watcher');
            this.watcher.close();
            this.watcher = null;
            Logger_1.default.debug('File watcher stopped');
        }
    }
}
exports.FileWatcher = FileWatcher;
//# sourceMappingURL=FileWatcher.js.map
