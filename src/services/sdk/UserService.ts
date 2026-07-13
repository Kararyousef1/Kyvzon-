/**
 * ════════════════════════════════════════════════════════════════
 *  UserService - خدمة إدارة المستخدمين (نسخة SDK جديدة)
 *  مسؤولة عن: CRUD للمستخدمين, Profile, Roles, Permissions
 *  لا تحتوي أي منطق للمصادقة
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  rank?: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  profile_image?: string;
  manager_id?: string;
  supervisor_id?: string;
  status?: string;
  permissions?: string[];
  gatekeeper_type?: string;
  gatekeeper_pin?: string;
  salary?: number;
  salary_currency?: string;
  created_at?: string;
  updated_at?: string;
  tenant_id: string;
}

export interface UserUpdateInput {
  full_name?: string;
  email?: string;
  role?: string;
  rank?: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  profile_image?: string;
  manager_id?: string;
  supervisor_id?: string;
  status?: string;
  permissions?: string[];
  gatekeeper_type?: string;
  gatekeeper_pin?: string;
  salary?: number;
  salary_currency?: string;
  cv_data?: Record<string, unknown>;
}

class UserService extends BaseService {
  constructor() {
    super('profiles');
  }

  /**
   * جلب جميع المستخدمين في الشركة الحالية
   */
  async findAllUsers(options?: {
    role?: string;
    status?: string;
    department?: string;
  }): Promise<UserProfile[]> {
    const filters: Record<string, unknown> = {};
    if (options?.role) filters.role = options.role;
    if (options?.status) filters.status = options.status;
    if (options?.department) filters.department = options.department;

    return this.findAll({
      filters: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: 'full_name',
      ascending: true,
    }) as Promise<UserProfile[]>;
  }

  /**
   * جلب مستخدم واحد (بدون فلتر tenant_id لأن جدول profiles لا يحتوي على العمود)
   */
  async findUserById(id: string): Promise<UserProfile | null> {
    return this.findById(id, true) as Promise<UserProfile | null>;
  }

  /**
   * تحديث بيانات مستخدم
   */
  async updateUser(id: string, data: UserUpdateInput): Promise<UserProfile> {
    return this.update(id, data as unknown as Record<string, unknown>) as Promise<UserProfile>;
  }

  /**
   * جلب قائمة المديرين والمشرفين
   */
  async findManagers(): Promise<UserProfile[]> {
    return this.findAll({
      filters: { rank: 'manager' },
      orderBy: 'full_name',
      ascending: true,
    }) as Promise<UserProfile[]>;
  }

  /**
   * جلب قائمة الأدوار الفريدة
   */
  async findDistinctRoles(): Promise<string[]> {
    const users = await this.findAll() as UserProfile[];
    return [...new Set(users.map(u => u.role).filter(Boolean))];
  }

  /**
   * جلب قائمة الأقسام الفريدة
   */
  async findDistinctDepartments(): Promise<string[]> {
    const users = await this.findAll() as UserProfile[];
    return [...new Set(users.map(u => u.department).filter(Boolean))];
  }

  /**
   * عدد المستخدمين النشطين
   */
  async countActive(): Promise<number> {
    return this.count({ status: 'active' });
  }

  /**
   * عدد المستخدمين حسب الدور
   */
  async countByRole(role: string): Promise<number> {
    return this.count({ role });
  }
}

export const userService = new UserService();