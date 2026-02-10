import fs from 'fs';
import path from 'path';
import Logger from './logger/Logger';
import { config } from './utils/config';
import { FileWatcher } from './watcher/FileWatcher';
import { RuleStore } from './rules/RuleStore';
import { RuleEngine } from './rules/RuleEngine';
import { LLMClient } from './llm/LLMClient';
import { Notifier } from './notifications/Notifier';
import { APIServer } from './api/APIServer';
import { SecurityValidator } from './utils/security';

class WatcherDaemon {
  private fileWatcher: FileWatcher;
  private ruleStore: RuleStore;
  private ruleEngine: RuleEngine;
  private llmClient: LLMClient;
  private notifier: Notifier;
  private apiServer: APIServer | null = null;
  private securityValidator: SecurityValidator;

  constructor() {
    this.ensureDirectories();

    // Initialize security validator
    this.securityValidator = new SecurityValidator({
      allowedBasePaths: [process.cwd(), config.watchDir],
      allowSymlinks: false,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      blockedExtensions: ['.exe', '.dll', '.so', '.dylib'],
    });

    // Validate watch directory security
    if (!this.securityValidator.validateWatchDirectory(config.watchDir)) {
      Logger.error('Security: Watch directory validation failed');
      throw new Error('Invalid watch directory');
    }

    this.ruleStore = new RuleStore(config.dbPath);
    this.llmClient = new LLMClient(config.ollamaHost, config.ollamaModel);
    this.ruleEngine = new RuleEngine(
      this.ruleStore,
      config.watchDir,
      config.matchHistoryLimit,
      this.securityValidator
    );
    this.notifier = new Notifier(config.notificationsEnabled);
    this.fileWatcher = new FileWatcher(config.watchDir, config.watchDebounceMs);

    if (config.apiEnabled) {
      this.apiServer = new APIServer(config.apiPort, this.ruleEngine, this.llmClient);
    }
  }

  private ensureDirectories(): void {
    const dirs = [config.watchDir, path.dirname(config.dbPath), path.dirname(config.logFile)];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        Logger.info('Created directory', { path: dir });
      }
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Watcher Daemon Starting...\n');

    await this.ruleEngine.init();

    const llmAvailable = await this.llmClient.checkHealth();
    if (!llmAvailable) {
      Logger.warn('LLM unavailable at startup - rule compilation will be disabled');
      console.warn(`⚠️  LLM unavailable. Rule compilation will fail until Ollama is running.`);
      console.warn(`    Start Ollama and run: ollama pull ${config.ollamaModel}\n`);
    }

    this.fileWatcher.onEvent(async (event) => {
      try {
        const matches = await this.ruleEngine.evaluateEvent(event);
        matches.forEach((match) => {
          this.notifier.notifyMatch(match);
        });
      } catch (error) {
        Logger.error('Event processing failed', {
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

  private printStatus(ruleCount: number): void {
    console.log('✅ Daemon Running\n');
    console.log('Configuration:');
    console.log(`  📁 Watch Directory: ${config.watchDir}`);
    console.log(`  🧠 Rules Loaded: ${ruleCount}`);
    console.log(`  🔔 Notifications: ${config.notificationsEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`  🪵 Debounce: ${config.watchDebounceMs}ms`);
    if (config.apiEnabled) {
      console.log(`  📡 API: http://localhost:${config.apiPort}`);
    }
    console.log(`  📝 Logs: ${config.logFile}\n`);
    console.log('Press Ctrl+C to stop\n');
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: NodeJS.Signals) => {
      Logger.info('Shutdown signal received', { signal });
      console.log(`\n\n🛑 Shutting down gracefully...\n`);
      this.fileWatcher.stop();
      Logger.info('File watcher stopped');
      if (this.apiServer) {
        this.apiServer.stop();
      }
      this.ruleStore.close();
      Logger.info('Daemon stopped');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.notifier.notifyError(`Daemon crashed: ${error.message}`);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      Logger.error('Unhandled rejection', { reason });
      this.notifier.notifyError(`Unhandled promise rejection`);
    });
  }
}

const daemon = new WatcherDaemon();
daemon.start().catch((error) => {
  console.error('Failed to start daemon:', error);
  process.exit(1);
});
