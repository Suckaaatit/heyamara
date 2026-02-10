export interface Config {
    watchDir: string;
    dbPath: string;
    logFile: string;
    ollamaHost: string;
    ollamaModel: string;
    apiEnabled: boolean;
    apiPort: number;
    notificationsEnabled: boolean;
    logLevel: string;
    watchDebounceMs: number;
    matchHistoryLimit: number;
}
export declare const config: Config;
export default config;
//# sourceMappingURL=config.d.ts.map