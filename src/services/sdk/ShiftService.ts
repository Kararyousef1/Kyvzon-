/**
 * ════════════════════════════════════════════════════════════════
 *  ShiftService - خدمة الورديات (نسخة SDK جديدة)
 *  Domain: Shift
 *  تشمل: shift_assignments
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { ShiftAssignmentRecord } from '../../shared/types/sdk';

class ShiftAssignmentService extends BaseService<ShiftAssignmentRecord> {
  constructor() { super('shift_assignments'); }
  async findAllAssignments(): Promise<any[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false });
  }
  async upsertAssignment(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

export const shiftAssignmentService = new ShiftAssignmentService();