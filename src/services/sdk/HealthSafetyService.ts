/**
 * ════════════════════════════════════════════════════════════════
 *  HealthSafetyService - إجراءات السلامة والصحة المهنية (CAPA)
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { CorrectiveActionRecord } from '../../shared/types/sdk';

class CorrectiveActionService extends BaseService<CorrectiveActionRecord> {
  constructor() { super('corrective_actions'); }

  async findByIncident(incidentId: string): Promise<CorrectiveActionRecord[]> {
    return this.findAll({ filters: { incident_id: incidentId }, orderBy: 'due_date', ascending: true });
  }

  async createAction(data: Partial<CorrectiveActionRecord>): Promise<CorrectiveActionRecord> {
    return this.create({ ...data, status: data.status || 'open', priority: data.priority || 'medium' });
  }

  async completeAction(id: string, completedBy?: string): Promise<CorrectiveActionRecord> {
    return this.update(id, {
      status: 'completed',
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Partial<CorrectiveActionRecord>);
  }
}

export const correctiveActionService = new CorrectiveActionService();
