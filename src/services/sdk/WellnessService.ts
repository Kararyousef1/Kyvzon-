/**
 * WellnessEntryService — المصدر الموحّد لبيانات العافية اليومية.
 *
 * مخطط wellness_entries الفعلي:
 * score · mood · stress · energy
 * لا توجد أعمدة mood_score/stress_level/energy_level.
 */

import { BaseService } from './BaseService';
import type { WellnessEntryRecord, WellnessMood } from '../../shared/types/sdk';

export interface WellnessEntryInput {
  score: number;
  mood: WellnessMood;
  stress: number;
  energy: number;
  notes?: string | null;
  date: string;
}

class WellnessEntryService extends BaseService<WellnessEntryRecord> {
  constructor() {
    super('wellness_entries');
  }

  async findAllEntries(limit = 100): Promise<WellnessEntryRecord[]> {
    return this.findAll({
      orderBy: 'date',
      ascending: false,
      limit: Math.max(1, Math.min(limit, 500)),
    });
  }

  async findByEmployee(
    employeeId: string,
    days?: number,
    limit = 90,
  ): Promise<WellnessEntryRecord[]> {
    const records = await this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'date',
      ascending: false,
      limit: Math.max(1, Math.min(limit, 365)),
    });
    if (!days) return records;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
    return records.filter((entry) => new Date(`${entry.date}T00:00:00`) >= cutoff);
  }

  /** @deprecated الاسم التاريخي؛ المعرّف المطلوب employees.id لا profiles.id. */
  async findByUser(employeeId: string, days?: number): Promise<WellnessEntryRecord[]> {
    return this.findByEmployee(employeeId, days);
  }

  async getStats(
    employeeId: string,
    days = 7,
  ): Promise<{ average: number; entries: number; trend: number[] }> {
    const entries = await this.findByEmployee(employeeId, days);
    const average = entries.length > 0
      ? Math.round(entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length)
      : 0;
    return {
      average,
      entries: entries.length,
      trend: entries.slice(0, 7).map((entry) => entry.score).reverse(),
    };
  }

  /**
   * إدخال واحد لكل موظف/يوم. إذا سبق التسجيل نحدّث الصف نفسه بدلاً
   * من الاصطدام بقيد unique_employee_date.
   */
  async saveEntry(employeeId: string, input: WellnessEntryInput): Promise<WellnessEntryRecord> {
    const payload = {
      employee_id: employeeId,
      score: Math.max(0, Math.min(100, Math.round(input.score))),
      mood: input.mood,
      stress: Math.max(0, Math.min(100, Math.round(input.stress))),
      energy: Math.max(0, Math.min(100, Math.round(input.energy))),
      notes: input.notes?.trim() || null,
      date: input.date,
    } satisfies Partial<WellnessEntryRecord>;

    const existing = await this.findAll({
      filters: { employee_id: employeeId, date: input.date },
      limit: 1,
    });
    if (existing.length > 0) return this.update(existing[0].id, payload);
    return this.create(payload);
  }
}

export const wellnessEntryService = new WellnessEntryService();
