/**
 * ════════════════════════════════════════════════════════════════
 *  IncidentService - خدمة إدارة البلاغات
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import type { IncidentRecord } from '../../shared/types/sdk';

/** الحالات الأربع بعد قيد `incidents_status_check` */
export type IncidentStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

/** بلاغ في شاشة الموظف (0338 · موسَّع في 0341) */
export interface MyIncident {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  isAnonymous: boolean;
  assignedTo: string | null;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  /** ★ 0341: مؤرشف = خارج الخدمة لكن باقٍ للتدقيق */
  archivedAt: string | null;
  /**
   * ★★★ 0341: هل يستطيع صاحبُه سحبه الآن؟
   *   يطابق شرط `set_incident_status` حرفياً فلا يظهر زرّ يفشل.
   *   قبل 0341 لم يكن الموظف يستطيع تغيير حالة بلاغه إطلاقاً
   *   (مُقاس: 0 صفوف متأثّرة) لأن السياسة تشترط `current_user_is_staff()`.
   */
  canWithdraw: boolean;
}

/**
 * بلاغ في صندوق الموارد البشرية (0338).
 *
 * ★★★ الهوية مخفيّة في **القاعدة** عند `isAnonymous`:
 *   `reporter` = 'مُبلِّغ مجهول' · `employeeId` = null · `department` = '—'
 *   لا يمكن لأي شاشة أن تكشفها بالخطأ.
 */
export interface HrIncident extends Omit<MyIncident, 'canWithdraw'> {
  employeeId: string | null;
  /** ★ 0341: من `profiles` الحيّ لا من العمود النصّي المتجمّد */
  reporter: string;
  department: string;
  ageHours: number;
  /** ★ 0342: كان يُخزَّن ولا يُعرض إطلاقاً */
  aiAnalysis: Record<string, unknown>;
  commentCount: number;
}

/** صفحة من صندوق البلاغات مع الإجمالي — الترقيم لم يعد أعمى */
export interface HrIncidentPage {
  rows: HrIncident[];
  /** الإجمالي **بعد** الترشيح وقبل الحدّ */
  total: number;
}

/** صفحة من بلاغاتي مع الإجمالي */
export interface MyIncidentPage {
  rows: MyIncident[];
  total: number;
}

/** تحليلات صندوق البلاغات */
export interface HrIncidentStats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  critical: number;
  /** المفتوح بلا مُسنَد — المحلول لا يُعدّ مشكلة */
  unassigned: number;
  anonymous: number;
  /** ★ 0341: المؤرشف — مستبعَد من كل العدّادات الأخرى */
  archived: number;
  oldestHours: number;
}

/**
 * رسائل أخطاء القاعدة (0338 · 0341) بصيغة `CODE: نصّ عربي`.
 * نعرض النصّ ونستعمل الرمز للتفريع.
 */
const ERROR_LABELS: Record<string, string> = {
  INCIDENT_NO_TENANT: 'لا سياق شركة لحسابك — راجع مدير النظام',
  INCIDENT_NOT_FOUND: 'البلاغ غير موجود',
  INCIDENT_BAD_STATUS: 'حالة غير معروفة',
  INCIDENT_BAD_TRANSITION: 'انتقال غير مسموح بين الحالتين',
  INCIDENT_NOT_OWNER: 'لا تملك هذا البلاغ',
  INCIDENT_OWNER_LIMIT: 'يمكنك سحب بلاغك ما دام معلّقاً فقط',
  INCIDENT_ARCHIVED: 'البلاغ مؤرشف — لا تتغيّر حالته',
  INCIDENT_ARCHIVE_NEEDS_REASON: 'سبب الأرشفة مطلوب',
  INCIDENT_NOT_AUTHORIZED_TO_ARCHIVE: 'الأرشفة لفريق الموارد البشرية',
  INCIDENT_DELETE_FORBIDDEN: 'البلاغ دليل — استعمل الأرشفة بدل الحذف',
  NOT_AUTHORIZED_TO_ASSIGN: 'الإسناد لفريق الموارد البشرية',
  ASSIGNEE_NOT_IN_TENANT: 'الموظف المختار ليس من شركتك',
};

