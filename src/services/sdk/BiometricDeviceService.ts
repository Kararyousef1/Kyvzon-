/**
 * ════════════════════════════════════════════════════════════════
 *  BiometricDeviceService - إدارة أجهزة البصمة (ZKTeco)
 *
 *  الجدول: biometric_devices — يحوي tenant_id + RLS
 *  المستخدم في: TechPortal.tsx
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';

export interface BiometricDeviceRecord {
  id: string;
  tenant_id: string;
  name: string;
  device_type: string;               // 'zkteco' | ...
  ip_address: string;
  port: number;
  location?: string | null;
  sync_interval_minutes: number;
  is_active: boolean;
  last_sync_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BiometricDeviceInput {
  name: string;
  ip_address: string;
  port?: number;
  location?: string;
  sync_interval_minutes?: number;
  device_type?: string;
  is_active?: boolean;
}

class BiometricDeviceService extends BaseService<BiometricDeviceRecord> {
  constructor() {
    super('biometric_devices');
  }

  /** جلب كل الأجهزة، مُرتَّبة بالاسم */
  async findAllDevices(): Promise<BiometricDeviceRecord[]> {
    return this.findAll({ orderBy: 'name', ascending: true });
  }

  /** إضافة جهاز جديد */
  async createDevice(data: BiometricDeviceInput): Promise<BiometricDeviceRecord> {
    return this.create({
      ...data,
      device_type: data.device_type ?? 'zkteco',
      port: data.port ?? 4370,
      sync_interval_minutes: data.sync_interval_minutes ?? 5,
      is_active: data.is_active ?? true,
    } as unknown as Partial<BiometricDeviceRecord>);
  }

  /** تبديل حالة جهاز (نشط/غير نشط) */
  async toggleActive(id: string, isActive: boolean): Promise<BiometricDeviceRecord> {
    return this.update(id, {
      is_active: isActive,
    } as unknown as Partial<BiometricDeviceRecord>);
  }

  /**
   * اختبار اتصال منطقي للجهاز.
   * ملاحظة: الاتصال الحقيقي يحتاج Edge Function داخل الشبكة/الـ VPN.
   * هنا نتحقق من وجود بيانات الجهاز ونحدث last_sync_at كتسجيل اختبار تشغيل.
   */
  async testConnection(id: string): Promise<{ ok: boolean; message: string; device?: BiometricDeviceRecord }> {
    try {
      const { data, error } = await import('../supabase/supabase').then(({ supabase }) =>
        supabase.functions.invoke('biometric-device-action', {
          body: { action: 'test_connection', device_id: id },
        }),
      );
      if (!error && data?.ok) {
        const device = await this.findById(id).catch(() => null);
        return { ok: true, message: data.message || 'تم اختبار الجهاز عبر Edge Function', device: device || undefined };
      }
    } catch {
      // fallback below
    }

    const device = await this.findById(id);
    if (!device) return { ok: false, message: 'الجهاز غير موجود' };
    if (!device.ip_address) return { ok: false, message: 'لا يوجد IP للجهاز', device };
    const updated = await this.update(id, { last_sync_at: new Date().toISOString() } as Partial<BiometricDeviceRecord>);
    return { ok: true, message: `تم تسجيل اختبار اتصال محلي للجهاز ${device.name}. الاتصال الحقيقي يحتاج Edge Function/Agent.`, device: updated };
  }

  async requestManualSync(deviceId?: string): Promise<{ ok: boolean; message: string }> {
    try {
      const { data, error } = await import('../supabase/supabase').then(({ supabase }) =>
        supabase.functions.invoke('biometric-device-action', {
          body: { action: 'manual_sync', device_id: deviceId },
        }),
      );
      if (!error && data?.ok) return { ok: true, message: data.message || 'تم تسجيل طلب المزامنة' };
    } catch {
      // fallback to local sync log can be handled by caller if needed
    }
    return { ok: false, message: 'تعذر استدعاء Edge Function للمزامنة اليدوية' };
  }

  /** حذف جهاز */
  async deleteDevice(id: string): Promise<boolean> {
    return this.delete(id);
  }

  /** إحصائيات: العدد الكلي + النشط + آخر مزامنة */
  async getStats(): Promise<{ total: number; online: number; lastSync: string }> {
    const devices = await this.findAllDevices();
    return {
      total: devices.length,
      online: devices.filter((d) => d.is_active).length,
      lastSync: devices.length > 0 ? (devices[0].last_sync_at || '—') : '—',
    };
  }
}

export const biometricDeviceService = new BiometricDeviceService();
