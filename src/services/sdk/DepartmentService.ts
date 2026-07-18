/**
 * ════════════════════════════════════════════════════════════════
 *  DepartmentService - خدمة الأقسام
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { DepartmentRecord } from '../../shared/types/sdk';
import { supabase } from '../supabase/supabase';

class DepartmentService extends BaseService<DepartmentRecord> {
  constructor() { super('departments'); }

  async findActive(): Promise<DepartmentRecord[]> {
    try {
      const tenantId = localStorage.getItem('tenant_id');
      if (!tenantId) return [];

      // 1. جلب الأقسام الخاصة بالشركة
      let depts = await this.findAll({ filters: { is_active: true }, orderBy: 'name_ar', ascending: true });

      // 2. إذا لم يكن هناك أي أقسام للشركة، نقوم بنسخ الأقسام الافتراضية من structure_departments تلقائياً!
      if (depts.length === 0) {
        const { data: defaultDepts, error } = await supabase
          .from('structure_departments')
          .select('name_ar, name_en')
          .eq('is_active', true);

        if (!error && defaultDepts && defaultDepts.length > 0) {
          const payload = defaultDepts.map(d => ({
            tenant_id: tenantId,
            name_ar: d.name_ar,
            name_en: d.name_en,
            is_active: true
          }));

          const { data: inserted, error: insertError } = await supabase
            .from('departments')
            .insert(payload)
            .select();

          if (!insertError && inserted) {
            depts = inserted as unknown as DepartmentRecord[];
          }
        }
      }

      return depts;
    } catch (err) {
      console.warn('DepartmentService.findActive auto-seed failed:', err);
      return [];
    }
  }

  async findTree(): Promise<(DepartmentRecord & { children?: DepartmentRecord[] })[]> {
    const all = await this.findActive();
    const topLevel = all.filter(d => !d.parent_department_id);
    return topLevel.map(dept => ({
      ...dept,
      children: all.filter(d => d.parent_department_id === dept.id),
    }));
  }

  async findDepartmentsWithManager(): Promise<DepartmentRecord[]> {
    return this.findAll({ filters: { is_active: true, manager_id: undefined }, orderBy: 'name_ar', ascending: true });
  }
}

class SpecialtyService extends BaseService {
  constructor() { super('specialties'); }

  async findAllSpecialties(): Promise<any[]> {
    return this.findAll({ orderBy: 'name', ascending: true });
  }

  async createSpecialty(data: { name: string; name_en?: string; description?: string; department?: string; role_level?: string }): Promise<any> {
    return this.create(data as unknown as Record<string, unknown>);
  }

  async deleteSpecialty(id: string): Promise<boolean> {
    return this.delete(id);
  }
}

export const departmentService = new DepartmentService();
export const specialtyService = new SpecialtyService();
