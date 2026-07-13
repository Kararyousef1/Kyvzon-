/**
 * ════════════════════════════════════════════════════════════════
 *  SettingsService - خدمة الإعدادات (نسخة SDK جديدة)
 *  مسؤولة عن: System Settings, Company Config, Localization
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { SettingsRecord } from '../../shared/types/sdk';

class SettingsService extends BaseService<SettingsRecord> {
  constructor() {
    super('system_settings');
  }

  /**
   * جلب إعدادات النظام للشركة الحالية
   */
  async findSystemSettings(): Promise<any | null> {
    const records = await this.findAll({ limit: 1 });
    return records.length > 0 ? records[0] : null;
  }

  /**
   * تحديث إعدادات النظام
   */
  async updateSystemSettings(id: string, data: Record<string, unknown>): Promise<any> {
    return this.update(id, data);
  }

  /**
   * تحديث إعدادات الورديات
   */
  async updateShiftTimings(shiftTimings: Record<string, unknown>): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', shift_timings: shiftTimings } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { shift_timings: shiftTimings } as unknown as Record<string, unknown>);
  }

  /**
   * تحديث إعدادات الإجازات
   */
  async updateLeaveDefaults(leaveDefaults: Record<string, unknown>): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', leave_defaults: leaveDefaults } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { leave_defaults: leaveDefaults } as unknown as Record<string, unknown>);
  }

  /**
   * تحديث إعدادات أيام العمل
   */
  async updateWorkWeekend(workWeekend: string[]): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', work_weekend: workWeekend } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { work_weekend: workWeekend } as unknown as Record<string, unknown>);
  }

  /**
   * جلب إعدادات الصفحة الرئيسية (landing_config)
   */
  async findLandingConfig(): Promise<any | null> {
    const current = await this.findSystemSettings();
    return current?.landing_config || null;
  }

  /**
   * تحديث إعدادات الصفحة الرئيسية (landing_config)
   */
  async updateLandingConfig(config: Record<string, unknown>): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', landing_config: config } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { landing_config: config } as unknown as Record<string, unknown>);
  }

  /**
   * جلب إعدادات AI
   */
  async findAiSettings(): Promise<any | null> {
    const current = await this.findSystemSettings();
    return current?.ai_settings || null;
  }

  /**
   * تحديث إعدادات AI
   */
  async updateAiSettings(aiSettings: Record<string, unknown>): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', ai_settings: aiSettings } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { ai_settings: aiSettings } as unknown as Record<string, unknown>);
  }

  /**
   * جلب الإعدادات العامة (general_settings JSON field)
   */
  async findGeneralSettings(): Promise<any | null> {
    const current = await this.findSystemSettings();
    return current?.general_settings || null;
  }

  /**
   * تحديث الإعدادات العامة (general_settings JSON field)
   */
  async updateGeneralSettings(settings: Record<string, unknown>): Promise<any> {
    const current = await this.findSystemSettings();
    if (!current) {
      return this.create({ id: 'singleton', general_settings: settings } as unknown as Record<string, unknown>);
    }
    return this.update(current.id, { general_settings: settings } as unknown as Record<string, unknown>);
  }
}

export const settingsService = new SettingsService();
