/**
 * ════════════════════════════════════════════════════════════════
 *  AIService - خدمة الذكاء الاصطناعي (نسخة SDK جديدة)
 *  مسؤولة عن: AI Insights, Analytics, Recommendations
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { AiInsightRecord } from '../../shared/types/sdk';

class AIService extends BaseService<AiInsightRecord> {
  constructor() {
    super('ai_insights');
  }

  /**
   * جلب جميع تحليلات AI للشركة الحالية
   */
  async findAllInsights(): Promise<any[]> {
    return this.findAll({
      orderBy: 'generated_at',
      ascending: false,
    });
  }

  /**
   * جلب تحليلات لقسم معين
   */
  async findInsightsByDepartment(departmentId: string): Promise<any[]> {
    return this.findAll({
      filters: { department_id: departmentId, scope: 'department' },
      orderBy: 'generated_at',
      ascending: false,
    });
  }

  /**
   * جلب تحليلات لموظف معين
   */
  async findInsightsByEmployee(employeeId: string): Promise<any[]> {
    return this.findAll({
      filters: { employee_id: employeeId, scope: 'employee' },
      orderBy: 'generated_at',
      ascending: false,
    });
  }

  /**
   * إنشاء تحليل AI جديد
   */
  async createInsight(data: {
    insight_type: string;
    scope: string;
    department_id?: string;
    employee_id?: string;
    title: string;
    summary: string;
    data?: Record<string, unknown>;
    severity?: string;
    valid_until?: string;
  }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  /**
   * جلب آخر التحليلات
   */
  async findLatestInsights(limit: number = 10): Promise<any[]> {
    return this.findAll({
      orderBy: 'generated_at',
      ascending: false,
      limit,
    });
  }

  /**
   * جلب التحليلات العاجلة (Critical/Warning)
   */
  async findCriticalInsights(): Promise<any[]> {
    return this.findAll({
      filters: { severity: 'critical' },
      orderBy: 'generated_at',
      ascending: false,
    });
  }
}

export const aiService = new AIService();