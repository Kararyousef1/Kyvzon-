/**
 * ════════════════════════════════════════════════════════════════
 *  أنواع البيانات الأساسية - Kyvzon Platform
 *  تم التحديث والتوحيد لحل جميع التضاربات
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 إصلاحات هذه النسخة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ تنظيف markdown artifacts (روابط مكسورة + HTML entities)
 *  ✅ cv_data: any → نوع صريح (CvData interface)
 *  ✅ تعليقات أنظف دون روابط
 *  ════════════════════════════════════════════════════════════════
 */

// ═════════════════ الأنواع الأساسية ═══════════════

export type UserRole = 'employee' | 'hr' | 'admin' | 'gatekeeper' | 'developer' | 'supervisor' | 'manager' | 'it_admin';
export type Rank = 'executive' | 'manager' | 'supervisor' | 'employee';
export type ManufacturingDept = 'syrups' | 'tablets' | 'ointments' | 'powders' | 'management' | 'hr' | 'it';
export type GatekeeperType = 'employee_movement' | 'visitor_movement' | 'both';

// ═════════════════ بيانات السيرة الذاتية (CV) ═══════════════

/**
 * بيانات السيرة الذاتية للموظف.
 * استُخدمت `any` سابقاً → هذا النوع الموحّد يحل محلها بأمان.
 */
export interface CvData {
  education?: string[];
  experience?: Array<{
    company?: string;
    position?: string;
    period?: string;
    description?: string;
  }>;
  skills?: string[];
  certifications?: string[];
  languages?: Array<{ name: string; level: string }>;
  [key: string]: unknown; // لحقول إضافية مرنة دون اللجوء إلى any
}

// ═════════════════ واجهة المستخدم الموحدة ═══════════════

export interface User {
  // الهوية الأساسية
  id: string;              // Frontend ID (profiles.id أو auth.users.id)
  user_id?: string;        // Auth ID (للربط مع auth.users)
  employee_id?: string;    // Backend ID (employees.id)

  // الاسم (دعم كامل للتوافق)
  full_name: string;       // المعتمد
  name?: string;           // للتوافق القديم
  username?: string;       // للدخول المحلي

  // معلومات الاتصال
  email: string;
  phone?: string | null;

  // الوظيفة والمنصب
  role: UserRole;
  rank?: Rank;
  department?: string;
  position?: string;
  manufacturingDept?: ManufacturingDept;

  // الصورة (دعم كامل)
  profile_image?: string | null;  // المعتمد
  avatar?: string | null;         // للتوافق القديم
  certificateImage?: string;      // شهادة الموظف

  // الموقع والحالة
  location?: string;
  status?: 'active' | 'inactive' | 'on_leave';

  // التواريخ (موحدة)
  created_at?: string;
  updated_at?: string;
  joinDate?: string;
  employeeId?: string;

  // الإدارة والمالية
  manager_id?: string;           // ID المدير المباشر
  manager?: string;              // اسم المدير المباشر (للعرض)
  supervisor_id?: string;
  department_manager_id?: string;
  shift?: string;
  salary?: number;

  // الصلاحيات (موحدة)
  permissions?: string[];                        // المعتمد (array)
  custom_permissions?: Record<string, boolean>;  // للتوافق القديم
  can_manage_breaks?: boolean;                   // صلاحية خاصة

  // الرمز والأمان
  gatekeeper_type?: GatekeeperType;
  gatekeeper_pin?: string;   // الرمز السري للحارس (3 أرقام)
  passcode?: string;         // للدخول المحلي

  // Multi-Tenant
  tenant_id?: string;        // معرف الشركة (Tenant)

  // الإحصائيات والبيانات
  wellnessScore?: number;
  problemsCount?: number;
  cv_data?: CvData;          // ✅ كان any → الآن نوع صريح
}

// ═════════════════ المشاكل والتعليقات ═══════════════

export type ProblemStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type ProblemSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ProblemCategory = 'technical' | 'hr' | 'management' | 'workplace' | 'salary' | 'safety' | 'other';

export interface Problem {
  id: string;
  title: string;
  description: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  status: ProblemStatus;
  isAnonymous: boolean;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignedTo?: string;
  aiAnalysis?: AIAnalysis;
  comments?: Comment[];
  timeline?: TimelineEvent[];
}

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  event: string;
  description: string;
  timestamp: string;
  actor: string;
  type: 'created' | 'updated' | 'commented' | 'resolved' | 'assigned';
}

export interface AIAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  urgencyLevel: number;
  suggestedActions: string[];
  summary: string;
  tags: string[];
  predictedResolutionTime: string;
}

// ═════════════════ الصحة والعافية ═══════════════

export interface WellnessData {
  date: string;
  score: number;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible';
  stress: number;
  energy: number;
  notes?: string;
}

// ═════════════════ الإشعارات ═══════════════

import type { NotificationType as CoreNotificationType } from '../../core/constants/notificationTypes';

export type NotificationType = CoreNotificationType;

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  readAt?: string;
  link?: string;
  recipient_id?: string;
}

// ═════════════════ الاستبيانات ═══════════════

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text' | 'multiple_choice' | 'yes_no';
  options?: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  deadline: string;
  isCompleted: boolean;
}

// ═════════════════ التحليلات والإحصائيات ═══════════════

export interface DepartmentStats {
  name: string;
  employeeCount: number;
  problemCount: number;
  resolvedCount: number;
  wellnessAvg: number;
  satisfactionScore: number;
}

export interface Analytics {
  totalEmployees: number;
  activeProblems: number;
  resolvedThisMonth: number;
  avgResolutionTime: number;
  wellnessScore: number;
  satisfactionRate: number;
  departmentStats: DepartmentStats[];
  monthlyTrend: { month: string; problems: number; resolved: number }[];
  categoryBreakdown: { category: string; count: number; percentage: number }[];
  severityBreakdown: { severity: string; count: number }[];
}

// ═════════════════ المحادثة والذكاء الاصطناعي ═══════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ═════════════════ سجلات التدقيق ═══════════════

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  actorRole: UserRole;
  target: string;
  details: string;
  timestamp: string;
  ipAddress: string;
}

// ═════════════════ التوافق مع الكود القديم ═══════════════

/**
 * Employee هو نفسه User - للتوافق مع الكود القديم
 */
export type Employee = User;
