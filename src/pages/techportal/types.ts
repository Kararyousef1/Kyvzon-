/**
 * ════════════════════════════════════════════════════════════════
 *  TechPortal — أنواع البيانات الموحدة
 *  المصدر الوحيد لكل الأنواع المستخدمة في البوابة التقنية
 * ════════════════════════════════════════════════════════════════
 */

export type TechPage =
  | 'dashboard'
  | 'biometric'
  | 'sync-logs'
  | 'system-health'
  | 'attendance-analytics'
  | 'security-events'
  | 'settings';

// ─── أجهزة البصمة ────────────────────────────────────────────────
export interface BioDevice {
  id: string;
  name: string;
  device_type: string;
  ip_address: string;
  port: number;
  location: string;
  is_active: boolean;
  last_sync_at?: string | null;
  sync_interval_minutes: number;
  created_at: string;
  updated_at: string;
}

export type DeviceStatus = 'online' | 'offline' | 'testing' | 'error';

export interface DeviceWithStatus extends BioDevice {
  status: DeviceStatus;
  latency?: number;
}

// ─── سجلات المزامنة ──────────────────────────────────────────────
export interface SyncLog {
  id: string;
  device_id?: string;
  device_name: string;
  source: string;
  status: 'success' | 'failed' | 'partial';
  records_synced: number;
  error_message?: string;
  synced_at: string;
  details?: Record<string, unknown>;
}

export interface SyncStats {
  total: number;
  success: number;
  failed: number;
  partial: number;
  totalRecords: number;
  successRate: number;
}

// ─── صحة النظام ──────────────────────────────────────────────────
export type HealthStatus = 'pass' | 'warning' | 'fail';

export interface HealthCheck {
  key: string;
  label: string;
  description: string;
  status: HealthStatus;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
}

export interface ServiceStatus {
  name: string;
  nameAr: string;
  status: 'online' | 'degraded' | 'offline';
  latency: number;
  uptime: number;
  lastChecked: string;
}

// ─── الأحداث الأمنية ─────────────────────────────────────────────
export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  id: string;
  type: string;
  threat_level: ThreatLevel;
  user_id?: string | null;
  user_name?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  tenant_id?: string | null;
}

// ─── تحليلات الحضور ─────────────────────────────────────────────
export interface AttendanceHourly {
  hour: string;
  punches: number;
}

export interface DailyAttendance {
  date: string;
  total: number;
  present: number;
  late: number;
  absent: number;
}

// ─── الإعدادات ────────────────────────────────────────────────────
export interface TechSettings {
  auto_sync: string;
  sync_interval: string;
  late_threshold: string;
  grace_period: string;
  work_start: string;
  work_end: string;
  work_days: string;
  overtime_threshold: string;
  notify_on_failure: string;
  max_retry_attempts: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────
export interface PortalStats {
  devices: number;
  online: number;
  lastSync: string;
  punchesToday: number;
  syncFailures24h: number;
  securityAlerts: number;
  healthScore: number;
}