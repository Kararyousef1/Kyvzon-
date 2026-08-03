/**
 * ════════════════════════════════════════════════════════════════
 *  SDK Record Types - تعريفات الأنواع الموحدة لطبقة الخدمات
 *  ⚠️ هذا هو المصدر الوحيد لأنواع السجلات في جميع خدمات SDK
 *  المستوى: SYSTEM (لا يمسّه إلا مهندس النظم)
 * ════════════════════════════════════════════════════════════════
 *
 *  تم استخراجها من database/schema.sql وملفات الترحيل
 *  كل interface يمثل Row type في Supabase Table
 */

// ═══════════════════════════════════════════════
//  Core / HR
// ═══════════════════════════════════════════════

export interface EmployeeRecord {
  id: string;
  user_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name_ar?: string;
  email?: string;
  phone?: string;
  department_id?: string;
  position?: string;
  role: string;
  manager_id?: string;
  hire_date: string;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  departments?: { name: string };
}

export interface UserProfileRecord {
  id: string;
  full_name: string;
  email: string;
  role: string;
  rank?: string;
  department?: string;
  position?: string;
  phone?: string;
  location?: string;
  profile_image?: string;
  manager_id?: string;
  supervisor_id?: string;
  status?: string;
  permissions?: string[];
  gatekeeper_type?: string;
  gatekeeper_pin?: string;
  salary?: number;
  salary_currency?: string;
  created_at?: string;
  updated_at?: string;
  tenant_id: string;
}

export interface DepartmentRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  manager_id?: string;
  supervisor_id?: string;
  direct_manager_id?: string;
  parent_department_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Attendance
// ═══════════════════════════════════════════════

export interface AttendanceLogRecord {
  id: string;
  employee_id: string;
  punch_time: string;
  punch_type?: string;
  shift_type?: string;
  shift_date: string;
  device_id?: string;
  verification_type?: string;
  raw_data?: unknown;
  source?: string;
  created_at: string;
  tenant_id: string;
}

