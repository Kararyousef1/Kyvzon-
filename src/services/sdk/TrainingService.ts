/**
 * ════════════════════════════════════════════════════════════════
 *  TrainingService - خدمة المجال التدريبي
 *  Domain: Training — تشمل: courses, course_progress
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { CourseRecord, CourseProgressRecord } from '../../shared/types/sdk';

// ─── Courses ─────────────────────────────────

class CourseService extends BaseService<CourseRecord> {
  constructor() {
    super('courses');
  }

  async findAllCourses(): Promise<CourseRecord[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false });
  }

  async createCourse(data: Partial<CourseRecord>): Promise<CourseRecord> {
    return this.create(data);
  }

  async updateCourse(id: string, data: Partial<CourseRecord>): Promise<CourseRecord> {
    return this.update(id, data);
  }

  async deleteCourse(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async toggleActive(id: string, active: boolean): Promise<CourseRecord> {
    return this.update(id, { active } as unknown as Partial<CourseRecord>);
  }
}

// ─── Course Progress ─────────────────────────

class CourseProgressService extends BaseService<CourseProgressRecord> {
  constructor() {
    super('course_progress');
  }

  async findAllProgress(): Promise<CourseProgressRecord[]> {
    return this.findAll({ orderBy: 'created_at', ascending: false });
  }

  async findByEmployee(employeeId: string): Promise<CourseProgressRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'created_at', ascending: false });
  }
}

export const courseService = new CourseService();
export const courseProgressService = new CourseProgressService();
