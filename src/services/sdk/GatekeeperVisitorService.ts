/**
 * ════════════════════════════════════════════════════════════════
 *  GatekeeperVisitorService - خدمة زوار البوابة (نسخة مُصلحة)
 *  الجدول: gatekeeper_visitors — بدون عمود tenant_id
 *
 *  ✅ إصلاح: يرث من NoTenantBaseService لتجاوز tenant filter
 *            الذي كان يسبب إرجاع صفر نتائج من الجدول
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { GatekeeperVisitorRecord } from '../../shared/types/sdk';

// جدول gatekeeper_visitors بدون tenant_id — نتجاوز الفلتر
class GatekeeperVisitorService extends BaseService<GatekeeperVisitorRecord> {
  constructor() {
    super('gatekeeper_visitors');
  }

  /** تجاوز tenant filter — هذا الجدول لا يملك tenant_id */
  protected override addTenantFilter(query: any, _skip?: boolean): any {
    return query;
  }

  /** لا نحقن tenant_id في INSERT */
  protected override injectTenantId(data: Partial<GatekeeperVisitorRecord>): Record<string, unknown> {
    const { tenant_id: _, ...cleanData } = data as Record<string, unknown>;
    return cleanData;
  }

  async createVisitor(data: {
    name: string;
    phone: string;
    company?: string;
    purpose?: string;
    notes?: string;
    location?: string;
  }): Promise<GatekeeperVisitorRecord> {
    return this.create(data as unknown as Partial<GatekeeperVisitorRecord>);
  }

  async updateVisitor(
    id: string,
    data: Record<string, unknown>,
  ): Promise<GatekeeperVisitorRecord> {
    return this.update(id, data as unknown as Partial<GatekeeperVisitorRecord>);
  }

  async searchByPhone(phone: string): Promise<GatekeeperVisitorRecord[]> {
    return this.findAll({ filters: { phone } });
  }
}

export const gatekeeperVisitorService = new GatekeeperVisitorService();
