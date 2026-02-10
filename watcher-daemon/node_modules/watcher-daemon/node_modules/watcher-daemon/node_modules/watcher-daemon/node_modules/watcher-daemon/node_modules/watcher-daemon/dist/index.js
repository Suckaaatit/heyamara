"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Logger_1 = __importDefault(require("./logger/Logger"));
const config_1 = require("./utils/config");
const FileWatcher_1 = require("./watcher/FileWatcher");
const RuleStore_1 = require("./rules/RuleStore");
const RuleEngine_1 = require("./rules/RuleEngine");
const LLMClient_1 = require("./llm/LLMClient");
const Notifier_1 = require("./notifications/Notifier");
const APIServer_1 = require("./api/APIServer");
const security_1 = require("./utils/security");
class WatcherDaemon {
    fileWatcher;
    ruleStore;
    ruleEngine;
    llmClient;
    notifier;
    apiServer = null;
    securityValidator;
    constructor() {
        this.ensureDirectories();
        // Initialize security validator
        this.securityValidator = new security_1.SecurityValidator({
            allowedBasePaths: [process.cwd(), config_1.config.watchDir],
            allowSymlinks: false,
            maxFileSize: 100 * 1024 * 1024, // 100MB
            blockedExtensions: ['.exe', '.dll', '.so', '.dylib'],
        });
        // Validate watch directory security
        if (!this.securityValidator.validateWatchDirectory(config_1.config.watchDir)) {
            Logger_1.default.error('Security: Watch directory validation failed');
            throw new Error('Invalid watch directory');
        }
        this.ruleStore = new RuleStore_1.RuleStore(config_1.config.dbPath);
        this.llmClient = new LLMClient_1.LLMClient(config_1.config.ollamaHost, config_1.config.ollamaModel);
        this.ruleEngine = new RuleEngine_1.RuleEngine(this.ruleStore, config_1.config.watchDir, config_1.config.matchHistoryLimit, this.securityValidator);
        this.notifier = new Notifier_1.Notifier(config_1.config.notificationsEnabled);
        this.fileWatcher = new FileWatcher_1.FileWatcher(config_1.config.watchDir, config_1.config.watchDebounceMs);
        if (config_1.config.apiEnabled) {
            this.apiServer = new APIServer_1.APIServer(config_1.config.apiPort, this.ruleEngine, this.llmClient);
        }
    }
    ensureDirectories() {
        const dirs = [config_1.config.watchDir, path_1.default.dirname(config_1.config.dbPath), path_1.default.dirname(config_1.config.logFile)];
        dirs.forEach((dir) => {
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
                Logger_1.default.info('Created directory', { path: dir });
            }
        });
    }
    async start() {
        console.log('🚀 Watcher Daemon Starting...\n');
        await this.ruleEngine.init();
        const llmAvailable = await this.llmClient.checkHealth();
        if (!llmAvailable) {
            Logger_1.default.warn('LLM unavailable at startup - rule compilation will be disabled');
            console.warn(`⚠️  LLM unavailable. Rule compilation will fail until Ollama is running.`);
            console.warn(`    Start Ollama and run: ollama pull ${config_1.config.ollamaModel}\n`);
        }
        this.fileWatcher.onEvent(async (event) => {
            try {
                const matches = await this.ruleEngine.evaluateEvent(event);
                matches.forEach((match) => {
                    this.notifier.notifyMatch(match);
                });
            }
            catch (error) {
                Logger_1.default.error('Event processing failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        this.fileWatcher.start();
        if (this.apiServer) {
            this.apiServer.start();
        }
        const rules = await this.ruleEngine.getAllRules();
        this.printStatus(rules.length);
        this.setupShutdownHandlers();
    }
    printStatus(ruleCount) {
        console.log('✅ Daemon Running\n');
        console.log('Configuration:');
        console.log(`  📁 Watch Directory: ${config_1.config.watchDir}`);
        console.log(`  🧠 Rules Loaded: ${ruleCount}`);
        console.log(`  🔔 Notifications: ${config_1.config.notificationsEnabled ? 'Enabled' : 'Disabled'}`);
        console.log(`  🪵 Debounce: ${config_1.config.watchDebounceMs}ms`);
        if (config_1.config.apiEnabled) {
            console.log(`  📡 API: http://localhost:${config_1.config.apiPort}`);
        }
        console.log(`  📝 Logs: ${config_1.config.logFile}\n`);
        console.log('Press Ctrl+C to stop\n');
    }
    setupShutdownHandlers() {
        const shutdown = async (signal) => {
            Logger_1.default.info('Shutdown signal received', { signal });
            console.log(`\n\n🛑 Shutting down gracefully...\n`);
            this.fileWatcher.stop();
            Logger_1.default.info('File watcher stopped');
            if (this.apiServer) {
                this.apiServer.stop();
            }
            this.ruleStore.close();
            Logger_1.default.info('Daemon stopped');
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            Logger_1.default.error('Uncaught exception', { error: error.message, stack: error.stack });
            this.notifier.notifyError(`Daemon crashed: ${error.message}`);
            process.exit(1);
        });
        process.on('unhandledRejection', (reason) => {
            Logger_1.default.error('Unhandled rejection', { reason });
            this.notifier.notifyError(`Unhandled promise rejection`);
        });
    }
}
const daemon = new WatcherDaemon();
daemon.start().catch((error) => {
    console.error('Failed to start daemon:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map