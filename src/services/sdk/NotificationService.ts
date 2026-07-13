/**
 * ════════════════════════════════════════════════════════════════
 *  NotificationService - خدمة الإشعارات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { NotificationRecord } from '../../shared/types/sdk';

class NotificationService extends BaseService<NotificationRecord> {
  constructor() { super('notifications'); }

  async findByUser(userId: string): Promise<NotificationRecord[]> {
    return this.findAll({ filters: { user_id: userId }, orderBy: 'created_at', ascending: false });
  }

  async findUnread(userId: string): Promise<NotificationRecord[]> {
    return this.findAll({ filters: { user_id: userId, is_read: false }, orderBy: 'created_at', ascending: false });
  }

  async countUnread(userId: string): Promise<number> {
    return this.count({ user_id: userId, is_read: false });
  }

  async markAsRead(id: string): Promise<NotificationRecord> {
    return this.update(id, { is_read: true } as unknown as Partial<NotificationRecord>);
  }

  async markAllAsRead(userId: string): Promise<void> {
    const unread = await this.findUnread(userId);
    await Promise.all(unread.map(n => this.markAsRead(n.id)));
  }

  async createNotification(data: {
    user_id: string; type: string; title: string; message: string;
  }): Promise<NotificationRecord> {
    return this.create(data as unknown as Partial<NotificationRecord>);
  }
}

export const notificationService = new NotificationService();
