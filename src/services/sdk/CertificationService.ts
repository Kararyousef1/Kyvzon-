/**
 * ════════════════════════════════════════════════════════════════
 *  CertificationService - خدمة الشهادات والمؤهلات (نسخة SDK جديدة)
 *  مسؤولة عن: Employee Certifications
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { EmployeeCertificationRecord } from '../../shared/types/sdk';

class CertificationService extends BaseService<EmployeeCertificationRecord> {
  constructor() {
    super('employee_certifications');
  }

  /**
   * جلب جميع الشهادات
   */
  async findAllCertifications(): Promise<any[]> {
    return this.findAll({
      orderBy: 'issue_date',
      ascending: false,
    });
  }

  /**
   * جلب شهادات موظف معين
   */
  async findByEmployee(employeeId: string): Promise<any[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'issue_date',
      ascending: false,
    });
  }
}

export const certificationService = new CertificationService();