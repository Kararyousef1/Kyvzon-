/**
 * ════════════════════════════════════════════════════════════════
 *  أنواع بيانات نظام البوابة - Kyvzon Platform
 *  جميع الواجهات المطلوبة لصفحات البوابة والحراسة
 * ════════════════════════════════════════════════════════════════
 */

// ═══════════════ جلسة الحارس ═══════════════

export interface GatekeeperSession {
  id: string;
  session_name: string;
  shift_type: 'morning' | 'evening' | 'night';
  gatekeeper_name: string;
  pin_code: string;
  temp_pin?: string | null;
  expected_end_time?: string | null;
  is_active: boolean;
  handover_status?: 'pending' | 'approved' | 'pending_end' | 'approved_end' | 'completed' | null;
  visitor_count: number;
  started_at: string;
  ended_at?: string | null;
  created_by?: string | null;
}

// ═══════════════ الزوار ═══════════════

export interface GatekeeperVisitor {
  id: string;
  name: string;
  phone: string;
  company?: string | null;
  purpose?: string | null;
  notes?: string | null;
  location?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GatekeeperVisitorLog {
  id: string;
  session_id: string;
  visitor_id: string;
  badge_number?: string | null;
  check_in_time: string;
  check_out_time?: string | null;
  status: 'checked_in' | 'checked_out';
  visitor?: GatekeeperVisitor | null;
}

export interface VisitorFormData {
  name: string;
  phone: string;
  company: string;
  purpose: string;
  notes: string;
  location: string;
}

// ═══════════════ حركة الموظفين ═══════════════

export interface MovementLog {
  id: string;
  employee_id?: string | null;
  employee_name: string;
  department: string;
  destination: string;
  departure_at: string;
  returned_at?: string | null;
  notes?: string | null;
  logged_by_id?: string | null;
}

// ═══════════════ استراحات الموظفين ═══════════════

export interface EmployeeBreak {
  id: string;
  employee_id: string;
  supervisor_name: string;
  destination: string;
  duration_minutes: number;
  status: 'approved' | 'out' | 'completed' | 'pending';
  out_time?: string | null;
  return_time?: string | null;
  created_at: string;
  employee?: {
    full_name: string;
    department: string;
  } | null;
}

// ═══════════════ مراجعات العملاء ═══════════════

export interface CustomerReview {
  id: string;
  customer_name: string;
  customer_email?: string | null;
  product_name: string;
  rating: number; // 1-5 نجوم
  review_text?: string | null;
  created_at: string;
}

// ═══════════════ أنواع مساعدة ═══════════════

export type ShiftType = 'morning' | 'evening' | 'night';
export type MovementStatus = 'out' | 'returned';
export type BreakStatus = 'approved' | 'out' | 'completed' | 'pending';
export type HandoverStatus = 'pending' | 'approved' | 'pending_end' | 'approved_end' | 'completed';

// ═══════════════ نماذج النظام ═══════════════

export interface MovementFormData {
  employee_id: string;
  employee_name: string;
  department: string;
  customDepartment: string;
  destination: string;
  customDestination: string;
  notes: string;
}

export interface ArrivalFormData {
  actual_location: string;
  notes?: string;
}

// ═══════════════ إعدادات الوردية ═══════════════

export interface ShiftSettings {
  morning: {
    start: string;    // "08:00"
    end: string;      // "16:00"
    valid_hours: number[]; // [8,9,10,11,12,13,14,15]
  };
  evening: {
    start: string;    // "16:00"
    end: string;      // "00:00"
    valid_hours: number[]; // [16,17,18,19,20,21,22,23]
  };
  night: {
    start: string;    // "00:00"
    end: string;      // "08:00"
    valid_hours: number[]; // [0,1,2,3,4,5,6,7]
  };
}

// ═══════════════ إحصائيات البوابة ═══════════════

export interface GatekeeperStats {
  total_sessions: number;
  active_sessions: number;
  total_visitors_today: number;
  total_movements_today: number;
  pending_handovers: number;
  violations_detected: number;
}

// ═══════════════ تقارير الأرشيف ═══════════════

export interface ArchiveSession {
  session: GatekeeperSession;
  visitors: GatekeeperVisitorLog[];
  movements: MovementLog[];
  duration_hours: number;
  total_events: number;
}