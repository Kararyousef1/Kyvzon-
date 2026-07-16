/**
 * ════════════════════════════════════════════════════════════════
 *  أنواع API المشتركة - Common API Types
 * ════════════════════════════════════════════════════════════════
 *  هذا الملف يحل محل استخدام `any` في استعلامات Supabase
 *  ويوفر Types صارمة لجميع العمليات في النظام.
 * ════════════════════════════════════════════════════════════════
 */

import type { User, UserRole } from './index';

// ═══════════════════════════════════════════════
// 1. أنواع النتائج (Result Types)
// ═══════════════════════════════════════════════

/** نتيجة استعلام Supabase مع معالجة الأخطاء */
export interface QueryResult<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

/** نتيجة عملية Insert/Update/Delete */
export interface MutationResult<T = void> {
  data: T | null;
  error: string | null;
  success: boolean;
}

/** نتيجة Pagination */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════
// 2. أنواع جداول قاعدة البيانات
// ═══════════════════════════════════════════════

/** جدول profiles - الأعمدة الفعلية في DB */
export interface ProfileDB {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  rank: string | null;
  department: string | null;
  manufacturing_dept: string | null;
  phone: string | null;
  location: string | null;
  passcode: string | null;
  profile_image: string | null;
  certificate_image: string | null;
  manager_id: string | null;
  custom_permissions: Record<string, boolean> | null;
  permissions: string[] | null;
  status: 'active' | 'inactive' | 'on_leave';
  position: string | null;
  shift: string | null;
  wellness_score: number | null;
  cv_data: CvData | null;
  gatekeeper_type: 'employee_movement' | 'visitor_movement' | 'both' | null;
  gatekeeper_pin: string | null;
  can_manage_breaks: boolean | null;
  created_at: string;
  updated_at: string;
}

/** بنية السيرة الذاتية المحفوظة في JSONB */
export interface CvData {
  template?: 'modern' | 'classic' | 'minimal';
  summary?: string;
  age?: string;
  experience?: CvExperience[];
  education?: CvEducation[];
  skills?: CvSkill[];
  languages?: CvLanguage[];
  hobbies?: string[];
}

export interface CvExperience {
  company: string;
  role: string;
  period: string;
  desc: string;
}

export interface CvEducation {
  degree: string;
  institution: string;
  period: string;
}

export interface CvSkill {
  name: string;
  level: 'مبتدئ' | 'متوسط' | 'متقدم' | 'خبير';
}

export interface CvLanguage {
  name: string;
  level: 'مبتدئ' | 'جيد' | 'ممتاز' | 'اللغة الأم';
}

