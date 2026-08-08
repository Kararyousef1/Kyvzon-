/**
 * HRServiceCenterPage — مركز خدمات الموارد البشرية · migration 0367
 *
 * ★★★ أُعيدت كتابتها بعد إثبات **ستة عشر عطلاً** تشغيلياً على
 *     Postgres 17 (المسباران `_probe_0367.sql`/`_probe_0367b.sql`).
 *     أخطرها ثلاثةٌ في **الجدار الأمنيّ**، أُثبتت بدور `authenticated`
 *     حقيقيّ لا بفحصٍ ثابت:
 *
 *  ① ★★★★ **الموظف يُصدر شهادة راتبه ويعتمدها ويُسلّمها بنفسه.**
 *     السياسة `kyvzon_letter_requests_write` كانت `polcmd='*'` (ALL).
 *        UPDATE … SET status='delivered',
 *                     document_url='http://fake/شهادة-راتب-مزوّرة.pdf',
 *                     reviewed_by = <الموظف نفسه>
 *        ⇒ **حدّث 1 صفّاً**. وثيقةٌ تُقدَّم للمصارف والسفارات، يُنشئها
 *          صاحبُها ويرفع ملفّها ويكتب أنه راجعها — بلا مرور HR.
 *  ② ★★★ **الموظف يُغلق شكواه ويكتب «تم الحل»** (حدّث 1 صفّاً).
 *  ③ ★★★ **الموظف يُسنِد الطلب لنفسه**.
 *  ④ ★★★ **الموظف يحذف طلب خطابه نهائياً**.
 *  ⑤ ★★ **شرطٌ ميّتٌ في ثلاث سياسات**: `employee_id = auth.uid()`
 *     (صفوف `employees` حيث `id = user_id` = **0 من 5**).
 *
 * ★ وأعطال الترابط:
 *  ⑦–⑩ **صفر FK**: طلبٌ لموظفٍ معدوم · موظفٌ من مستأجرٍ آخر ·
 *     شهادةُ راتبٍ لموظفٍ معدوم · مُسنَدٌ إلى مستخدمٍ معدوم.
 *  ⑪ الموضوع والوصف من مسافات · ⑫ «تم الحل» بلا ملخّصٍ ولا لحظة
 *  ⑬ «تم التسليم» بلا ملفّ · ⑭ «مرفوض» بلا سببٍ ولا عمودٍ ولا زرّ
 *  ⑮ ★★★ `sla_due_at` عمودٌ ميّت (صفر دالة · صفر محفّز · صفر صفّ)
 *  ⑯ ★★★ صفر دالة في المنظومة كلّها
 *
 * ★ وأعطال الصفحة القديمة نفسها:
 *   · `useState<any[]>([])` — انتهاكٌ صريح لقاعدة المشروع.
 *   · ثلاثة استعلاماتٍ بلا حدّ، منها جلبُ **كل** الموظفين بـ
 *     `orderBy: 'full_name_ar'` وهو عمودٌ معدومٌ لكل موظف.
 *   · `item.priority` و`letter_type` و`language` و`delivery_method`
 *     تُعرض **نصّاً إنجليزياً خامّاً** للمستخدم العربيّ.
 *   · الترشيح كلُّه في المتصفّح بعد جلب كل شيء.
 *   · زرّا «تم الحل» و«إغلاق» يكتبان مباشرةً عبر `.update()` بلا حارس.
 *   · لا زرَّ رفضٍ للخطابات إطلاقاً — حالةٌ لا سبيل إلى بلوغها.
 *   · لا زرَّ إنشاءٍ إطلاقاً: لوحةُ مراجعةٍ لطلباتٍ لا سبيل لتقديمها.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `serviceCenterSdk`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Clock3, FileText, Inbox, Loader2, Search, Send,
  Plus, AlertTriangle, UserPlus, XCircle, RotateCcw, Timer, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  serviceCenterSdk,
  CASE_STATES, CASE_PRIORITIES, CASE_TYPES,
  LETTER_TYPES, LETTER_STATES, LETTER_LANGUAGES, LETTER_DELIVERIES,
  caseStateLabel, casePriorityLabel, caseTypeLabel, caseChannelLabel,
  letterTypeLabel, letterStateLabel, letterLanguageLabel, letterDeliveryLabel,
  caseStateTone, casePriorityTone, letterStateTone,
  isCaseClosed, isLetterFinal,
} from '../../services/sdk';
import type {
  CaseRow, LetterRow, ServiceCenterSummary,
  CaseState, CasePriority, CaseType,
  LetterType, LetterState, LetterLanguage, LetterDelivery,
} from '../../services/sdk';
import { Modal, DetailRow, FormField, ModalActions } from './LoansPage';

const EMPTY_CASE = {
  caseType: 'general_inquiry' as CaseType,
  subject: '',
  description: '',
  priority: 'normal' as CasePriority,
};

const EMPTY_LETTER = {
  letterType: 'employment_verification' as LetterType,
  purpose: '',
  language: 'ar' as LetterLanguage,
  deliveryMethod: 'portal' as LetterDelivery,
};

function fmtStamp(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy · HH:mm', { locale: ar });
}

/** ★ عرضُ مهلة الاستحقاق بصيغةٍ مفهومة — الرقم محسوبٌ في القاعدة */
function slaText(hours: number | null): string {
  if (hours === null) return '—';
  const abs = Math.abs(hours);
  const body = abs >= 48
    ? `${Math.round(abs / 24)} يوماً`
    : `${abs.toFixed(1)} ساعة`;
  return hours < 0 ? `تأخّر ${body}` : `متبقٍّ ${body}`;
}

