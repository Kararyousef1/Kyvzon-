/**
 * ════════════════════════════════════════════════════════════════
 *  HrInboxService — صندوق بريد الموارد البشرية (migration 0371)
 *
 *  ① ★★★★ **الصفحة كانت تعرض اسماً فارغاً لكلّ رسالة — دائماً.**
 *     `MessageService.findAllWithProfiles()` تطلب:
 *        .select('*, profiles(full_name, department)')
 *     والمفاتيح الأجنبية الفعلية على `hr_messages`:
 *        employee_id → **employees** · replied_by → **employees**
 *        عددُ المفاتيح إلى `profiles` = **صفر**
 *     ⇒ PostgREST لا يجد العلاقة فيردّ بخطأ، والخدمة تبتلعه:
 *        catch { console.error(…); return []; }
 *     وحتى لو مرّ، الصفحة تعرض `msg.profiles?.full_name ?? ""`.
 *
 *  ② ★★★★ **الأزرار الثلاثة بلا `onClick`** — «وضع علامة كمكتمل»
 *     و«أرشفة» و«رد» زينةٌ خالصة. الزرّ الصامت أسوأ من الغائب.
 *
 *  ③ ★★★ **أعمدة الردّ الثلاثة ميتة**: `reply`/`replied_by`/`replied_at`
 *     صفرُ سطرٍ يكتبها. و`status='replied'` بلا نصٍّ كان يُقبَل.
 *
 *  ④ ★★★ **الرادُّ كان يشير إلى `employees`** — ومدير النظام لا صفَّ
 *     له فيها (المحفّز يستثني developer/it_admin) فلم يكن يستطيع
 *     الردَّ أصلاً. صار إلى `profiles` مركَّباً بالمستأجر.
 *
 *  ⑤ ★★★ **زرُّ «أرشفة» بلا عمود، والحذف النهائيّ مسموح** — شكوى
 *     موظفٍ تختفي بلا أثر. الآن أرشفةٌ بسببٍ ومحفّزٌ يمنع الحذف.
 *
 *  ⑥ ★★ نصوصٌ من مسافات · ⑦ ★★★ عبورٌ بين المستأجرين ·
 *  ⑧ ★★ صفرُ دالةٍ على الجدول · ⑨ ★★ `tenant_id` كان يقبل NULL
 *     فالرسالة تصير يتيمةً لا يراها أحد.
 *
 *  ⑩ ★★★★ **الاشتراك اللحظيّ كان يُعيد جلب الجدول عند كلّ تغيير**
 *     — بما فيه التغييرُ الذي أحدثه المستخدم بفتح رسالة.
 *
 *  ⑪ ★★★★ **الردُّ لا يصل أحداً.** `ContactPage` تكتب في `hr_cases`
 *     **وفي** `hr_messages` بلا رابط، والموظف يقرأ `hr_cases` فقط.
 *     الآن `case_id` يربطهما و`hr_message_reply()` تُحدّث الحالة
 *     أيضاً فيصل الردُّ عبر الشاشة التي يقرؤها فعلاً.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError, SdkErrorCode } from './BaseService';

/** ★ الحالات الأربع — مطابِقة لـ`hr_messages_status_check` */
export const INBOX_STATES = ['new', 'read', 'replied', 'closed'] as const;
export type InboxState = (typeof INBOX_STATES)[number];

export const INBOX_STATE_AR: Record<InboxState, string> = {
  new:     'جديدة',
  read:    'مقروءة',
  replied: 'مردودٌ عليها',
  closed:  'مغلقة',
};

export const INBOX_STATE_TONE: Record<InboxState, string> = {
  new:     'bg-indigo-50 text-indigo-700 border-indigo-200',
  read:    'bg-slate-50 text-slate-700 border-slate-200',
  replied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:  'bg-slate-100 text-slate-500 border-slate-200',
};

/** ★ الأولويات الثلاث — مطابِقة لـ`hr_messages_priority_check` */
export const INBOX_PRIORITIES = ['low', 'normal', 'urgent'] as const;
export type InboxPriority = (typeof INBOX_PRIORITIES)[number];

export const INBOX_PRIORITY_AR: Record<InboxPriority, string> = {
  low:    'منخفضة',
  normal: 'عادية',
  urgent: 'عاجلة',
};

export const INBOX_PRIORITY_TONE: Record<InboxPriority, string> = {
  low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  normal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
};

export const inboxStateLabel = (s: string): string =>
  INBOX_STATE_AR[s as InboxState] ?? s;
export const inboxStateTone = (s: string): string =>
  INBOX_STATE_TONE[s as InboxState] ?? 'bg-slate-50 text-slate-700 border-slate-200';
export const inboxPriorityLabel = (p: string): string =>
  INBOX_PRIORITY_AR[p as InboxPriority] ?? p;
export const inboxPriorityTone = (p: string): string =>
  INBOX_PRIORITY_TONE[p as InboxPriority] ?? 'bg-slate-50 text-slate-700 border-slate-200';

/** ★ الحالة نهائيّةٌ فلا زرَّ يعمل عليها */
export const isInboxFinal = (s: string): boolean => s === 'closed';

