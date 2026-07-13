/**
 * ════════════════════════════════════════════════════════════════
 *  WellnessService - خدمة الصحة النفسية
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { WellnessEntryRecord } from '../../shared/types/sdk';

class WellnessService extends BaseService<WellnessEntryRecord> {
  constructor() { super('wellness_entries'); }

  async findByEmployee(employeeId: string): Promise<WellnessEntryRecord[]> {
    return this.findAll({ filters: { employee_id: employeeId }, orderBy: 'date', ascending: false });
  }

  async findRecent(employeeId: string, days: number = 7): Promise<WellnessEntryRecord[]> {
    const all = await this.findByEmployee(employeeId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return all.filter(e => new Date(e.date) >= cutoff);
  }

  async createEntry(data: {
    employee_id: string; mood_score?: number; stress_level?: number;
    energy_level?: number; notes?: string; date: string;
  }): Promise<WellnessEntryRecord> {
    return this.create(data as unknown as Partial<WellnessEntryRecord>);
  }

  async getAverageScore(employeeId: string, days: number = 30): Promise<number> {
    const entries = await this.findRecent(employeeId, days);
    if (entries.length === 0) return 0;
    return Math.round(entries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / entries.length);
  }
}

class WellnessEntryService extends BaseService<WellnessEntryRecord> {
  constructor() { super('wellness_entries'); }

  async findAllEntries(): Promise<WellnessEntryRecord[]> {
    return this.findAll({ orderBy: 'date', ascending: false });
  }

  /** @deprecated استخدم findByEmployee */
  async findByUser(userId: string, days?: number): Promise<WellnessEntryRecord[]> {
    const records = await this.findAll({ filters: { employee_id: userId }, orderBy: 'date', ascending: false });
    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return records.filter(e => new Date(e.date) >= cutoff);
    }
    return records;
  }

  /** إحصائيات سريعة للصحة النفسية */
  async getStats(userId: string, days: number = 7): Promise<{ average: number; entries: number; trend: number[] }> {
    const entries = await this.findByUser(userId, days);
    const avg = entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + (e.mood_score || 0), 0) / entries.length)
      : 0;
    const trend = entries.slice(0, 7).map(e => e.mood_score || 0).reverse();
    return { average: avg, entries: entries.length, trend };
  }

  /** حفظ أو تحديث إدخال صحي */
  async saveEntry(userId: string, data: {
    mood_score?: number; stress_level?: number;
    energy_level?: number; notes?: string; date: string;
  }): Promise<WellnessEntryRecord> {
    return this.create({
      employee_id: userId,
      ...data,
    } as unknown as Partial<WellnessEntryRecord>);
  }
}

export const wellnessService = new WellnessService();
export const wellnessEntryService = new WellnessEntryService();