export interface AttendanceSummaryRecord {
  id: string;
  employee_id: string;
  shift_date: string;
  shift_type?: string;
  check_in?: string;
  check_out?: string;
  total_hours?: number;
  late_minutes?: number;
  early_leave_minutes?: number;
  overtime_minutes?: number;
  status: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Incidents / Problems
// ═══════════════════════════════════════════════

export interface IncidentRecord {
  id: string;
  title: string;
  description: string;
  status: string;
  severity?: string;
  category?: string;
  employee_id?: string;
  is_anonymous?: boolean;
  assigned_to?: string;
  department_id?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  reporter?: UserProfileRecord;
  reported_by?: string;
}

export interface IncidentCommentRecord {
  id: string;
  incident_id: string;
  author_id: string;
  content: string;
  is_internal?: boolean;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Permissions (إذنيات/زمنيات)
// ═══════════════════════════════════════════════

export interface PermissionRecord {
  id: string;
  employee_id: string;
  date: string;
  permission_type: string;
  expected_out_time: string;
  expected_return_time?: string;
  actual_out_time?: string;
  actual_return_time?: string;
  status: string;
  approved_by?: string;
  reason: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface PermissionRequestRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_department?: string;
  date: string;
  permission_type: string;
  expected_out_time: string;
  expected_return_time?: string;
  reason: string;
  status: string;
  approved_by?: string;
  rejection_reason?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Leaves
// ═══════════════════════════════════════════════

export interface LeaveRecord {
  id: string;
  employee_id: string;
  leave_type: string;
  date_from: string;
  date_to: string;
  working_days_count?: number;
  status: string;
  approved_by?: string;
  reason?: string;
  attachment_url?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface LeaveBalanceRecord {
  id: string;
  employee_id: string;
  year: number;
  annual_total?: number;
  annual_used?: number;
  annual_pending?: number;
  annual_remaining?: number;
  sick_total?: number;
  sick_used?: number;
  sick_pending?: number;
  sick_remaining?: number;
  hajj_taken?: boolean;
  updated_at: string;
  tenant_id: string;
}

export interface LeaveSettingsRecord {
  id: string;
  leave_type: string;
  days_allowed?: number;
  is_paid?: boolean;
  requires_attachment?: boolean;
  once_per_service?: boolean;
  description?: string;
  updated_by?: string;
  updated_at: string;
  tenant_id: string;
}

export interface HolidayRecord {
  id: string;
  date: string;
  name: string;
  applies_to?: string;
  department_id?: string;
  is_recurring?: boolean;
  created_by?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Gatekeeper & Movements
// ═══════════════════════════════════════════════

export interface GatekeeperSessionRecord {
  id: string;
  gatekeeper_id?: string;
  started_at: string;
  ended_at?: string;
  is_active?: boolean;
  handover_status?: string;
  temp_pin?: string;
  notes?: string;
  created_at: string;
  tenant_id: string;
}

export interface GatekeeperVisitorLogRecord {
  id: string;
  session_id?: string;
  visitor_name: string;
  visitor_phone?: string;
  id_number?: string;
  check_in_time: string;
  check_out_time?: string;
  purpose?: string;
  host_name?: string;
  status?: string;
  notes?: string;
  created_at: string;
  tenant_id: string;
}

export interface MovementLogRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  department?: string;
  movement_type?: string;
  departure_at: string;
  returned_at?: string;
  expected_return_at?: string;
  destination?: string;
  actual_location?: string;
  purpose?: string;
  notes?: string;
  return_notes?: string;
  route_violation?: boolean;
  logged_by_id?: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
}

export interface EmployeeBreakRecord {
  id: string;
  employee_id: string;
  break_type?: string;
  started_at?: string;
  ended_at?: string;
  status: string;
  supervisor_id?: string;
  supervisor_name?: string;
  employee_name?: string;
  destination?: string;
  duration_minutes?: number;
  out_time?: string;
  return_time?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Finance
// ═══════════════════════════════════════════════

export interface ExpenseRequestRecord {
  id: string;
  employee_id: string;
  title: string;
  amount: number;
  currency?: string;
  category?: string;
  description?: string;
  status: string;
  approved_by?: string;
  receipt_url?: string;
  submitted_at: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface EmployeeLoanRecord {
  id: string;
  employee_id: string;
  // الحقول الحالية في قاعدة البيانات
  amount?: number;
  remaining_amount?: number;
  monthly_installment?: number;
  months_count?: number;
  months_paid?: number;
  start_date?: string;
  end_date?: string;
  rejection_reason?: string;
  // أسماء قديمة/بديلة للتوافق مع كود سابق
  loan_amount?: number;
  currency?: string;
  total_installments?: number;
  installment_amount?: number;
  purpose?: string;
  status: string;
  approved_by?: string;
  granted_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface BonusRecord {
  id: string;
  employee_id: string;
  bonus_amount: number;
  currency?: string;
  bonus_type?: string;
  reason?: string;
  bonus_date: string;
  approved_by?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Payroll
// ═══════════════════════════════════════════════

export interface PayrollPeriodRecord {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  processed_at?: string;
  created_at: string;
  tenant_id: string;
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  payroll_period_id: string;
  base_salary: number;
  allowances?: number;
  deductions?: number;
  net_salary: number;
  status: string;
  paid_at?: string;
  created_at: string;
  tenant_id: string;
}

export interface PayrollSettingRecord {
  id: string;
  name: string;
  value: unknown;
  description?: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Training & SOPs
// ═══════════════════════════════════════════════

export interface CourseRecord {
  id: string;
  title: string;
  description?: string;
  category?: string;
  duration_minutes?: number;
  instructor?: string;
  is_mandatory?: boolean;
  status?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface CourseProgressRecord {
  id: string;
  employee_id: string;
  course_id: string;
  status: string;
  progress_percent?: number;
  score?: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  tenant_id: string;
}

export interface SopsRecord {
  id: string;
  title: string;
  department_id?: string;
  content?: string;
  version?: number;
  status?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Notifications
// ═══════════════════════════════════════════════

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_table?: string;
  related_id?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  System
// ═══════════════════════════════════════════════

export interface SettingsRecord {
  id: string;
  landing_config?: Record<string, unknown>;
  shift_timings?: Record<string, unknown>;
  shift_windows?: Record<string, unknown>;
  leave_defaults?: Record<string, unknown>;
  work_weekend?: unknown[];
  overtime_rules?: Record<string, unknown>;
  attendance_thresholds?: Record<string, unknown>;
  ai_insights_schedule?: Record<string, unknown>;
  updated_by?: string;
  updated_at: string;
  tenant_id: string;
}

export interface AuditLogRecord {
  id: string;
  user_id?: string;
  employee_id?: string;
  role?: string;
  action: string;
  table_name: string;
  record_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  ip_address?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Recruitment
// ═══════════════════════════════════════════════

export interface JobPostingRecord {
  id: string;
  title: string;
  description?: string;
  department_id?: string;
  requirements?: string;
  status: string;
  posted_at?: string;
  closes_at?: string;
  created_at: string;
  tenant_id: string;
}

export interface JobApplicationRecord {
  id: string;
  posting_id: string;
  applicant_name: string;
  email: string;
  phone?: string;
  resume_url?: string;
  status: string;
  notes?: string;
  submitted_at: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Performance
// ═══════════════════════════════════════════════

export interface PerformanceCycleRecord {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  tenant_id: string;
}

export interface PerformanceReviewRecord {
  id: string;
  employee_id: string;
  reviewer_id: string;
  cycle_id: string;
  rating?: number;
  comments?: string;
  status: string;
  submitted_at?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Miscellaneous
// ═══════════════════════════════════════════════

export interface CertificationRecord {
  id: string;
  employee_id: string;
  name: string;
  issuer?: string;
  issued_date?: string;
  expiry_date?: string;
  file_url?: string;
  created_at: string;
  tenant_id: string;
}

export interface ReviewRecord {
  id: string;
  employee_id?: string;
  customer_name?: string;
  product_name?: string;
  rating: number;
  review_text?: string;
  created_at: string;
  tenant_id: string;
}

export interface WellnessEntryRecord {
  id: string;
  employee_id: string;
  mood_score?: number;
  stress_level?: number;
  energy_level?: number;
  notes?: string;
  date: string;
  created_at: string;
  tenant_id: string;
}

export interface SurveyResponseRecord {
  id: string;
  survey_id: string;
  employee_id?: string;
  answers: Record<string, unknown>;
  sentiment?: string;
  submitted_at: string;
  tenant_id: string;
}

export interface HrMessageRecord {
  id: string;
  employee_id?: string;
  subject: string;
  message: string;
  priority: 'low' | 'normal' | 'urgent';
  status: 'new' | 'read' | 'replied';
  profiles?: { full_name: string; department: string } | null;
  created_at: string;
  tenant_id: string;
}

export interface OnboardingTaskRecord {
  id: string;
  name: string;
  description?: string;
  department_id?: string;
  is_mandatory?: boolean;
  created_at: string;
  tenant_id: string;
}

export interface EmployeeDocumentRecord {
  id: string;
  employee_id: string;
  document_type: string;
  file_url: string;
  uploaded_at: string;
  created_at: string;
  tenant_id: string;
}

export interface SyncLogRecord {
  id: string;
  sync_time: string;
  source: string;
  device_id?: string;
  records_synced: number;
  status: string;
  error_message?: string;
  details?: unknown;
  tenant_id: string;
}

export interface ErrorLogRecord {
  id: string;
  message: string;
  source?: string;
  stack_trace?: string;
  severity?: string;
  category?: string;
  file_name?: string;
  line_number?: number;
  user_agent?: string;
  route?: string;
  environment?: string;
  created_at: string;
  tenant_id: string;
}

export interface ShiftAssignmentRecord {
  id: string;
  employee_id: string;
  shift_date: string;
  shift_type: string;
  created_at: string;
  tenant_id: string;
}

export interface TimeLogRecord {
  id: string;
  employee_id: string;
  log_type: string;
  timestamp: string;
  source?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  AI
// ═══════════════════════════════════════════════

export interface AiInsightRecord {
  id: string;
  insight_type: string;
  scope: string;
  department_id?: string;
  employee_id?: string;
  title: string;
  summary: string;
  data?: Record<string, unknown>;
  severity: string;
  generated_at: string;
  valid_until?: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Certifications
// ═══════════════════════════════════════════════

export interface EmployeeCertificationRecord {
  id: string;
  employee_id: string;
  name: string;
  issuer?: string;
  issued_date?: string;
  expiry_date?: string;
  file_url?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Gatekeeper Visitors (جدول قديم)
// ═══════════════════════════════════════════════

export interface GatekeeperVisitorRecord {
  id: string;
  name: string;
  phone?: string;
  id_number?: string;
  vehicle_number?: string;
  purpose?: string;
  host_name?: string;
  status?: string;
  check_in_time: string;
  check_out_time?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  HR - Disciplinary
// ═══════════════════════════════════════════════

export interface DisciplinaryActionRecord {
  id: string;
  employee_id: string;
  action_type: string;
  description: string;
  date: string;
  issued_by?: string;
  status: string;
  notes?: string;
  created_at: string;
  tenant_id: string;
}

export interface EmployeeDocumentRecord {
  id: string;
  employee_id: string;
  document_type: string;
  file_url: string;
  uploaded_at: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Reviews
// ═══════════════════════════════════════════════

export interface CustomerReviewRecord {
  id: string;
  employee_id?: string;
  customer_name?: string;
  product_name?: string;
  rating: number;
  review_text?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Structure
// ═══════════════════════════════════════════════

export interface StructureDepartmentRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  parent_id?: string;
  manager_id?: string;
  is_active: boolean;
  order_index?: number;
  created_at: string;
  tenant_id: string;
}

export interface StructurePositionRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  department_id?: string;
  rank_id?: string;
  is_active: boolean;
  created_at: string;
  tenant_id: string;
}

export interface StructureRankRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  level: number;
  created_at: string;
  tenant_id: string;
}

export interface StructureShiftRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  start_time: string;
  end_time: string;
  created_at: string;
  tenant_id: string;
}

export interface StructureRoleRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  permissions?: string[];
  created_at: string;
  tenant_id: string;
}

export interface SubscriptionRecord {
  id: string;
  company_id: string;
  plan: string;
  status: string;
  start_date: string;
  end_date?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Employee Self-Service: Goals, Skills, HR Cases
// ═══════════════════════════════════════════════

export type EmployeeGoalStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type EmployeeGoalCategory = 'performance' | 'learning' | 'wellbeing' | 'career' | 'compliance' | 'other';

export interface EmployeeGoalRecord {
  id: string;
  employee_id: string;
  title: string;
  description?: string;
  category: EmployeeGoalCategory;
  metric?: string;
  target_value?: string;
  current_value?: string;
  progress_percent: number;
  status: EmployeeGoalStatus;
  due_date?: string;
  last_update_note?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface GoalUpdateRecord {
  id: string;
  goal_id: string;
  employee_id: string;
  progress_percent: number;
  note?: string;
  created_by?: string;
  created_at: string;
  tenant_id: string;
}

export type EmployeeSkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface EmployeeSkillRecord {
  id: string;
  employee_id: string;
  skill_name: string;
  category?: string;
  level: EmployeeSkillLevel;
  evidence?: string;
  source: 'employee_self_assessment' | 'manager_review' | 'training' | 'hr';
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export type HRCaseStatus = 'open' | 'in_review' | 'waiting_employee' | 'resolved' | 'closed';
export type HRCasePriority = 'low' | 'normal' | 'urgent';

export interface HRCaseRecord {
  id: string;
  employee_id: string;
  case_type: string;
  subject: string;
  description: string;
  priority: HRCasePriority;
  status: HRCaseStatus;
  channel: 'employee_portal' | 'tawathul' | 'email' | 'phone';
  assigned_to?: string;
  resolution_summary?: string;
  sla_due_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface HRCaseCommentRecord {
  id: string;
  case_id: string;
  employee_id?: string;
  author_id: string;
  author_role?: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  tenant_id: string;
}

export type EmployeeLetterRequestStatus = 'submitted' | 'in_review' | 'ready' | 'delivered' | 'rejected';

export interface EmployeeLetterRequestRecord {
  id: string;
  employee_id: string;
  letter_type: 'employment_verification' | 'salary_certificate' | 'experience_letter' | 'other';
  purpose?: string;
  language: 'ar' | 'en' | 'both';
  delivery_method: 'portal' | 'email' | 'printed';
  status: EmployeeLetterRequestStatus;
  document_url?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  HR Maturity: Contracts & Succession Planning
// ═══════════════════════════════════════════════

export type EmployeeContractStatus = 'draft' | 'active' | 'expired' | 'terminated' | 'renewed';

export interface EmployeeContractRecord {
  id: string;
  employee_id: string;
  contract_number?: string;
  contract_type: 'permanent' | 'fixed_term' | 'probation' | 'part_time' | 'consultant' | 'other';
  title?: string;
  start_date: string;
  end_date?: string;
  renewal_notice_days: number;
  status: EmployeeContractStatus;
  salary_amount?: number;
  salary_currency?: string;
  document_url?: string;
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export type CriticalPositionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CriticalPositionRecord {
  id: string;
  title: string;
  department_id?: string;
  incumbent_employee_id?: string;
  risk_level: CriticalPositionRiskLevel;
  business_impact?: string;
  required_skills?: string[];
  status: 'active' | 'closed';
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export type SuccessionReadinessLevel = 'ready_now' | 'ready_6_months' | 'ready_12_months' | 'future_potential';

export interface SuccessionCandidateRecord {
  id: string;
  critical_position_id: string;
  employee_id: string;
  readiness_level: SuccessionReadinessLevel;
  readiness_score?: number;
  strengths?: string;
  gaps?: string;
  manager_notes?: string;
  status: 'active' | 'inactive';
  nominated_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface SuccessionDevelopmentPlanRecord {
  id: string;
  candidate_id: string;
  action_type: 'training' | 'mentoring' | 'assignment' | 'certification' | 'other';
  title: string;
  description?: string;
  target_date?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  HR Health & Safety / CAPA
// ═══════════════════════════════════════════════

export interface CorrectiveActionRecord {
  id: string;
  incident_id?: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  owner_id?: string;
  due_date?: string;
  completed_by?: string;
  completed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Admin Governance: Branches & Compliance
// ═══════════════════════════════════════════════

export interface BranchRecord {
  id: string;
  name_ar: string;
  name_en?: string;
  code?: string;
  city?: string;
  country?: string;
  address?: string;
  manager_id?: string;
  phone?: string;
  email?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface ComplianceCheckRecord {
  id: string;
  title: string;
  category: 'security' | 'hr' | 'documents' | 'permissions' | 'data_protection' | 'operations' | 'other';
  description?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'closed' | 'waived';
  owner_id?: string;
  due_date?: string;
  evidence_url?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface PolicyAcknowledgementRecord {
  id: string;
  policy_id?: string;
  employee_id: string;
  policy_title: string;
  policy_version?: string;
  acknowledged_at: string;
  ip_address?: string;
  created_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Movement Portal: Pre-approved Movement Permits
// ═══════════════════════════════════════════════

export interface MovementPermitRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  department?: string;
  destination: string;
  purpose?: string;
  valid_from: string;
  valid_until: string;
  max_duration_minutes: number;
  status: 'approved' | 'used' | 'expired' | 'cancelled';
  approved_by?: string;
  created_by?: string;
  movement_id?: string;
  used_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Supervisor Portal: Tasks, Shift Notes, Checklists
// ═══════════════════════════════════════════════

export interface TeamTaskRecord {
  id: string;
  supervisor_id: string;
  employee_id?: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  due_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface ShiftNoteRecord {
  id: string;
  supervisor_id: string;
  shift_date: string;
  shift_type?: string;
  note_type: 'handover' | 'issue' | 'safety' | 'quality' | 'general';
  title: string;
  content?: string;
  severity: 'info' | 'warning' | 'critical';
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface OperationalChecklistRecord {
  id: string;
  supervisor_id: string;
  checklist_type: 'safety' | 'quality' | 'opening' | 'closing' | 'equipment' | 'other';
  title: string;
  items: Record<string, unknown>[];
  score?: number;
  status: 'submitted' | 'reviewed' | 'rejected';
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

// ═══════════════════════════════════════════════
//  Manager Portal: Approvals & Workload
// ═══════════════════════════════════════════════

export interface ApprovalRequestRecord {
  id: string;
  requester_id?: string;
  requester_name?: string;
  current_approver_id?: string;
  request_type: 'leave' | 'expense' | 'loan' | 'attendance_correction' | 'movement_permit' | 'goal' | 'other';
  title: string;
  description?: string;
  related_table?: string;
  related_id?: string;
  priority: 'low' | 'normal' | 'urgent';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decided_by?: string;
  decided_at?: string;
  decision_note?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface ApprovalActionRecord {
  id: string;
  approval_request_id: string;
  actor_id?: string;
  action: 'created' | 'approved' | 'rejected' | 'commented' | 'reassigned';
  note?: string;
  created_at: string;
  tenant_id: string;
}

export interface ManagerWorkloadItemRecord {
  id: string;
  manager_id: string;
  employee_id?: string;
  title: string;
  description?: string;
  workload_type: 'task' | 'project' | 'support' | 'training' | 'other';
  estimated_hours?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  due_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface ChartOfAccountRecord {
  id: string; tenant_id: string; legal_entity_id: string; code: string; name: string; name_ar?: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  account_category?: string | null;
  parent_id?: string | null; level: number; is_active: boolean; allow_posting?: boolean;
  is_control_account?: boolean; archived_at?: string | null;
  normal_balance?: 'debit' | 'credit'; created_at: string; updated_at?: string;
}
export interface JournalEntryRecord {
  id: string; tenant_id: string; legal_entity_id: string; entry_number: string; entry_date: string;
  accounting_period_id?: string; journal_book_id?: string; transaction_currency_code?: string;
  exchange_rate?: number; description?: string; reference?: string; total_debit: number; total_credit: number;
  status: 'draft' | 'submitted' | 'approved' | 'posted' | 'reversed' | 'voided';
  created_by?: string; submitted_at?: string | null; submitted_by?: string | null; approved_at?: string | null; approved_by?: string | null;
  posted_at?: string | null; posted_by?: string | null; voided_at?: string | null; voided_by?: string | null; void_reason?: string | null;
  reversed_entry_id?: string | null; reversal_reason?: string | null; created_at: string; updated_at?: string;
}
export interface JournalEntryLineRecord {
  id: string; entry_id: string; tenant_id: string; legal_entity_id: string; account_id: string;
  line_number?: number; description?: string; debit_amount: number; credit_amount: number;
  transaction_debit?: number; transaction_credit?: number; transaction_currency_code?: string;
  cost_center?: string; cost_center_id?: string; project_code?: string; project_id?: string; created_at: string;
}