export interface InboxMessageRow {
  id:            string;
  subject:       string;
  message:       string;
  priority:      string;
  status:        string;
  employeeId:    string | null;
  /** ★★★★ العطل ①: كان "" فارغةً دائماً — الآن من `profiles` عبر FK */
  senderName:    string;
  senderDept:    string;
  createdAt:     string | null;
  readAt:        string | null;
  reply:         string | null;
  replierName:   string | null;
  repliedAt:     string | null;
  /** ★★★★ العطل ⑪: الحالة المرتبطة — الشاشة التي يقرؤها الموظف */
  caseId:        string | null;
  caseSubject:   string | null;
  archivedAt:    string | null;
  ageHours:      number;
  /** ★★★ عاجلةٌ بلا ردٍّ بعد 24 ساعة · وغيرها بعد 72 */
  isOverdue:     boolean;
  awaitingReply: boolean;
}

export interface InboxSummary {
  totalOpen:  number;
  unread:     number;
  urgentOpen: number;
  overdue:    number;
  replied30d: number;
  archived:   number;
  /** ★★★ العطل ⑪ مقاساً: رسائلُ بلا حالةٍ مرتبطة */
  unlinked:   number;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';

class HrInboxSdk {
  /**
   * لوح الوارد — استعلامٌ واحدٌ مُرشَّحٌ في القاعدة.
   *
   * ★ العطل ⑧: الصفحة كانت تجلب الجدول كاملاً بلا حدٍّ ولا ترشيح.
   * ★★★ الدالة `SECURITY INVOKER` ⇒ RLS ساريةٌ على كلّ صفّ.
   */
  async board(
    search?: string | null,
    status?: InboxState | null,
    priority?: InboxPriority | null,
    archived = false,
    limit = 200,
  ): Promise<InboxMessageRow[]> {
    const { data, error } = await supabase.rpc('hr_message_board', {
      p_search:   search ?? null,
      p_status:   status ?? null,
      p_priority: priority ?? null,
      p_archived: archived,
      p_limit:    limit,
    });
    if (error) {
      logger.error('hr_message_board فشل: ' + error.message, {
        component: 'HrInboxSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:            str(r.id),
      subject:       str(r.subject),
      message:       str(r.message),
      priority:      str(r.priority),
      status:        str(r.status),
      employeeId:    strOrNull(r.employee_id),
      senderName:    str(r.sender_name),
      senderDept:    str(r.sender_dept),
      createdAt:     strOrNull(r.created_at),
      readAt:        strOrNull(r.read_at),
      reply:         strOrNull(r.reply),
      replierName:   strOrNull(r.replier_name),
      repliedAt:     strOrNull(r.replied_at),
      caseId:        strOrNull(r.case_id),
      caseSubject:   strOrNull(r.case_subject),
      archivedAt:    strOrNull(r.archived_at),
      ageHours:      num(r.age_hours),
      isOverdue:     bool(r.is_overdue),
      awaitingReply: bool(r.awaiting_reply),
    }));
  }

  /** الملخّص — سبعةُ عدّاداتٍ حيث كان صفر */
  async summary(): Promise<InboxSummary> {
    const { data, error } = await supabase.rpc('hr_message_summary');
    if (error) {
      logger.error('hr_message_summary فشل: ' + error.message, {
        component: 'HrInboxSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const rows = (data ?? []) as Raw[];
    const r: Raw = rows[0] ?? {};
    return {
      totalOpen:  num(r.total_open),
      unread:     num(r.unread),
      urgentOpen: num(r.urgent_open),
      overdue:    num(r.overdue),
      replied30d: num(r.replied_30d),
      archived:   num(r.archived),
      unlinked:   num(r.unlinked),
    };
  }

  /**
   * ★★★★ الردّ — العطلان ②/⑪.
   * الزرّ كان بلا `onClick`، والردُّ لو كُتب لما وصل أحداً.
   * الدالة تُحدّث الرسالة **والحالة المرتبطة** معاً.
   */
  async reply(id: string, text: string): Promise<boolean> {
    const body = text.trim();
    if (!body) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'نصُّ الردّ فارغ');
    }
    const { data, error } = await supabase.rpc('hr_message_reply', {
      p_id: id, p_reply: body,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return data === true;
  }

  /** إغلاق — ★★★ لا يُقبل قبل الردّ: «مكتمل» بلا ردٍّ كذبة */
  async close(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('hr_message_close', { p_id: id });
    if (error) throw SdkError.fromSupabaseError(error);
    return data === true;
  }

  /** ★★★ الأرشفة بديلُ الحذف — بسببٍ إلزاميّ */
  async archive(id: string, reason: string): Promise<boolean> {
    const body = reason.trim();
    if (!body) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'سببُ الأرشفة مطلوب');
    }
    const { data, error } = await supabase.rpc('hr_message_archive', {
      p_id: id, p_reason: body,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return data === true;
  }

  /** فتح الرسالة — لا يُنزل حالةً متقدّمة */
  async markRead(id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('hr_message_mark_read', { p_id: id });
    if (error) throw SdkError.fromSupabaseError(error);
    return data === true;
  }
}

export const hrInboxSdk = new HrInboxSdk();
