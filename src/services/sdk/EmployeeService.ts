/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeService - خدمة إدارة الموظفين (نسخة SDK جديدة)
 *  تستخدم BaseService مع حقن tenant_id تلقائياً
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';

export interface EmployeeInput {
  user_id?: string;
  employee_code?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  position?: string;
  role?: string;
  manager_id?: string;
  is_active?: boolean;
  avatar_url?: string;
}

export interface EmployeeRecord {
  id: string;
  user_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name_ar?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  position?: string;
  role: string;
  manager_id?: string;
  hire_date: string;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  departments?: { name: string };
}

class EmployeeService extends BaseService<EmployeeRecord> {
  constructor() {
    super('employees');
  }

  /**
   * إنشاء موظف جديد (مع حقن tenant_id تلقائياً)
   */
  async createEmployee(data: EmployeeInput): Promise<EmployeeRecord> {
    return this.create(data as unknown as Partial<EmployeeRecord>);
  }

  /**
   * جلب جميع الموظفين في الشركة الحالية
   */
  async findAllEmployees(options?: {
    departmentId?: string;
    isActive?: boolean;
    role?: string;
    search?: string;
  }): Promise<EmployeeRecord[]> {
    const filters: Record<string, unknown> = {};
    if (options?.departmentId) filters.department_id = options.departmentId;
    if (options?.isActive !== undefined) filters.is_active = options.isActive;
    if (options?.role) filters.role = options.role;

    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'first_name',
      ascending: true,
    });
  }

  /**
   * جلب موظف واحد
   */
  async findEmployeeById(id: string): Promise<EmployeeRecord | null> {
    return this.findById(id);
  }

  /**
   * تحديث بيانات موظف
   */
  async updateEmployee(id: string, data: Partial<EmployeeInput>): Promise<EmployeeRecord> {
    return this.update(id, data as unknown as Partial<EmployeeRecord>);
  }

  /**
   * حذف موظف
   */
  async deleteEmployee(id: string): Promise<boolean> {
    return this.delete(id);
  }

  /**
   * الحصول على إحصائيات سريعة
   */
  async getEmployeeStats(): Promise<{ total: number; active: number }> {
    const total = await this.count();
    const active = await this.count({ is_active: true });
    return { total, active };
  }
}

export const employeeService = new EmployeeService();