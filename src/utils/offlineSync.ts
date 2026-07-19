/**
 * ════════════════════════════════════════════════════════════════
 *  Offline Sync Utility - طابور العمليات غير المتصلة بالإنترنت
 *  يخزن العمليات (مثل البلاغات أو الحضور) محلياً عند انقطاع الاتصال
 *  ويقوم بمزامنتها تلقائياً عند عودة الإنترنت.
 * ════════════════════════════════════════════════════════════════
 */

import { logger } from '../services/utils/logger';

export interface OfflineAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const OFFLINE_QUEUE_KEY = 'kyvzon_offline_queue_v1';

export const offlineSync = {
  getQueue(): OfflineAction[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  enqueue(type: string, payload: Record<string, unknown>): void {
    const queue = this.getQueue();
    const action: OfflineAction = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    queue.push(action);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    logger.info(`[OfflineSync] Enqueued offline action: ${type}`, { component: 'OfflineSync', action: 'enqueue' });
  },

  remove(id: string): void {
    const queue = this.getQueue().filter(a => a.id !== id);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  clear(): void {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  },

  async processQueue(syncHandler: (action: OfflineAction) => Promise<boolean>): Promise<number> {
    if (!navigator.onLine) return 0;
    const queue = this.getQueue();
    if (queue.length === 0) return 0;

    let syncedCount = 0;
    for (const action of queue) {
      try {
        const success = await syncHandler(action);
        if (success) {
          this.remove(action.id);
          syncedCount++;
        }
      } catch (err) {
        logger.error(`[OfflineSync] Failed to sync action ${action.id}:`, { error: err });
      }
    }
    return syncedCount;
  },

  initAutoSync(syncHandler: (action: OfflineAction) => Promise<boolean>): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      logger.info('[OfflineSync] Network online detected. Processing offline queue...', { component: 'OfflineSync', action: 'online' });
      this.processQueue(syncHandler);
    });
  }
};
