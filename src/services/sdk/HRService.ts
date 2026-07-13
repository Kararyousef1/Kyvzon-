/**
 * ════════════════════════════════════════════════════════════════
 *  HRService - خدمة الموارد البشرية (نسخة SDK جديدة)
 *  Domain: HR
 *  تشمل: disciplinary_actions, employee_documents
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { DisciplinaryActionRecord } from '../../shared/types/sdk';

// ─────────────────────────────────────────────────
//  Disciplinary Actions
// ─────────────────────────────────────────────────

class DisciplinaryActionService extends BaseService<DisciplinaryActionRecord> {
  constructor() {
    super('disciplinary_actions');
  }

  /**
   * جلب جميع الإجراءات التأديبية
   */
  async findAllActions(): Promise<any[]> {
    return this.findAll({
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /**
   * إنشاء إجراء تأديبي جديد
   */
  async createAction(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }
}

// ─────────────────────────────────────────────────
//  Employee Documents
// ─────────────────────────────────────────────────

class EmployeeDocumentService extends BaseService {
  constructor() {
    super('employee_documents');
  }

  /**
   * إنشاء مستند موظف جديد
   */
  async createDocument(data: Record<string, unknown>): Promise<any> {
    return this.create(data);
  }

  /**
   * حذف مستند
   */
  async deleteDocument(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

// ─────────────────────────────────────────────────
//  التصدير
// ─────────────────────────────────────────────────

export const disciplinaryActionService = new DisciplinaryActionService();
export const employeeDocumentService = new EmployeeDocumentService();