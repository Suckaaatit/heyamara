import notifier from 'node-notifier';
import Logger from '../logger/Logger';
import { Notification } from './types';
import { RuleMatch } from '../rules/types';

export class Notifier {
  private enabled: boolean;
  private recentNotifications = new Map<string, number>();
  private dedupeWindow = 30000;
  private lastCleanup = Date.now();
  private cleanupInterval = 5 * 60 * 1000;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    Logger.debug('Notifier initialized', { enabled });
  }

  notifyMatch(match: RuleMatch): void {
    if (!this.enabled) {
      Logger.debug('Notifications disabled, skipping', { rule: match.ruleName });
      return;
    }

    const key = `${match.ruleId}:${match.path || 'all'}`;
    const now = Date.now();
    const lastNotified = this.recentNotifications.get(key);

    if (lastNotified && now - lastNotified < this.dedupeWindow) {
      Logger.debug('Notification suppressed (duplicate)', {
        key,
        lastNotified,
        suppressedFor: now - lastNotified,
      });
      return;
    }

    const notification: Notification = {
      title: `Rule Matched: ${match.ruleName}`,
      message: match.reason || match.summary,
      sound: true,
      wait: false,
    };

    this.send(notification);
    this.recentNotifications.set(key, now);
    this.conditionalCleanup(now);

    Logger.debug('Notification sent', {
      rule: match.ruleName,
      file: match.path,
      key,
    });
  }

  notifyError(error: string): void {
    if (!this.enabled) {
      Logger.debug('Error notification skipped (disabled)');
      return;
    }

    const notification: Notification = {
      title: 'Watcher Daemon Error',
      message: error,
      sound: true,
      wait: false,
    };

    this.send(notification);
    Logger.debug('Error notification sent', { error });
  }

  private send(notification: Notification): void {
    console.log('\n' + '='.repeat(60));
    console.log(`🔔 ${notification.title}`);
    console.log(notification.message);
    console.log('='.repeat(60) + '\n');

    try {
      notifier.notify({
        title: notification.title,
        message: notification.message,
        sound: notification.sound,
        wait: notification.wait,
      });
      Logger.debug('Desktop notification sent');
    } catch (error) {
      Logger.error('Desktop notification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private conditionalCleanup(now: number): void {
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanupOldEntries(now);
      this.lastCleanup = now;
    }
  }

  private cleanupOldEntries(now: number): void {
    const threshold = now - this.dedupeWindow * 2;
    let cleaned = 0;
    for (const [key, timestamp] of this.recentNotifications.entries()) {
      if (timestamp < threshold) {
        this.recentNotifications.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      Logger.debug('Cleaned up old notification entries', { count: cleaned });
    }
  }
}
