/**
 * ════════════════════════════════════════════════════════════════
 *  IncidentService - خدمة إدارة البلاغات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { IncidentRecord } from '../../shared/types/sdk';

class IncidentService extends BaseService<IncidentRecord> {
  constructor() {
    super('incidents');
  }

  /** جلب بلاغات موظف معين */
  async findByEmployee(employeeId: string): Promise<IncidentRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** جلب البلاغات المعلقة */
  async findPending(): Promise<IncidentRecord[]> {
    return this.findAll({
      filters: { status: 'pending' },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** إنشاء بلاغ جديد */
  async createIncident(data: {
    title: string;
    description: string;
    category?: string;
    severity?: string;
    employee_id?: string;
    is_anonymous?: boolean;
  }): Promise<IncidentRecord> {
    return this.create(data as unknown as Partial<IncidentRecord>);
  }

  /** تحديث حالة بلاغ */
  async updateStatus(id: string, status: string): Promise<IncidentRecord> {
    const updateData: Record<string, unknown> = { status };
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }
    return this.update(id, updateData as unknown as Partial<IncidentRecord>);
  }

  /** إحصائيات سريعة */
  async getStats(): Promise<{ total: number; pending: number; resolved: number }> {
    const total = await this.count();
    const pending = await this.count({ status: 'pending' });
    const resolved = await this.count({ status: 'resolved' });
    return { total, pending, resolved };
  }
}

export const incidentService = new IncidentService();