/** جدول incidents */
export interface IncidentDB {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  is_anonymous: boolean;
  reported_by: string | null;
  assigned_to: string | null;
  ai_analysis: Record<string, unknown> | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** جدول movements_log */
export interface MovementLogDB {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  department: string | null;
  logged_by_id: string | null;
  destination: string;
  departure_at: string;
  returned_at: string | null;
  notes: string | null;
  created_at: string;
}

/** جدول time_logs */
export interface TimeLogDB {
  id: string;
  employee_id: string;
  log_type: 'check_in' | 'check_out' | 'break_start' | 'break_end';
  timestamp: string;
  kiosk_id: string | null;
  notes: string | null;
}

/** جدول hr_messages */
export interface HrMessageDB {
  id: string;
  employee_id: string;
  subject: string;
  message: string;
  priority: string;
  status: 'new' | 'read' | 'replied';
  created_at: string;
  replied_at: string | null;
}

/** جدول audit_logs */
export interface AuditLogDB {
  id: string;
  action: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  target: string | null;
  details: string | null;
  ip_address: string | null;
  timestamp: string;
}

/** جدول leave_requests */
export interface LeaveRequestDB {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_position: string | null;
  employee_department: string | null;
  leave_type: 'سنوية' | 'مرضية' | 'طارئة' | 'زمنية' | 'استقالة' | 'غير مدفوعة';
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  supervisor_id: string | null;
  supervisor_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** جدول employee_breaks */
export interface EmployeeBreakDB {
  id: string;
  tenant_id: string;
  employee_id: string;
  break_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: 'active' | 'pending' | 'approved' | 'rejected' | 'out' | 'completed' | string;
  supervisor_id: string | null;
  supervisor_name: string | null;
  employee_name: string | null;
  destination: string | null;
  duration_minutes: number;
  out_time: string | null;
  return_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** جدول wellness_entries */
export interface WellnessEntryDB {
  id: string;
  employee_id: string;
  date: string;
  score: number;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible';
  stress: number;
  energy: number;
  notes: string | null;
  created_at: string;
}

/** جدول survey_responses */
export interface SurveyResponseDB {
  id: string;
  survey_id: string;
  employee_id: string;
  answers: Record<string, unknown>;
  created_at: string;
}

/** جدول gatekeeper_sessions */
export interface GatekeeperSessionDB {
  id: string;
  session_name: string;
  shift_type: 'morning' | 'evening' | 'night';
  gatekeeper_name: string;
  pin_code: string;
  expected_end_time: string;
  is_active: boolean;
  ended_at: string | null;
  handover_status: 'active' | 'pending' | 'pending_end' | 'completed' | null;
  temp_pin: string | null;
  created_by: string | null;
  started_at: string;
}

/** جدول gatekeeper_visitors */
export interface GatekeeperVisitorDB {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  purpose: string | null;
  notes: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

/** جدول gatekeeper_visitor_logs */
export interface GatekeeperVisitorLogDB {
  id: string;
  session_id: string;
  visitor_id: string;
  badge_number: string;
  check_in_time: string;
  check_out_time: string | null;
  status: 'checked_in' | 'checked_out';
}

// ═══════════════════════════════════════════════
// 3. Input Types (Create/Update Operations)
// ═══════════════════════════════════════════════

/** مدخلات إنشاء ملف تعريف جديد */
export type CreateProfileInput = Omit<
  ProfileDB,
  'id' | 'created_at' | 'updated_at'
>;

/** مدخلات تحديث ملف تعريف (كل الحقول اختيارية) */
export type UpdateProfileInput = Partial<
  Omit<ProfileDB, 'id' | 'created_at' | 'updated_at'>
>;

/** مدخلات إنشاء طلب إجازة */
export type CreateLeaveRequestInput = Omit<
  LeaveRequestDB,
  'id' | 'created_at' | 'updated_at' | 'reviewed_at' | 'review_notes' | 'status'
> & {
  status?: LeaveRequestDB['status'];
};

/** مدخلات إنشاء بلاغ */
export type CreateIncidentInput = Omit<
  IncidentDB,
  'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'ai_analysis'
> & {
  ai_analysis?: IncidentDB['ai_analysis'];
};

/** مدخلات تسجيل حركة موظف */
export type CreateMovementLogInput = Omit<
  MovementLogDB,
  'id' | 'created_at' | 'departure_at' | 'returned_at'
> & {
  departure_at?: string;
  returned_at?: string;
};

/** مدخلات إضافة سجل حضور */
export type CreateTimeLogInput = Omit<
  TimeLogDB,
  'id' | 'timestamp'
> & {
  timestamp?: string;
};

// ═══════════════════════════════════════════════
// 4. Query/Filter Types
// ═══════════════════════════════════════════════

/** خيارات الاستعلام المشتركة */
export interface QueryOptions {
  page?: number;
  perPage?: number;
  orderBy?: string;
  ascending?: boolean;
}

/** فلاتر المستخدمين */
export interface ProfileFilters {
  role?: UserRole | UserRole[];
  status?: ProfileDB['status'] | ProfileDB['status'][];
  department?: string;
  search?: string;
}

/** فلاتر البلاغات */
export interface IncidentFilters {
  status?: IncidentDB['status'] | IncidentDB['status'][];
  severity?: IncidentDB['severity'] | IncidentDB['severity'][];
  category?: string;
  reportedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/** فلاتر طلبات الإجازة */
export interface LeaveRequestFilters {
  status?: LeaveRequestDB['status'] | LeaveRequestDB['status'][];
  leaveType?: LeaveRequestDB['leave_type'];
  employeeId?: string;
  supervisorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ═══════════════════════════════════════════════
// 5. Realtime Event Types
// ═══════════════════════════════════════════════

/** حدث تغيير في Realtime */
export interface RealtimeChangePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T | null;
  schema: string;
  table: string;
  commit_timestamp: string;
}

/** معالج أحداث Realtime */
export type RealtimeHandler<T> = (payload: RealtimeChangePayload<T>) => void;

// ═══════════════════════════════════════════════
// 6. Type Guards (حماية وقت التشغيل)
// ═══════════════════════════════════════════════

/** يتحقق أن القيمة هي User صحيح */
export function isValidUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.full_name === 'string';
}

/** يتحقق أن القيمة هي Profile DB صحيح */
export function isValidProfile(value: unknown): value is ProfileDB {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.email === 'string';
}

/** يتحقق أن المصفوفة ليست فارغة */
export function isNonEmptyArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/** يستخدم لتحويل unknown بأمان */
export function safeGet<T>(obj: unknown, key: string, fallback: T): T {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key] as T ?? fallback;
  }
  return fallback;
}