export default function HRServiceCenterPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [summary, setSummary] = useState<ServiceCenterSummary | null>(null);

  const [activeTab, setActiveTab] = useState<'cases' | 'letters'>('cases');
  const [search, setSearch] = useState('');
  const [caseStatus, setCaseStatus] = useState<'all' | CaseState>('all');
  const [casePriority, setCasePriority] = useState<'all' | CasePriority>('all');
  const [letterStatus, setLetterStatus] = useState<'all' | LetterState>('all');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showCase, setShowCase] = useState(false);
  const [caseForm, setCaseForm] = useState({ ...EMPTY_CASE });
  const [showLetter, setShowLetter] = useState(false);
  const [letterForm, setLetterForm] = useState({ ...EMPTY_LETTER });

  const [caseDetail, setCaseDetail] = useState<CaseRow | null>(null);
  const [closing, setClosing] = useState<CaseRow | null>(null);
  const [closeSummary, setCloseSummary] = useState('');
  const [closeTarget, setCloseTarget] = useState<CaseState>('resolved');

  const [letterDetail, setLetterDetail] = useState<LetterRow | null>(null);
  const [issuing, setIssuing] = useState<LetterRow | null>(null);
  const [issueUrl, setIssueUrl] = useState('');
  const [rejecting, setRejecting] = useState<LetterRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطلان ⑱/⑲: استعلامان بحدٍّ بدل ثلاثةٍ بلا حدّ + Map يدويّ
      const [caseRows, letterRows, sum] = await Promise.all([
        serviceCenterSdk.cases(
          search.trim() || null,
          caseStatus === 'all' ? null : caseStatus,
          casePriority === 'all' ? null : casePriority,
          200,
        ),
        serviceCenterSdk.letters(
          search.trim() || null,
          letterStatus === 'all' ? null : letterStatus,
          null,
          200,
        ),
        serviceCenterSdk.summary().catch(() => null),
      ]);
      setCases(caseRows);
      setLetters(letterRows);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, caseStatus, casePriority, letterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleOpenCase = async () => {
    if (!caseForm.subject.trim()) { addToast('الموضوع مطلوب', 'warning'); return; }
    if (!caseForm.description.trim()) { addToast('الوصف مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await serviceCenterSdk.openCase({
        caseType: caseForm.caseType,
        subject: caseForm.subject,
        description: caseForm.description,
        priority: caseForm.priority,
      });
      addToast('تم فتح طلب الخدمة', 'success');
      setShowCase(false);
      setCaseForm({ ...EMPTY_CASE });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLetter = async () => {
    setSaving(true);
    try {
      await serviceCenterSdk.openLetter({
        letterType: letterForm.letterType,
        purpose: letterForm.purpose.trim() || null,
        language: letterForm.language,
        deliveryMethod: letterForm.deliveryMethod,
      });
      addToast('تم تقديم طلب الخطاب', 'success');
      setShowLetter(false);
      setLetterForm({ ...EMPTY_LETTER });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★★ العطل ③: الإسناد صار عبر دالةٍ بحارس دور */
  const handleAssign = async (row: CaseRow) => {
    setBusyId(row.id);
    try {
      await serviceCenterSdk.assignCase(row.id, null);
      addToast('تم إسناد الطلب إليك', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetStatus = async (row: CaseRow, status: CaseState) => {
    setBusyId(row.id);
    try {
      await serviceCenterSdk.setCaseStatus(row.id, status, null);
      addToast('تم تحديث حالة الطلب', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑫: الإغلاق يستلزم ملخّصاً */
  const handleClose = async () => {
    if (!closing) return;
    if (!closeSummary.trim() && !closing.resolutionSummary) {
      addToast('ملخّص الحلّ مطلوب عند الإغلاق', 'warning');
      return;
    }
    setBusyId(closing.id);
    try {
      await serviceCenterSdk.setCaseStatus(
        closing.id, closeTarget, closeSummary.trim() || null,
      );
      addToast(closeTarget === 'closed' ? 'أُغلق الطلب' : 'تم حلّ الطلب', 'success');
      setClosing(null);
      setCloseSummary('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★★ العطل ①: الإصدار صار للموارد البشرية وحدها */
  const handleIssue = async () => {
    if (!issuing) return;
    if (!issueUrl.trim()) { addToast('رابط ملفّ الخطاب مطلوب', 'warning'); return; }
    setBusyId(issuing.id);
    try {
      await serviceCenterSdk.issueLetter(issuing.id, issueUrl);
      addToast('تم إصدار الخطاب — بانتظار التسليم', 'success');
      setIssuing(null);
      setIssueUrl('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑬: لا تسليمَ لخطابٍ لم يُصدَر */
  const handleDeliver = async (row: LetterRow) => {
    setBusyId(row.id);
    try {
      const done = await serviceCenterSdk.deliverLetter(row.id);
      addToast(done ? 'تم تسليم الخطاب' : 'سبق تسليم هذا الخطاب', 'info');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑭: زرُّ الرفض — لم يكن موجوداً إطلاقاً */
  const handleReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) { addToast('سبب الرفض مطلوب', 'warning'); return; }
    setBusyId(rejecting.id);
    try {
      await serviceCenterSdk.rejectLetter(rejecting.id, rejectReason);
      addToast('رُفض طلب الخطاب', 'success');
      setRejecting(null);
      setRejectReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const overdueNow = useMemo(() => cases.filter((c) => c.isOverdue).length, [cases]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* ══════════ الترويسة ══════════ */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-semibold">HR Service Management</p>
            <h2 className="text-2xl font-extrabold mt-1">مركز خدمات الموارد البشرية</h2>
            <p className="text-white/75 mt-2 text-sm">
              طلبات الموظفين · تصحيح الحضور · الخطابات الرسمية — من مكانٍ واحد.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setCaseForm({ ...EMPTY_CASE }); setShowCase(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl font-bold text-sm transition-colors"
            >
              <Plus size={16} /> طلب خدمة
            </button>
            <button
              onClick={() => { setLetterForm({ ...EMPTY_LETTER }); setShowLetter(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-700 hover:bg-emerald-50 rounded-xl font-bold text-sm transition-colors"
            >
              <FileText size={16} /> طلب خطاب
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ لافتة العطل ⑮ ══════════ */}
      {(summary?.casesOverdue ?? overdueNow) > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
          <Timer size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-900">
              {summary?.casesOverdue ?? overdueNow} طلباً تجاوز موعد الاستحقاق
            </p>
            <p className="text-red-700 mt-0.5">
              المهل: عاجل أربع ساعات · عادي يومان · منخفض خمسة أيام —
              تُحسب من لحظة الفتح.
            </p>
          </div>
        </div>
      )}

      {(summary?.casesUnassigned ?? 0) > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <UserPlus size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900">
              {summary?.casesUnassigned} طلباً بلا مسؤول
            </p>
            <p className="text-amber-700 mt-0.5">
              الطلب بلا مُسنَدٍ إليه لا يتقدّم — أسنِده لتبدأ المهلة بالعدّ الفعليّ.
            </p>
          </div>
        </div>
      )}

      {/* ══════════ البطاقات ══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatBox label="طلبات مفتوحة" value={summary?.casesOpen ?? 0} icon={Inbox} tone="bg-blue-50 text-blue-700" />
        <StatBox label="عاجلة" value={summary?.casesUrgent ?? 0} icon={AlertTriangle} tone="bg-red-50 text-red-700" />
        <StatBox label="متأخّرة" value={summary?.casesOverdue ?? 0} icon={Timer} tone="bg-orange-50 text-orange-700" />
        <StatBox label="محلولة" value={summary?.casesResolved ?? 0} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
        <StatBox label="خطابات معلّقة" value={summary?.lettersPending ?? 0} icon={FileText} tone="bg-purple-50 text-purple-700" />
        <StatBox label="أُعيد فتحها" value={summary?.casesReopened ?? 0} icon={RotateCcw} tone="bg-slate-100 text-slate-700" />
      </div>

      {/* ══════════ التبويب ══════════ */}
      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5">
        <button
          onClick={() => setActiveTab('cases')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'cases' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          طلبات الخدمة ({cases.length})
        </button>
        <button
          onClick={() => setActiveTab('letters')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'letters' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
          }`}
        >
          الخطابات ({letters.length})
        </button>
      </div>

      {/* ══════════ الترشيح ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالموضوع أو اسم الموظف أو رقمه…"
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {activeTab === 'cases' ? (
          <>
            <select
              value={caseStatus}
              onChange={(e) => setCaseStatus(e.target.value as 'all' | CaseState)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">كل الحالات</option>
              {CASE_STATES.map((s) => (
                <option key={s} value={s}>{caseStateLabel(s)}</option>
              ))}
            </select>
            <select
              value={casePriority}
              onChange={(e) => setCasePriority(e.target.value as 'all' | CasePriority)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">كل الأولويات</option>
              {CASE_PRIORITIES.map((p) => (
                <option key={p} value={p}>{casePriorityLabel(p)}</option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={letterStatus}
            onChange={(e) => setLetterStatus(e.target.value as 'all' | LetterState)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">كل الحالات</option>
            {LETTER_STATES.map((s) => (
              <option key={s} value={s}>{letterStateLabel(s)}</option>
            ))}
          </select>
        )}
      </div>

      {/* ══════════ القوائم ══════════ */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-emerald-600" size={36} />
        </div>
      ) : activeTab === 'cases' ? (
        cases.length === 0 ? (
          <EmptyBox text="لا توجد طلبات خدمة مطابقة" />
        ) : (
          <div className="grid gap-3">
            {cases.map((row) => (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{row.subject}</p>
                      {row.reopenedCount > 0 && (
                        <Badge tone="bg-slate-100 text-slate-600 border-slate-200">
                          أُعيد فتحه {row.reopenedCount}×
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.employeeName}
                      {row.employeeCode && ` · ${row.employeeCode}`}
                      {' · '}{caseTypeLabel(String(row.caseType))}
                      {' · '}{caseChannelLabel(String(row.channel))}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {/* ★ العطل ⑳: كانت تُعرض «urgent» خامّاً */}
                      <Badge tone={casePriorityTone(String(row.priority))}>
                        {casePriorityLabel(String(row.priority))}
                      </Badge>
                      <Badge tone={caseStateTone(String(row.status))}>
                        {caseStateLabel(String(row.status))}
                      </Badge>
                      {row.isOverdue && (
                        <Badge tone="bg-red-50 text-red-700 border-red-200">
                          {slaText(row.hoursToSla)}
                        </Badge>
                      )}
                      {!row.isOverdue && !isCaseClosed(String(row.status)) && row.hoursToSla !== null && (
                        <Badge tone="bg-slate-100 text-slate-600 border-slate-200">
                          {slaText(row.hoursToSla)}
                        </Badge>
                      )}
                      {!row.assignedTo && !isCaseClosed(String(row.status)) && (
                        <Badge tone="bg-amber-50 text-amber-700 border-amber-200">بلا مسؤول</Badge>
                      )}
                      {row.assigneeName && (
                        <Badge tone="bg-sky-50 text-sky-700 border-sky-200">
                          {row.assigneeName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {!row.assignedTo && !isCaseClosed(String(row.status)) && (
                      <ActionBtn onClick={() => handleAssign(row)} busy={busyId === row.id}
                        tone="bg-sky-50 text-sky-700 hover:bg-sky-100" icon={UserPlus}>
                        أسنِد إليّ
                      </ActionBtn>
                    )}
                    {row.status === 'in_review' && (
                      <ActionBtn onClick={() => handleSetStatus(row, 'waiting_employee')}
                        busy={busyId === row.id}
                        tone="bg-amber-50 text-amber-700 hover:bg-amber-100" icon={Clock3}>
                        بانتظار الموظف
                      </ActionBtn>
                    )}
                    {!isCaseClosed(String(row.status)) && (
                      <ActionBtn
                        onClick={() => {
                          setClosing(row); setCloseTarget('resolved');
                          setCloseSummary(row.resolutionSummary ?? '');
                        }}
                        busy={busyId === row.id}
                        tone="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        icon={CheckCircle2}
                      >
                        حلّ وإغلاق
                      </ActionBtn>
                    )}
                    {isCaseClosed(String(row.status)) && (
                      <ActionBtn onClick={() => handleSetStatus(row, 'open')}
                        busy={busyId === row.id}
                        tone="bg-slate-100 text-slate-700 hover:bg-slate-200" icon={RotateCcw}>
                        إعادة الفتح
                      </ActionBtn>
                    )}
                    <button onClick={() => setCaseDetail(row)}
                      className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100" title="التفاصيل">
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : letters.length === 0 ? (
        <EmptyBox text="لا توجد طلبات خطابات مطابقة" />
      ) : (
        <div className="grid gap-3">
          {letters.map((row) => (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* ★ العطل ㉑: كانت تُعرض letter_type خامّاً */}
                  <p className="font-bold text-slate-900">{letterTypeLabel(String(row.letterType))}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {row.employeeName}
                    {row.employeeCode && ` · ${row.employeeCode}`}
                    {' · '}{letterLanguageLabel(String(row.language))}
                    {' · '}{letterDeliveryLabel(String(row.deliveryMethod))}
                  </p>
                  {row.purpose && <p className="text-xs text-slate-600 mt-1">الغرض: {row.purpose}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge tone={letterStateTone(String(row.status))}>
                      {letterStateLabel(String(row.status))}
                    </Badge>
                    {row.waitingDays !== null && row.waitingDays > 0 && (
                      <Badge tone={row.waitingDays > 5
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'}>
                        بانتظار {row.waitingDays} يوماً
                      </Badge>
                    )}
                    {row.reviewerName && (
                      <Badge tone="bg-sky-50 text-sky-700 border-sky-200">{row.reviewerName}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  {!isLetterFinal(String(row.status)) && (
                    <ActionBtn
                      onClick={() => { setIssuing(row); setIssueUrl(row.documentUrl ?? ''); }}
                      busy={busyId === row.id}
                      tone="bg-purple-50 text-purple-700 hover:bg-purple-100" icon={FileText}>
                      إصدار
                    </ActionBtn>
                  )}
                  {row.status === 'ready' && (
                    <ActionBtn onClick={() => handleDeliver(row)} busy={busyId === row.id}
                      tone="bg-emerald-50 text-emerald-700 hover:bg-emerald-100" icon={Send}>
                      تسليم
                    </ActionBtn>
                  )}
                  {/* ★★★ العطل ⑭: زرُّ الرفض لم يكن موجوداً */}
                  {!isLetterFinal(String(row.status)) && (
                    <ActionBtn
                      onClick={() => { setRejecting(row); setRejectReason(''); }}
                      busy={busyId === row.id}
                      tone="bg-red-50 text-red-700 hover:bg-red-100" icon={XCircle}>
                      رفض
                    </ActionBtn>
                  )}
                  <button onClick={() => setLetterDetail(row)}
                    className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100" title="التفاصيل">
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ طلب خدمة جديد ══════════ */}
      {showCase && (
        <Modal title="طلب خدمة جديد" onClose={() => setShowCase(false)}>
          <FormField label="نوع الطلب" required>
            <select value={caseForm.caseType}
              onChange={(e) => setCaseForm({ ...caseForm, caseType: e.target.value as CaseType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500">
              {CASE_TYPES.map((t) => <option key={t} value={t}>{caseTypeLabel(t)}</option>)}
            </select>
          </FormField>
          <FormField label="الموضوع" required>
            <input value={caseForm.subject}
              onChange={(e) => setCaseForm({ ...caseForm, subject: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
          </FormField>
          <FormField label="الوصف" required>
            <textarea value={caseForm.description} rows={4}
              onChange={(e) => setCaseForm({ ...caseForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
          </FormField>
          <FormField label="الأولوية">
            <select value={caseForm.priority}
              onChange={(e) => setCaseForm({ ...caseForm, priority: e.target.value as CasePriority })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {CASE_PRIORITIES.map((p) => <option key={p} value={p}>{casePriorityLabel(p)}</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              المهلة: عاجل أربع ساعات · عادي يومان · منخفض خمسة أيام.
            </p>
          </FormField>
          <ModalActions onClose={() => setShowCase(false)}
            onSubmit={saving ? () => undefined : handleOpenCase}
            submitLabel={saving ? 'جارٍ الإرسال…' : 'فتح الطلب'} color="emerald" />
        </Modal>
      )}

      {/* ══════════ طلب خطاب جديد ══════════ */}
      {showLetter && (
        <Modal title="طلب خطاب رسميّ" onClose={() => setShowLetter(false)}>
          <FormField label="نوع الخطاب" required>
            <select value={letterForm.letterType}
              onChange={(e) => setLetterForm({ ...letterForm, letterType: e.target.value as LetterType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500">
              {LETTER_TYPES.map((t) => <option key={t} value={t}>{letterTypeLabel(t)}</option>)}
            </select>
          </FormField>
          <FormField label="الغرض">
            <input value={letterForm.purpose}
              onChange={(e) => setLetterForm({ ...letterForm, purpose: e.target.value })}
              placeholder="قرضٌ مصرفيّ · سفارة · جهةٌ حكومية…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
          </FormField>
          <FormField label="اللغة">
            <select value={letterForm.language}
              onChange={(e) => setLetterForm({ ...letterForm, language: e.target.value as LetterLanguage })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {LETTER_LANGUAGES.map((l) => <option key={l} value={l}>{letterLanguageLabel(l)}</option>)}
            </select>
          </FormField>
          <FormField label="طريقة الاستلام">
            <select value={letterForm.deliveryMethod}
              onChange={(e) => setLetterForm({ ...letterForm, deliveryMethod: e.target.value as LetterDelivery })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {LETTER_DELIVERIES.map((d) => <option key={d} value={d}>{letterDeliveryLabel(d)}</option>)}
            </select>
          </FormField>
          <ModalActions onClose={() => setShowLetter(false)}
            onSubmit={saving ? () => undefined : handleOpenLetter}
            submitLabel={saving ? 'جارٍ الإرسال…' : 'تقديم الطلب'} color="purple" />
        </Modal>
      )}

      {/* ══════════ الحلّ والإغلاق ══════════ */}
      {closing && (
        <Modal title="حلّ الطلب وإغلاقه" onClose={() => setClosing(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <DetailRow label="الموظف" value={closing.employeeName} />
            <DetailRow label="الموضوع" value={closing.subject} />
          </div>
          <FormField label="الحالة الجديدة" required>
            <select value={closeTarget}
              onChange={(e) => setCloseTarget(e.target.value as CaseState)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500">
              <option value="resolved">{caseStateLabel('resolved')}</option>
              <option value="closed">{caseStateLabel('closed')}</option>
            </select>
          </FormField>
          <FormField label="ملخّص الحلّ" required>
            <textarea value={closeSummary} rows={4}
              onChange={(e) => setCloseSummary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500" />
            <p className="text-[11px] text-slate-400 mt-1">
              لا يُغلق الطلب بلا ملخّصٍ — سجلٌّ يقول «حُلّ» ولا يقول كيف لا قيمة له.
            </p>
          </FormField>
          <ModalActions onClose={() => setClosing(null)}
            onSubmit={busyId === closing.id ? () => undefined : handleClose}
            submitLabel={busyId === closing.id ? 'جارٍ الحفظ…' : 'اعتماد'} color="emerald" />
        </Modal>
      )}

      {/* ══════════ إصدار الخطاب ══════════ */}
      {issuing && (
        <Modal title="إصدار الخطاب" onClose={() => setIssuing(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <DetailRow label="الموظف" value={issuing.employeeName} />
            <DetailRow label="النوع" value={letterTypeLabel(String(issuing.letterType))} />
            <DetailRow label="الغرض" value={issuing.purpose ?? '—'} />
          </div>
          <FormField label="رابط ملفّ الخطاب" required>
            <input value={issueUrl} onChange={(e) => setIssueUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
            <p className="text-[11px] text-slate-400 mt-1">
              لا يُسلَّم خطابٌ بلا ملفّ — والإصدار للموارد البشرية وحدها.
            </p>
          </FormField>
          <ModalActions onClose={() => setIssuing(null)}
            onSubmit={busyId === issuing.id ? () => undefined : handleIssue}
            submitLabel={busyId === issuing.id ? 'جارٍ الإصدار…' : 'إصدار'} color="purple" />
        </Modal>
      )}

      {/* ══════════ رفض الخطاب ══════════ */}
      {rejecting && (
        <Modal title="رفض طلب الخطاب" onClose={() => setRejecting(null)}>
          <FormField label="سبب الرفض" required>
            <textarea value={rejectReason} rows={3}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500" />
          </FormField>
          <ModalActions onClose={() => setRejecting(null)}
            onSubmit={busyId === rejecting.id ? () => undefined : handleReject}
            submitLabel={busyId === rejecting.id ? 'جارٍ الحفظ…' : 'رفض الطلب'} color="red" />
        </Modal>
      )}

      {/* ══════════ تفاصيل الطلب ══════════ */}
      {caseDetail && (
        <Modal title="تفاصيل طلب الخدمة" onClose={() => setCaseDetail(null)}>
          <DetailRow label="الموظف" value={caseDetail.employeeName} />
          <DetailRow label="الرقم الوظيفي" value={caseDetail.employeeCode || '—'} />
          <DetailRow label="النوع" value={caseTypeLabel(String(caseDetail.caseType))} />
          <DetailRow label="القناة" value={caseChannelLabel(String(caseDetail.channel))} />
          <DetailRow label="الموضوع" value={caseDetail.subject} />
          <DetailRow label="الوصف" value={caseDetail.description} />
          {/* ★ العطل ⑳: كانت priority تُعرض خامّة */}
          <DetailRow label="الأولوية" value={casePriorityLabel(String(caseDetail.priority))} />
          <DetailRow label="الحالة" value={caseStateLabel(String(caseDetail.status))} />
          <DetailRow label="المسؤول" value={caseDetail.assigneeName ?? 'بلا مسؤول'} />
          <DetailRow label="موعد الاستحقاق" value={fmtStamp(caseDetail.slaDueAt)} />
          <DetailRow label="المهلة" value={slaText(caseDetail.hoursToSla)} />
          <DetailRow label="أول ردّ" value={fmtStamp(caseDetail.firstResponseAt)} />
          {caseDetail.resolutionSummary && (
            <DetailRow label="ملخّص الحلّ" value={caseDetail.resolutionSummary} />
          )}
          <DetailRow label="تاريخ الحلّ" value={fmtStamp(caseDetail.resolvedAt)} />
          <DetailRow label="تاريخ الإغلاق" value={fmtStamp(caseDetail.closedAt)} />
          {caseDetail.reopenedCount > 0 && (
            <DetailRow label="أُعيد فتحه" value={`${caseDetail.reopenedCount} مرة`} />
          )}
          <DetailRow label="تاريخ الفتح" value={fmtStamp(caseDetail.createdAt)} />
        </Modal>
      )}

      {/* ══════════ تفاصيل الخطاب ══════════ */}
      {letterDetail && (
        <Modal title="تفاصيل طلب الخطاب" onClose={() => setLetterDetail(null)}>
          <DetailRow label="الموظف" value={letterDetail.employeeName} />
          <DetailRow label="الرقم الوظيفي" value={letterDetail.employeeCode || '—'} />
          <DetailRow label="النوع" value={letterTypeLabel(String(letterDetail.letterType))} />
          <DetailRow label="الغرض" value={letterDetail.purpose ?? '—'} />
          {/* ★ العطل ㉑: كانت language و delivery_method تُعرضان خامّتين */}
          <DetailRow label="اللغة" value={letterLanguageLabel(String(letterDetail.language))} />
          <DetailRow label="طريقة الاستلام" value={letterDeliveryLabel(String(letterDetail.deliveryMethod))} />
          <DetailRow label="الحالة" value={letterStateLabel(String(letterDetail.status))} />
          <DetailRow label="الملفّ" value={letterDetail.documentUrl ?? 'لم يُصدَر بعد'} />
          <DetailRow label="المُراجِع" value={letterDetail.reviewerName ?? '—'} />
          <DetailRow label="تاريخ المراجعة" value={fmtStamp(letterDetail.reviewedAt)} />
          <DetailRow label="تاريخ الإصدار" value={fmtStamp(letterDetail.issuedAt)} />
          <DetailRow label="تاريخ التسليم" value={fmtStamp(letterDetail.deliveredAt)} />
          {letterDetail.rejectionReason && (
            <DetailRow label="سبب الرفض" value={letterDetail.rejectionReason} />
          )}
          <DetailRow label="تاريخ الطلب" value={fmtStamp(letterDetail.createdAt)} />
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── مكوّنات مساعدة ─────────────────────────── */

function StatBox({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: LucideIcon; tone: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tone}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tone}`}>
      {children}
    </span>
  );
}

function ActionBtn({ onClick, busy, tone, icon: Icon, children }: {
  onClick: () => void; busy: boolean; tone: string;
  icon: LucideIcon; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${tone}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {children}
    </button>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
      <Inbox size={40} className="mx-auto text-slate-300 mb-3" />
      <p className="text-slate-400">{text}</p>
    </div>
  );
}