/** يستخرج رسالة عربية مفهومة من خطأ القاعدة */
export function incidentErrorMessage(raw: string): string {
  const code = Object.keys(ERROR_LABELS).find((k) => raw.includes(k));
  if (!code) return raw;
  const detail = raw.split(`${code}:`)[1]?.trim();
  return detail && detail.length > 0 ? detail : ERROR_LABELS[code];
}

class IncidentService extends BaseService<IncidentRecord> {
  constructor() {
    super('incidents');
  }

  /** جلب بلاغات موظف معين */
  async findByEmployee(employeeId: string): Promise<IncidentRecord[]> {
    return this.findAll({
      filters: { employee_id: employeeId },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** جلب البلاغات المعلقة */
  async findPending(): Promise<IncidentRecord[]> {
    return this.findAll({
      filters: { status: 'pending' },
      orderBy: 'created_at',
      ascending: false,
    });
  }

  /** إنشاء بلاغ جديد */
  async createIncident(data: {
    title: string;
    description: string;
    category?: string;
    severity?: string;
    employee_id?: string;
    is_anonymous?: boolean;
  }): Promise<IncidentRecord> {
    return this.create(data as unknown as Partial<IncidentRecord>);
  }

  /**
   * رفع بلاغ جديد — **عبر بوّابة القاعدة** (migration 0342).
   *
   * ★★★ `NewProblemPage` كانت تُدرج في `incidents` مباشرةً بلا
   *   `tenant_id`، وسياسة `kyvzon_incidents_insert` تشترطه:
   *     new row violates row-level security policy for table "incidents"
   *   ⇒ **رفع أي بلاغ كان مستحيلاً**.
   *
   * ★★★ وللمجهول كانت تُفرّغ `user_id` — فتُصدّ بالسياسة نفسها
   *   (`user_id = auth.uid()`)، ولو مرّت لفقد صاحبُ البلاغ بلاغَه
   *   لأن `my_incidents` ترشّح بـ`user_id`. الإخفاء الصحيح **في
   *   العرض** كما فعل 0338 لا بإتلاف الرابط.
   *
   * ★ ولا تستقبل `employee_id`/`department_id` — تشتقّهما القاعدة،
   *   وكانا `NULL` دائماً فيظهر القسم «—» في صندوق الموارد.
   */
  async submit(input: {
    title: string;
    description: string;
    category?: string;
    severity?: string;
    isAnonymous?: boolean;
    aiAnalysis?: Record<string, unknown> | null;
  }): Promise<{ id: string; isAnonymous: boolean }> {
    const { data, error } = await supabase.rpc('submit_incident', {
      p_title: input.title,
      p_description: input.description,
      p_category: input.category ?? 'other',
      p_severity: input.severity ?? 'medium',
      p_anonymous: input.isAnonymous ?? false,
      p_ai_analysis: input.aiAnalysis ?? null,
    });
    if (error) {
      logger.error('submit_incident فشل: ' + error.message, {
        component: 'IncidentService', action: 'submit',
      });
      throw new Error(incidentErrorMessage(error.message));
    }
    type Raw = { out_id: string; out_is_anonymous: boolean };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) throw new Error('لم تُعِد القاعدة نتيجة للبلاغ');
    return { id: rows[0].out_id, isAnonymous: Boolean(rows[0].out_is_anonymous) };
  }

  /**
   * تغيير حالة بلاغ — **عبر بوّابة القاعدة** (migration 0341).
   *
   * ★★★ كانت تكتب في الجدول مباشرةً عبر `BaseService.update`:
   *   لا انتقال حالة مشروع، ولا `closed_at`، ولا أثر في التعليقات.
   *   وكانت تفشل صامتةً لغير `staff`: `kyvzon_incidents_update` تشترط
   *   `current_user_is_staff()` وحدها. مُقاس بعدّ الصفوف المتأثّرة:
   *     صاحب البلاغ → بلاغه هو ⇒ **0 صفوف**
   *   أي أن `.update()` كانت «تنجح» بلا أن تُغيّر شيئاً.
   *
   * الآن: انتقالات محدَّدة · صاحب البلاغ يسحب المعلّق · الملاحظة
   * تُسجَّل في `incident_comments` · `closed_at`/`closed_by` يُملآن.
   */
  async setStatus(id: string, status: IncidentStatus, note?: string): Promise<string> {
    const { data, error } = await supabase.rpc('set_incident_status', {
      p_incident_id: id,
      p_status: status,
      p_note: note ?? null,
    });
    if (error) {
      logger.error('setStatus فشل: ' + error.message, {
        component: 'IncidentService', action: 'setStatus',
      });
      throw new Error(incidentErrorMessage(error.message));
    }
    return String(data ?? status);
  }

  /**
   * أرشفة بلاغ — بديل الحذف النهائي (migration 0341).
   *
   * ★★★ الحذف كان متاحاً لأي `staff` (مُقاس: 1 صفّ محذوف) ومعه
   *   `incident_comments` بـ`ON DELETE CASCADE` — بلاغ مضايقة يختفي
   *   بلا أثر. السياسة أُسقطت والمحفّز يمنع الحذف على كل المسارات.
   */
  async archive(id: string, reason: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('archive_incident', {
      p_incident_id: id,
      p_reason: reason,
    });
    if (error) {
      logger.error('archive فشل: ' + error.message, {
        component: 'IncidentService', action: 'archive',
      });
      throw new Error(incidentErrorMessage(error.message));
    }
    return data === true;
  }

  /** إحصائيات سريعة */
  async getStats(): Promise<{ total: number; pending: number; resolved: number }> {
    const total = await this.count();
    const pending = await this.count({ status: 'pending' });
    const resolved = await this.count({ status: 'resolved' });
    return { total, pending, resolved };
  }

  /**
   * بلاغاتي — شاشة الموظف (migration 0338).
   *
   * ★ الترشيح بـ`user_id` في القاعدة لا `employee_id`: هذا ما تفعله
   *   سياسة `kyvzon_incidents_select`، والبلاغات القديمة سُجّلت به.
   */
  async myIncidents(opts?: {
    status?: string | null; search?: string | null;
    limit?: number; offset?: number;
  }): Promise<MyIncidentPage> {
    const { data, error } = await supabase.rpc('my_incidents', {
      p_status: opts?.status ?? null,
      p_search: opts?.search ?? null,
      p_limit: opts?.limit ?? 50,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      logger.error('myIncidents فشل: ' + error.message, {
        component: 'IncidentService', action: 'myIncidents',
      });
      return { rows: [], total: 0 };
    }
    type Raw = {
      out_id: string; out_title: string; out_description: string;
      out_category: string; out_severity: string; out_status: string;
      out_is_anonymous: boolean; out_assigned_to: string | null;
      out_assignee: string; out_archived_at: string | null;
      out_created_at: string; out_updated_at: string;
      out_can_withdraw: boolean; out_total: number;
    };
    const raw = (data ?? []) as Raw[];
    return {
      rows: raw.map((r) => ({
        id: r.out_id,
        title: r.out_title,
        description: r.out_description,
        category: r.out_category,
        severity: r.out_severity,
        status: r.out_status,
        isAnonymous: Boolean(r.out_is_anonymous),
        assignedTo: r.out_assigned_to,
        assignee: r.out_assignee,
        archivedAt: r.out_archived_at,
        createdAt: r.out_created_at,
        updatedAt: r.out_updated_at,
        canWithdraw: Boolean(r.out_can_withdraw),
      })),
      // ★ الإجمالي على كل الصفوف المُرشَّحة لا على الصفحة المُحمَّلة
      total: raw.length > 0 ? Number(raw[0].out_total ?? 0) : 0,
    };
  }

  /**
   * صندوق بلاغات الموارد البشرية (migration 0338).
   *
   * ★★★ `ProblemsList` كانت تعرض `employee_name` **بلا فحص
   *   `is_anonymous`** — فالبلاغ «المجهول» يكشف اسم صاحبه لمسؤول
   *   الموارد. إخلال بوعد صريح قد يُعرّض المُبلِّغ للانتقام.
   *   الإخفاء الآن في القاعدة: أي شاشة جديدة تحصل عليه مجاناً.
   */
  async hrInbox(opts?: {
    status?: string | null; severity?: string | null;
    search?: string | null; includeArchived?: boolean;
    limit?: number; offset?: number;
  }): Promise<HrIncidentPage> {
    const { data, error } = await supabase.rpc('hr_incidents_inbox', {
      p_status: opts?.status ?? null,
      p_severity: opts?.severity ?? null,
      p_search: opts?.search ?? null,
      p_include_archived: opts?.includeArchived ?? false,
      p_limit: opts?.limit ?? 50,
      p_offset: opts?.offset ?? 0,
    });
    if (error) {
      logger.error('hrInbox فشل: ' + error.message, {
        component: 'IncidentService', action: 'hrInbox',
      });
      return { rows: [], total: 0 };
    }
    type Raw = {
      out_id: string; out_title: string; out_description: string;
      out_category: string; out_severity: string; out_status: string;
      out_is_anonymous: boolean; out_employee_id: string | null;
      out_reporter: string; out_department: string;
      out_assigned_to: string | null; out_assignee: string;
      out_age_hours: number; out_archived_at: string | null;
      out_ai_analysis: Record<string, unknown> | null;
      out_comment_count: number;
      out_created_at: string; out_updated_at: string; out_total: number;
    };
    const raw = (data ?? []) as Raw[];
    return {
      rows: raw.map((r) => ({
        id: r.out_id,
        title: r.out_title,
        description: r.out_description,
        category: r.out_category,
        severity: r.out_severity,
        status: r.out_status,
        isAnonymous: Boolean(r.out_is_anonymous),
        employeeId: r.out_employee_id,
        reporter: r.out_reporter,
        department: r.out_department,
        assignedTo: r.out_assigned_to,
        assignee: r.out_assignee,
        ageHours: Number(r.out_age_hours ?? 0),
        aiAnalysis: r.out_ai_analysis ?? {},
        commentCount: Number(r.out_comment_count ?? 0),
        archivedAt: r.out_archived_at,
        createdAt: r.out_created_at,
        updatedAt: r.out_updated_at,
      })),
      total: raw.length > 0 ? Number(raw[0].out_total ?? 0) : 0,
    };
  }

  /** تحليلات صندوق البلاغات */
  async hrStats(days = 30): Promise<HrIncidentStats> {
    const EMPTY: HrIncidentStats = {
      total: 0, pending: 0, inProgress: 0, resolved: 0,
      critical: 0, unassigned: 0, anonymous: 0, archived: 0, oldestHours: 0,
    };
    const { data, error } = await supabase.rpc('hr_incident_stats', { p_days: days });
    if (error) {
      logger.error('hrStats فشل: ' + error.message, {
        component: 'IncidentService', action: 'hrStats',
      });
      return EMPTY;
    }
    type Raw = {
      out_total: number; out_pending: number; out_in_progress: number;
      out_resolved: number; out_critical: number; out_unassigned: number;
      out_anonymous: number; out_archived: number; out_oldest_hours: number;
    };
    const rows = (data ?? []) as Raw[];
    if (rows.length === 0) return EMPTY;
    const r = rows[0];
    return {
      total: Number(r.out_total ?? 0),
      pending: Number(r.out_pending ?? 0),
      inProgress: Number(r.out_in_progress ?? 0),
      resolved: Number(r.out_resolved ?? 0),
      critical: Number(r.out_critical ?? 0),
      unassigned: Number(r.out_unassigned ?? 0),
      anonymous: Number(r.out_anonymous ?? 0),
      archived: Number(r.out_archived ?? 0),
      oldestHours: Number(r.out_oldest_hours ?? 0),
    };
  }

  /**
   * إسناد بلاغ لموظف — أو إلغاء الإسناد بـ`null`.
   *
   * ★ `assigned_to` كان عموداً بلا أي كاتب: لا شاشة ولا دالة تُسنِد.
   */
  async assign(incidentId: string, employeeId: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('assign_incident', {
      p_incident_id: incidentId,
      p_employee_id: employeeId,
    });
    if (error) throw new Error(incidentErrorMessage(error.message));
    return data === true;
  }
}

export const incidentService = new IncidentService();
