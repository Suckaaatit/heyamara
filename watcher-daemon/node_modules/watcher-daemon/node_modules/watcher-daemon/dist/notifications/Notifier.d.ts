import { RuleMatch } from '../rules/types';
export declare class Notifier {
    private enabled;
    private recentNotifications;
    private dedupeWindow;
    private lastCleanup;
    private cleanupInterval;
    constructor(enabled: boolean);
    notifyMatch(match: RuleMatch): void;
    notifyError(error: string): void;
    private send;
    private conditionalCleanup;
    private cleanupOldEntries;
}
//# sourceMappingURL=Notifier.d.ts.map