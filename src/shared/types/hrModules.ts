/**
 * ════════════════════════════════════════════════════════════════
 *  أنواع بيانات الوحدات الإضافية - Kyvzon Platform
 *  (تقييم أداء + جزاءات + مستندات + نفقات + جدولة + توظيف)
 * ════════════════════════════════════════════════════════════════
 */

// ═══════════════════ تقييم الأداء ═══════════════════

export type ReviewStatus = 'draft' | 'submitted' | 'under_review' | 'completed' | 'cancelled';
export type GoalStatus = 'not_started' | 'in_progress' | 'on_track' | 'at_risk' | 'completed' | 'overdue';

export interface PerformanceCycle {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  review_period: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface PerformanceReview {
  id: string;
  cycle_id: string;
  cycle_name?: string;
  employee_id: string;
  employee_name?: string;
  reviewer_id: string;
  reviewer_name?: string;
  overall_score: number;
  strengths?: string;
  improvements?: string;
  comments?: string;
  goals_summary?: string;
  status: ReviewStatus;
  submitted_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PerformanceGoal {
  id: string;
  review_id?: string;
  employee_id: string;
  title: string;
  description?: string;
  weight: number;
  target_score: number;
  actual_score: number;
  status: GoalStatus;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ الجزاءات التأديبية ═══════════════════

export type DisciplinaryType = 'verbal_warning' | 'written_warning' | 'suspension' | 'demotion' | 'termination';

export interface DisciplinaryAction {
  id: string;
  employee_id: string;
  employee_name?: string;
  type: DisciplinaryType;
  reason: string;
  description?: string;
  severity: string;
  incident_date: string;
  issued_by: string;
  issued_by_name?: string;
  is_appealed: boolean;
  appeal_response?: string;
  status: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ المستندات ═══════════════════

export type DocumentType = 'contract' | 'certificate' | 'id_copy' | 'cv' | 'medical' | 'degree' | 'recommendation' | 'other';

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  employee_name?: string;
  document_type: DocumentType;
  title: string;
  description?: string;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  is_confidential: boolean;
  expires_at?: string;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ النفقات ═══════════════════

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface ExpenseRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  title: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  receipt_url?: string;
  status: ExpenseStatus;
  approved_by?: string;
  rejection_reason?: string;
  approved_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ جدولة الورديات ═══════════════════

export interface ShiftSchedule {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  schedule_id: string;
  employee_id: string;
  employee_name?: string;
  shift_type: 'صباحي' | 'مسائي' | 'ليلي';
  shift_date: string;
  notes?: string;
  created_at: string;
}

export interface ShiftSwapRequest {
  id: string;
  requester_id: string;
  requester_name?: string;
  target_id: string;
  target_name?: string;
  shift_date: string;
  reason: string;
  status: ExpenseStatus;
  approved_by?: string;
  rejection_reason?: string;
  created_at: string;
}

// ═══════════════════ التوظيف ═══════════════════

export type JobStatus = 'draft' | 'open' | 'closed' | 'filled' | 'cancelled';
export type ApplicationStatus = 'applied' | 'screening' | 'interview' | 'test' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

export interface JobPosting {
  id: string;
  title: string;
  title_en?: string;
  description: string;
  department_id?: string;
  department_name?: string;
  position?: string;
  employment_type: string;
  salary_min?: number;
  salary_max?: number;
  requirements?: string[];
  status: JobStatus;
  vacancy_count: number;
  posted_date?: string;
  closing_date?: string;
  applications_count?: number;
  created_at: string;
  updated_at: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  job_title?: string;
  applicant_name: string;
  applicant_email?: string;
  applicant_phone?: string;
  cv_url?: string;
  cover_letter?: string;
  status: ApplicationStatus;
  notes?: string;
  reviewed_by?: string;
  hired_employee_id?: string;
  applied_at: string;
  updated_at: string;
}

// ═══════════════════ Onboarding / Offboarding ═══════════════════

export type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface OnboardingTask {
  id: string;
  title: string;
  description?: string;
  task_type: string;
  sort_order: number;
  is_mandatory: boolean;
  is_active: boolean;
}

export interface EmployeeOnboarding {
  id: string;
  employee_id: string;
  employee_name?: string;
  task_id: string;
  task_title?: string;
  status: OnboardingStatus;
  completed_by?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
}

export interface OffboardingRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  last_working_day: string;
  reason: string;
  exit_type: string;
  is_final_settlement_done: boolean;
  assets_returned?: string[];
  access_revoked: boolean;
  exit_interview_notes?: string;
  conducted_by?: string;
  created_at: string;
}

// ═══════════════════ العقود ═══════════════════

export interface EmployeeContract {
  id: string;
  employee_id: string;
  employee_name?: string;
  contract_type: string;
  start_date: string;
  end_date?: string;
  salary?: number;
  position?: string;
  department_id?: string;
  terms?: string;
  contract_file_url?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ═══════════════════ تسميات عربية ═══════════════════

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: 'مسودة',
  submitted: 'مُرسلة',
  under_review: 'قيد المراجعة',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: 'لم يبدأ',
  in_progress: 'قيد التنفيذ',
  on_track: 'على المسار',
  at_risk: 'معرض للخطر',
  completed: 'مكتمل',
  overdue: 'متأخر',
};

export const DISCIPLINARY_TYPE_LABELS: Record<DisciplinaryType, string> = {
  verbal_warning: 'إنذار شفوي',
  written_warning: 'إنذار كتابي',
  suspension: 'إيقاف عن العمل',
  demotion: 'خفض درجة',
  termination: 'فصل من العمل',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'عقد عمل',
  certificate: 'شهادة',
  id_copy: 'نسخة هوية',
  cv: 'السيرة الذاتية',
  medical: 'تقرير طبي',
  degree: 'شهادة علمية',
  recommendation: 'خطاب توصية',
  other: 'مستند آخر',
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
  paid: 'مدفوع',
  cancelled: 'ملغى',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'مسودة',
  open: 'مفتوح',
  closed: 'مغلق',
  filled: 'تم شغله',
  cancelled: 'ملغى',
};

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'تم التقديم',
  screening: 'فرز أولي',
  interview: 'مقابلة',
  test: 'اختبار',
  offer: 'عرض وظيفة',
  hired: 'تم التوظيف',
  rejected: 'مرفوض',
  withdrawn: 'منسحب',
};

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  pending: 'بانتظار التنفيذ',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  skipped: 'تم تخطيه',
};
