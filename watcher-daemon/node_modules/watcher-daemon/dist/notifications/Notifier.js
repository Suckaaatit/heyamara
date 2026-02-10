"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notifier = void 0;
const node_notifier_1 = __importDefault(require("node-notifier"));
const Logger_1 = __importDefault(require("../logger/Logger"));
class Notifier {
    enabled;
    recentNotifications = new Map();
    dedupeWindow = 30000;
    lastCleanup = Date.now();
    cleanupInterval = 5 * 60 * 1000;
    constructor(enabled) {
        this.enabled = enabled;
        Logger_1.default.debug('Notifier initialized', { enabled });
    }
    notifyMatch(match) {
        if (!this.enabled) {
            Logger_1.default.debug('Notifications disabled, skipping', { rule: match.ruleName });
            return;
        }
        const key = `${match.ruleId}:${match.path || 'all'}`;
        const now = Date.now();
        const lastNotified = this.recentNotifications.get(key);
        if (lastNotified && now - lastNotified < this.dedupeWindow) {
            Logger_1.default.debug('Notification suppressed (duplicate)', {
                key,
                lastNotified,
                suppressedFor: now - lastNotified,
            });
            return;
        }
        const notification = {
            title: `Rule Matched: ${match.ruleName}`,
            message: match.reason || match.summary,
            sound: true,
            wait: false,
        };
        this.send(notification);
        this.recentNotifications.set(key, now);
        this.conditionalCleanup(now);
        Logger_1.default.debug('Notification sent', {
            rule: match.ruleName,
            file: match.path,
            key,
        });
    }
    notifyError(error) {
        if (!this.enabled) {
            Logger_1.default.debug('Error notification skipped (disabled)');
            return;
        }
        const notification = {
            title: 'Watcher Daemon Error',
            message: error,
            sound: true,
            wait: false,
        };
        this.send(notification);
        Logger_1.default.debug('Error notification sent', { error });
    }
    send(notification) {
        console.log('\n' + '='.repeat(60));
        console.log(`🔔 ${notification.title}`);
        console.log(notification.message);
        console.log('='.repeat(60) + '\n');
        try {
            node_notifier_1.default.notify({
                title: notification.title,
                message: notification.message,
                sound: notification.sound,
                wait: notification.wait,
            });
            Logger_1.default.debug('Desktop notification sent');
        }
        catch (error) {
            Logger_1.default.error('Desktop notification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    conditionalCleanup(now) {
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.cleanupOldEntries(now);
            this.lastCleanup = now;
        }
    }
    cleanupOldEntries(now) {
        const threshold = now - this.dedupeWindow * 2;
        let cleaned = 0;
        for (const [key, timestamp] of this.recentNotifications.entries()) {
            if (timestamp < threshold) {
                this.recentNotifications.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            Logger_1.default.debug('Cleaned up old notification entries', { count: cleaned });
        }
    }
}
exports.Notifier = Notifier;
//# sourceMappingURL=Notifier.js.map