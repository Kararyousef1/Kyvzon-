// شاملة لعميل Supabase
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      departments: { Row: Department; Insert: Partial<Department>; Update: Partial<Department> };
      problems: { Row: Problem; Insert: Partial<Problem>; Update: Partial<Problem> };
      incidents: { Row: Problem; Insert: Partial<Problem>; Update: Partial<Problem> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      wellness_entries: { Row: WellnessEntry; Insert: Partial<WellnessEntry>; Update: Partial<WellnessEntry> };
      attendance_logs: { Row: AttendanceRecord; Insert: Partial<AttendanceRecord>; Update: Partial<AttendanceRecord> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> };
      // ─── الجداول الجديدة (الرواتب + الوحدات الإضافية) ───
      payroll_periods: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      payroll_records: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      payroll_allowances: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      payroll_deductions: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      employee_loans: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      loan_repayments: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      bonuses: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      payroll_settings: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      performance_cycles: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      performance_reviews: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      performance_goals: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      disciplinary_actions: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      employee_documents: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      expense_requests: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      shift_schedules: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      shift_assignments: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      shift_swap_requests: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      job_postings: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      job_applications: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      onboarding_tasks: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      employee_onboarding: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      offboarding_records: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
      employee_contracts: { Row: Record<string, any>; Insert: Record<string, any>; Update: Record<string, any> };
    };
  };
}

export type UserRole = 'employee' | 'hr' | 'admin'

export type ProblemStatus = 
  | 'open' 
  | 'in_progress' 
  | 'resolved' 
  | 'closed'

export type ProblemSeverity = 
  | 'low' 
  | 'medium' 
  | 'high' 
  | 'critical'

export type SentimentType = 
  | 'very_positive'
  | 'positive' 
  | 'neutral' 
  | 'negative' 
  | 'very_negative'

// ======= جداول قاعدة البيانات =======

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  department: string | null
  position: string | null
  employee_id: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  can_manage_breaks?: boolean
  kayan_id: string | null
  fingerprint_id: string | null
  created_at: string
  updated_at: string
  // أعمدة مُضافة للتوافق مع AdminEmployeesPage
  rank?: string
  manufacturing_dept?: string
  permissions?: string[]
  shift?: string
  gatekeeper_type?: string
  gatekeeper_pin?: string
  status?: string
  manager_id?: string | null
  supervisor_id?: string | null
  department_manager_id?: string | null
  location?: string
  profile_image?: string
}

export interface Department {
  id: string
  name: string
  name_en: string | null
  manager_id: string | null
  parent_id: string | null
  is_active: boolean
  created_at: string
}

export interface Problem {
  id: string
  title: string
  description: string
  status: ProblemStatus
  severity: ProblemSeverity
  category: string
  is_anonymous: boolean
  employee_id: string | null
  assigned_to: string | null
  department_id: string | null
  ai_analysis: string | null
  ai_sentiment: SentimentType | null
  ai_summary: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // Relations
  employee?: Profile
  assignee?: Profile
  department?: Department
  comments?: ProblemComment[]
}

export interface ProblemComment {
  id: string
  problem_id: string
  author_id: string
  content: string
  is_internal: boolean
  created_at: string
  // Relations
  author?: Profile
}

export interface Survey {
  id: string
  title: string
  description: string | null
  questions: SurveyQuestion[]
  is_active: boolean
  is_anonymous: boolean
  target_department: string | null
  created_by: string
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export interface SurveyQuestion {
  id: string
  text: string
  type: 'rating' | 'text' | 'multiple_choice' | 'yes_no'
  options?: string[]
  required: boolean
}

export interface SurveyResponse {
  id: string
  survey_id: string
  employee_id: string | null
  answers: Record<string, any>
  sentiment: SentimentType | null
  submitted_at: string
}

export interface WellnessEntry {
  id: string
  employee_id: string
  date: string
  score: number
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible'
  stress: number
  energy: number
  notes: string | null
  created_at: string
  tenant_id: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'danger'
  is_read: boolean
  link: string | null
  created_at: string
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  check_in: string | null
  check_out: string | null
  status: 'present' | 'absent' | 'late' | 'leave'
  source: 'fingerprint' | 'manual' | 'kayan'
  notes: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
  ip_address: string | null
  created_at: string
}

// ======= API Response Types =======

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
  total_pages: number
}

// ======= تكاملات خارجية =======

export interface KayanEmployee {
  id: string
  name: string
  email: string
  department: string
  position: string
  employee_number: string
  hire_date: string
  status: 'active' | 'inactive'
}

export interface FingerprintRecord {
  employee_id: string
  timestamp: string
  device_id: string
  type: 'check_in' | 'check_out'
}