/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperVisitorService - خدمة زوار البوابة (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD لجدول gatekeeper_visitors
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { GatekeeperVisitorRecord } from '../../shared/types/sdk';

class GatekeeperVisitorService extends BaseService<GatekeeperVisitorRecord> {
  constructor() {
    super('gatekeeper_visitors');
  }

  /**
   * إنشاء زائر جديد
   */
  async createVisitor(data: {
    name: string;
    phone: string;
    company?: string;
    purpose?: string;
    notes?: string;
    location?: string;
  }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  /**
   * تحديث بيانات زائر
   */
  async updateVisitor(id: string, data: Record<string, unknown>): Promise<any> {
    return this.update(id, data);
  }
}

export const gatekeeperVisitorService = new GatekeeperVisitorService();