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

  /**
   * @deprecated ★★★ حذف نهائي — استعمل
   *   `trainingReportsService.setCourseStatus(id, 'archived')`.
   *
   *   `course_progress.course_id` عليه `ON DELETE CASCADE` (مُحقَّق):
   *     course_progress_course_id_fkey
   *       FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
   *   ⇒ حذف دورة يمحو **كل سجلّات تقدّم الموظفين** فيها بلا أثر ولا رجعة،
   *     وهو ما تمنعه قاعدة المشروع نصّاً.
   *
   *   أُبقيَ التوقيع لئلا تنكسر نداءات قائمة، ويرمي صراحةً بدل أن يمحو
   *   بصمت — الفشل المُعلَن أفضل من الضياع الصامت.
   */
  async deleteCourse(_id: string): Promise<boolean> {
    throw new Error(
      'الحذف النهائي للدورات ممنوع: يمحو سجلّات تقدّم الموظفين بـCASCADE. '
      + 'استعمل الأرشفة عبر trainingReportsService.setCourseStatus.',
    );
  }

  /**
   * @deprecated ★★★ يكتب عموداً غير موجود — استعمل `setCourseStatus`.
   *
   *   مُثبَت بالتشغيل:
   *     UPDATE courses SET active = false …
   *       ⇒ ERROR: column "active" of relation "courses" does not exist
   *
   *   العمود الموجود هو `status ∈ active·inactive·archived`.
   */
  async toggleActive(id: string, active: boolean): Promise<CourseRecord> {
    return this.update(id, {
      status: active ? 'active' : 'inactive',
    } as unknown as Partial<CourseRecord>);
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
