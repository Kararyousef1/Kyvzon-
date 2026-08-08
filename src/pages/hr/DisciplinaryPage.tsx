/**
 * DisciplinaryPage — الإجراءات التأديبية (HR) · migration 0365
 *
 * ★★★ أُعيدت كتابتها بعد إثبات **ستة عشر عطلاً** تشغيلياً على
 *     Postgres 17 (المسباران `_probe_0365.sql`/`_probe_0365b.sql`).
 *     الجدول كان **عارياً**: `pg_constraint` كاملاً سطران — `pkey`
 *     و FK على `tenants`. ثلاثة عشر صفّاً فاسداً أُدرجت، **وقُبل
 *     كلُّ واحدٍ منها**.
 *
 *  ①/② `employee_id` و`issued_by` بلا FK — إجراءٌ بحقّ موظفٍ معدوم،
 *     وإجراءٌ لا يُعرف من أصدره.
 *  ③ ★★★ عبورٌ بين المستأجرين: HR ألف تعاقب موظف باء.
 *  ④ ★★★ `tenant_id` قابلٌ للعدم ⇒ **صفٌّ مدفونٌ حيّاً** لا يراه أحد.
 *  ⑤/⑥/⑦ `type`/`severity`/`status` بلا CHECK ⇒ `execution` و
 *     `apocalyptic` و`banana` مقبولة، والصفحة القديمة تعرض
 *     `DISCIPLINARY_TYPE_LABELS[action.type]` = **undefined**.
 *  ⑧ واقعةٌ في المستقبل بسنتين · ⑨ صلاحيةٌ تنتهي قبل الواقعة بـ400 يوم
 *  ⑩ **فصلٌ من العمل** بسببٍ نصُّه ثلاث مسافات.
 *  ⑪ الموظف يُصدر إجراءً بحقّ نفسه.
 *  ⑫ `appeal_response` مكتوبٌ على إجراءٍ لم يُتظلَّم عليه.
 *  ⑬ ★★★ لا آليةَ تظلّمٍ إطلاقاً: صفر دالة وصفر عمود دورة حياة.
 *  ⑭ ★★★ لا انتهاءَ تلقائيّاً — إنذارٌ انقضى أجله منذ مئتَي يوم
 *     يظلّ «نافذاً» في سجلّ الموظف عند كل ترقيةٍ وتقييم.
 *  ⑮ ★★★ الحذف النهائيّ مسموح — و HR تمارسه فعلاً (أُثبت بدور
 *     `authenticated` حقيقيّ: «HR محا 1 سجلَّ إيقافٍ نهائياً بلا أثر»).
 *  ⑯ ★★★★ **حقُّ التظلّم مكتوبٌ في الجدول وغيرُ قابلٍ للممارسة**:
 *     الموظف **يقرأ** عقوبته (RLS_1 = 1 صفّ) ولا يستطيع الاعتراض
 *     عليها بحرف (RLS_2 = 0 صفّ) لأن سياسة UPDATE تشترط staff.
 *     والصفحة القديمة **لا تعرض زرَّ تظلّمٍ أصلاً** ⇒ العطل مكتملُ
 *     الطبقات: لا واجهة ولا خدمة ولا سياسة.
 *
 * ★ وأعطالُ الصفحة القديمة نفسها:
 *   · جلبت **كل** الموظفين و`orderBy: 'full_name_ar'` على عمودٍ
 *     معدومٍ لكل موظف، ثم بنت `Map` يدوياً.
 *   · أرسلت `issued_by: user?.id` من المتصفّح (يُزوَّر) — الآن
 *     `auth.uid()` في القاعدة.
 *   · `as unknown as Record<string, unknown>` للتحايل على الأنواع.
 *   · عرضت `selected.severity` و`selected.status` **نصّاً إنجليزياً
 *     خامّاً** للمستخدم العربيّ.
 *   · بطاقة «نشطة» تعدّ `status === 'active'` فقط فتُسقط كل حالةٍ أخرى.
 *   · صفر زرّ إجراء: لا تظلّم ولا بتّ ولا إقرار ولا إلغاء.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `disciplinarySdk`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert, Plus, Loader2, Eye, AlertTriangle, Search, Ban,
  Gavel, CheckCircle, Clock, Scale, RefreshCw, ShieldCheck, FileWarning,
} from 'lucide-react';
// ★ نوع أيقونات lucide الرسميّ. كتبتُ أوّلاً
//   `React.ComponentType<{ size?: number }>` فسقط tsc بـTS2322:
//   propTypes.size في LucideProps هو `string | number` لا `number`.
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  disciplinarySdk, DISCIPLINARY_TYPES, DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_STATES, APPEAL_DECISIONS,
  disciplinaryKindLabel, disciplinarySeverityLabel, disciplinaryStateLabel,
  appealDecisionLabel, disciplinaryKindTone, disciplinarySeverityTone,
  disciplinaryStateTone, isSevereKind,
} from '../../services/sdk';
import type {
  DisciplinaryRow, DisciplinarySummary, DisciplinaryKind,
  DisciplinarySeverity, DisciplinaryState, AppealDecision,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

/**
 * ★★★ اليوم بتوقيت بغداد — القاعدة تستعمل
 *   `AT TIME ZONE 'Asia/Baghdad'` صراحةً في المحفّز وفي كل حساب.
 *   استعمال `new Date()` في المتصفّح يُنتج يوماً مختلفاً بين
 *   `2026-08-07 22:30 UTC` (= 01:30 بغداد) — يومٌ كامل فرقاً.
 */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const EMPTY_FORM = {
  employeeId: '',
  kind: 'verbal_warning' as DisciplinaryKind,
  reason: '',
  description: '',
  severity: 'low' as DisciplinarySeverity,
  incidentDate: todayBaghdad(),
  validUntil: '',
};

/** ★ تنسيقٌ آمن: التواريخ قد تكون معدومة بعد إصلاح الأنواع */
function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy', { locale: ar });
}
function fmtStamp(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy · HH:mm', { locale: ar });
}

export default function DisciplinaryPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DisciplinaryRow[]>([]);
  const [summary, setSummary] = useState<DisciplinarySummary | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | DisciplinaryState>('all');
  const [kindFilter, setKindFilter] = useState<'all' | DisciplinaryKind>('all');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<DisciplinaryRow | null>(null);
  const [appealing, setAppealing] = useState<DisciplinaryRow | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [deciding, setDeciding] = useState<DisciplinaryRow | null>(null);
  const [decision, setDecision] = useState<AppealDecision>('upheld');
  const [decisionText, setDecisionText] = useState('');
  const [revoking, setRevoking] = useState<DisciplinaryRow | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑯ في الصفحة القديمة: استعلامٌ واحد بدل جلب كل الموظفين
      const [board, sum] = await Promise.all([
        disciplinarySdk.board(
          search.trim() || null,
          statusFilter === 'all' ? null : statusFilter,
          kindFilter === 'all' ? null : kindFilter,
          200,
        ),
        disciplinarySdk.summary().catch(() => null),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, statusFilter, kindFilter]);

  useEffect(() => { load(); }, [load]);

  /** ★★★ العطل ⑭: ترحيل منتهية الأجل — لم يكن في المنظومة مسارٌ يفعله */
  const handleExpireDue = async () => {
    setBusyId('__expire__');
    try {
      const n = await disciplinarySdk.expireDue();
      addToast(
        n > 0
          ? `تم ترحيل ${n} إجراءً انقضى أجله إلى «منتهي الأجل»`
          : 'لا إجراءات منقضية الأجل',
        n > 0 ? 'success' : 'info',
      );
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!form.employeeId) { addToast('اختر الموظف', 'warning'); return; }
    if (!form.reason.trim()) { addToast('السبب مطلوب', 'warning'); return; }
    // ★ العطل ⑧: حارسٌ مبكّر في الواجهة — والمحفّز يحرسه في القاعدة أيضاً
    if (form.incidentDate > todayBaghdad()) {
      addToast('تاريخ الواقعة لا يكون في المستقبل', 'warning');
      return;
    }
    // ★ العطل ⑨
    if (form.validUntil && form.validUntil < form.incidentDate) {
      addToast('نهاية الصلاحية لا تسبق تاريخ الواقعة', 'warning');
      return;
    }
    setSaving(true);
    try {
      await disciplinarySdk.issue({
        employeeId: form.employeeId,
        kind: form.kind,
        reason: form.reason,
        severity: form.severity,
        description: form.description.trim() || null,
        incidentDate: form.incidentDate || null,
        validUntil: form.validUntil || null,
      });
      addToast('تم تسجيل الإجراء التأديبي', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★★ العطل ⑯: الحقّ الذي لم يكن قابلاً للممارسة */
  const handleAppeal = async () => {
    if (!appealing) return;
    if (!appealReason.trim()) { addToast('سبب التظلّم مطلوب', 'warning'); return; }
    setBusyId(appealing.id);
    try {
      await disciplinarySdk.appeal(appealing.id, appealReason);
      addToast('تم تقديم التظلّم — بانتظار بتّ الموارد البشرية', 'success');
      setAppealing(null);
      setAppealReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecide = async () => {
    if (!deciding) return;
    // ★★★ تعميمُ درس العطل ⑲ في 0363: لا قرار بلا تعليل
    if (!decisionText.trim()) { addToast('تعليل القرار مطلوب', 'warning'); return; }
    setBusyId(deciding.id);
    try {
      const next = await disciplinarySdk.decideAppeal(deciding.id, decision, decisionText);
      addToast(
        next === 'overturned'
          ? 'أُلغي الإجراء التأديبي بناءً على التظلّم'
          : 'تم البتّ في التظلّم',
        'success',
      );
      setDeciding(null);
      setDecisionText('');
      setDecision('upheld');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAcknowledge = async (row: DisciplinaryRow) => {
    setBusyId(row.id);
    try {
      const done = await disciplinarySdk.acknowledge(row.id);
      addToast(done ? 'تم تسجيل إقرارك بالاطّلاع' : 'سبق أن أقررتَ بالاطّلاع', 'info');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑮: بديل الحذف النهائيّ */
  const handleRevoke = async () => {
    if (!revoking) return;
    if (!revokeReason.trim()) { addToast('سبب الإلغاء مطلوب', 'warning'); return; }
    setBusyId(revoking.id);
    try {
      await disciplinarySdk.revoke(revoking.id, revokeReason);
      addToast('أُلغي الإجراء إدارياً — السجلّ محفوظ', 'success');
      setRevoking(null);
      setRevokeReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★ صفٌّ واحدٌ على الأقلّ يستطيع صاحبُه التظلّم ⇒ نُبرز اللافتة */
  const myAppealable = useMemo(() => rows.filter((r) => r.canAppeal).length, [rows]);
  const pendingAppeals = useMemo(
    () => rows.filter((r) => r.status === 'appealed').length, [rows],
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ══════════ الترويسة ══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
            <ShieldAlert className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الإجراءات التأديبية</h1>
            <p className="text-sm text-slate-500">
              الإنذارات والجزاءات · التظلّم · الإلغاء الإداريّ
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExpireDue}
            disabled={busyId === '__expire__'}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
            title="ترحيل الإجراءات التي انقضى أجلها إلى «منتهي الأجل»"
          >
            {busyId === '__expire__'
              ? <Loader2 size={18} className="animate-spin" />
              : <RefreshCw size={18} />}
            ترحيل المنقضية
          </button>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
          >
            <Plus size={18} /> إجراء جديد
          </button>
        </div>
      </div>

      {/* ══════════ لافتة العطل ⑭: نافذٌ وقد انقضى أجله ══════════ */}
      {summary && summary.overdueExpiry > 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <Clock size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900">
              {summary.overdueExpiry} إجراءً ما زال «نافذاً» وقد انقضى أجله
            </p>
            <p className="text-amber-700 mt-0.5">
              يبقى محسوباً في سجلّ الموظف عند الترقية والتقييم حتى يُرحَّل.
              اضغط «ترحيل المنقضية».
            </p>
          </div>
        </div>
      )}

      {/* ══════════ لافتة العطل ⑯: حقُّ التظلّم ══════════ */}
      {myAppealable > 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
          <Scale size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-blue-900">
              يمكنك التظلّم على {myAppealable} إجراءً بحقّك
            </p>
            <p className="text-blue-700 mt-0.5">
              التظلّم حقٌّ لصاحب الشأن وحده، ويُقدَّم مرّةً واحدة على الإجراء النافذ.
            </p>
          </div>
        </div>
      )}

      {pendingAppeals > 0 && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-purple-50 border border-purple-200">
          <Gavel size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-purple-900">
              {pendingAppeals} تظلّماً بانتظار البتّ
            </p>
            <p className="text-purple-700 mt-0.5">
              القرار يستلزم تعليلاً — و«مُخفَّف» يُنزل درجة الخطورة فعلياً.
            </p>
          </div>
        </div>
      )}

      {/* ══════════ البطاقات ══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatBox label="الإجمالي" value={summary?.total ?? rows.length} color="#6366f1" icon={FileWarning} />
        <StatBox label="نافذة" value={summary?.active ?? 0} color="#ef4444" icon={AlertTriangle} />
        <StatBox label="قيد التظلّم" value={summary?.appealed ?? 0} color="#f59e0b" icon={Scale} />
        <StatBox label="مُلغاة بالتظلّم" value={summary?.overturned ?? 0} color="#10b981" icon={ShieldCheck} />
        <StatBox label="شديدة" value={summary?.severe ?? 0} color="#dc2626" icon={Ban} />
        <StatBox label="بلا إقرار" value={summary?.unacknowledged ?? 0} color="#8b5cf6" icon={Clock} />
      </div>

      {/* ══════════ الترشيح ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالسبب أو اسم الموظف أو رقمه…"
            className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | DisciplinaryState)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
        >
          <option value="all">كل الحالات</option>
          {DISCIPLINARY_STATES.map((s) => (
            <option key={s} value={s}>{disciplinaryStateLabel(s)}</option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as 'all' | DisciplinaryKind)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
        >
          <option value="all">كل الأنواع</option>
          {DISCIPLINARY_TYPES.map((t) => (
            <option key={t} value={t}>{disciplinaryKindLabel(t)}</option>
          ))}
        </select>
      </div>

      {/* ══════════ القائمة ══════════ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-red-500" size={40} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <ShieldAlert size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد إجراءات تأديبية مطابقة</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${disciplinaryKindTone(String(row.kind))}`}>
                    {isSevereKind(String(row.kind))
                      ? <Ban size={20} />
                      : <AlertTriangle size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900 truncate">{row.employeeName}</p>
                      {row.employeeCode && (
                        <span className="text-[11px] text-slate-400 font-mono">{row.employeeCode}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{row.reason}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge tone={disciplinaryKindTone(String(row.kind))}>
                        {disciplinaryKindLabel(String(row.kind))}
                      </Badge>
                      <Badge tone={disciplinarySeverityTone(String(row.severity))}>
                        {disciplinarySeverityLabel(String(row.severity))}
                      </Badge>
                      <Badge tone={disciplinaryStateTone(String(row.status))}>
                        {disciplinaryStateLabel(String(row.status))}
                      </Badge>
                      {/* ★★★ العطل ⑭ مرئيّاً على مستوى الصفّ */}
                      {row.status === 'active'
                        && row.daysRemaining !== null && row.daysRemaining < 0 && (
                        <Badge tone="bg-amber-50 text-amber-700 border-amber-200">
                          انقضى أجله منذ {Math.abs(row.daysRemaining)} يوماً
                        </Badge>
                      )}
                      {row.isExpiringSoon && (
                        <Badge tone="bg-amber-50 text-amber-700 border-amber-200">
                          يقارب الانتهاء ({row.daysRemaining} يوم)
                        </Badge>
                      )}
                      {row.status === 'active' && !row.acknowledgedAt && (
                        <Badge tone="bg-slate-100 text-slate-600 border-slate-200">
                          بلا إقرار اطّلاع
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-slate-400">{fmtDate(row.incidentDate)}</span>
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {/* ★★★ العطل ⑯: زرُّ التظلّم — لم يكن موجوداً إطلاقاً */}
                    {row.canAppeal && (
                      <ActionBtn
                        onClick={() => { setAppealing(row); setAppealReason(''); }}
                        busy={busyId === row.id}
                        tone="bg-blue-50 text-blue-700 hover:bg-blue-100"
                        icon={Scale}
                      >
                        تظلّم
                      </ActionBtn>
                    )}
                    {row.status === 'active' && !row.acknowledgedAt && (
                      <ActionBtn
                        onClick={() => handleAcknowledge(row)}
                        busy={busyId === row.id}
                        tone="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        icon={CheckCircle}
                      >
                        أقرُّ بالاطّلاع
                      </ActionBtn>
                    )}
                    {row.status === 'appealed' && (
                      <ActionBtn
                        onClick={() => {
                          setDeciding(row); setDecision('upheld'); setDecisionText('');
                        }}
                        busy={busyId === row.id}
                        tone="bg-purple-50 text-purple-700 hover:bg-purple-100"
                        icon={Gavel}
                      >
                        البتّ في التظلّم
                      </ActionBtn>
                    )}
                    {row.status !== 'revoked' && (
                      <ActionBtn
                        onClick={() => { setRevoking(row); setRevokeReason(''); }}
                        busy={busyId === row.id}
                        tone="bg-orange-50 text-orange-700 hover:bg-orange-100"
                        icon={Ban}
                      >
                        إلغاء إداريّ
                      </ActionBtn>
                    )}
                    <button
                      onClick={() => setDetail(row)}
                      className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100"
                      title="التفاصيل"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ إجراء جديد ══════════ */}
      {showCreate && (
        <Modal title="إجراء تأديبي جديد" onClose={() => setShowCreate(false)}>
          <EmployeePicker
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <FormField label="نوع الإجراء" required>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as DisciplinaryKind })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              {DISCIPLINARY_TYPES.map((t) => (
                <option key={t} value={t}>{disciplinaryKindLabel(t)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="السبب" required>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500"
            />
          </FormField>
          <FormField label="التفاصيل">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500"
            />
          </FormField>
          <FormField label="الخطورة">
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value as DisciplinarySeverity })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {DISCIPLINARY_SEVERITIES.map((s) => (
                <option key={s} value={s}>{disciplinarySeverityLabel(s)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="تاريخ الواقعة" required>
            <input
              type="date"
              value={form.incidentDate}
              max={todayBaghdad()}
              onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="نهاية الصلاحية (اختياري)">
            <input
              type="date"
              value={form.validUntil}
              min={form.incidentDate}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              بعد هذا التاريخ يُرحَّل الإجراء إلى «منتهي الأجل» ولا يُحتسب في سجلّ الموظف.
            </p>
          </FormField>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={saving ? () => undefined : handleCreate}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'تسجيل'}
            color="red"
          />
        </Modal>
      )}

      {/* ══════════ ★★★ التظلّم — العطل ⑯ ══════════ */}
      {appealing && (
        <Modal title="تقديم تظلّم" onClose={() => setAppealing(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <DetailRow label="الإجراء" value={disciplinaryKindLabel(String(appealing.kind))} />
            <DetailRow label="السبب" value={appealing.reason} />
            <DetailRow label="تاريخ الواقعة" value={fmtDate(appealing.incidentDate)} />
          </div>
          <FormField label="سبب التظلّم" required>
            <textarea
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              rows={4}
              placeholder="اشرح لماذا ترى الإجراء غير صحيح…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <p className="text-[11px] text-slate-400">
            يُقدَّم التظلّم مرّةً واحدة، وتنتقل حالة الإجراء إلى «قيد التظلّم»
            حتى تبتّ فيه الموارد البشرية.
          </p>
          <ModalActions
            onClose={() => setAppealing(null)}
            onSubmit={busyId === appealing.id ? () => undefined : handleAppeal}
            submitLabel={busyId === appealing.id ? 'جارٍ الإرسال…' : 'تقديم التظلّم'}
            color="blue"
          />
        </Modal>
      )}

      {/* ══════════ البتّ في التظلّم ══════════ */}
      {deciding && (
        <Modal title="البتّ في التظلّم" onClose={() => setDeciding(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <DetailRow label="الموظف" value={deciding.employeeName} />
            <DetailRow label="الإجراء" value={disciplinaryKindLabel(String(deciding.kind))} />
            <DetailRow label="الخطورة" value={disciplinarySeverityLabel(String(deciding.severity))} />
            <DetailRow label="سبب التظلّم" value={deciding.appealReason ?? '—'} />
            <DetailRow label="تاريخ التظلّم" value={fmtStamp(deciding.appealedAt)} />
          </div>
          <FormField label="القرار" required>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as AppealDecision)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              {APPEAL_DECISIONS.map((d) => (
                <option key={d} value={d}>{appealDecisionLabel(d)}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              «مُخفَّف» يُنزل درجة الخطورة فعلياً · «مُلغى» يُبطل الإجراء.
            </p>
          </FormField>
          <FormField label="تعليل القرار" required>
            <textarea
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </FormField>
          <ModalActions
            onClose={() => setDeciding(null)}
            onSubmit={busyId === deciding.id ? () => undefined : handleDecide}
            submitLabel={busyId === deciding.id ? 'جارٍ الحفظ…' : 'اعتماد القرار'}
            color="purple"
          />
        </Modal>
      )}

      {/* ══════════ الإلغاء الإداريّ — بديل الحذف ══════════ */}
      {revoking && (
        <Modal title="إلغاء الإجراء إدارياً" onClose={() => setRevoking(null)}>
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800">
            السجلّ التأديبيّ <strong>لا يُحذف</strong> — يُلغى مع حفظ سببه
            وفاعله ولحظته، ويبقى في السجلّ للمراجعة.
          </div>
          <FormField label="سبب الإلغاء" required>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          <ModalActions
            onClose={() => setRevoking(null)}
            onSubmit={busyId === revoking.id ? () => undefined : handleRevoke}
            submitLabel={busyId === revoking.id ? 'جارٍ الإلغاء…' : 'إلغاء الإجراء'}
            color="orange"
          />
        </Modal>
      )}

      {/* ══════════ التفاصيل ══════════ */}
      {detail && (
        <Modal title="تفاصيل الإجراء التأديبي" onClose={() => setDetail(null)}>
          <DetailRow label="الموظف" value={detail.employeeName} />
          <DetailRow label="الرقم الوظيفي" value={detail.employeeCode || '—'} />
          {/* ★ العطل ⑤/⑥/⑦: كانت تُعرض نصّاً إنجليزياً خامّاً */}
          <DetailRow label="النوع" value={disciplinaryKindLabel(String(detail.kind))} />
          <DetailRow label="الخطورة" value={disciplinarySeverityLabel(String(detail.severity))} />
          <DetailRow label="الحالة" value={disciplinaryStateLabel(String(detail.status))} />
          <DetailRow label="السبب" value={detail.reason} />
          {detail.description && <DetailRow label="التفاصيل" value={detail.description} />}
          <DetailRow label="تاريخ الواقعة" value={fmtDate(detail.incidentDate)} />
          <DetailRow
            label="نهاية الصلاحية"
            value={detail.validUntil ? fmtDate(detail.validUntil) : 'بلا أجل'}
          />
          {detail.daysRemaining !== null && (
            <DetailRow
              label="المتبقّي"
              value={detail.daysRemaining >= 0
                ? `${detail.daysRemaining} يوماً`
                : `انقضى منذ ${Math.abs(detail.daysRemaining)} يوماً`}
            />
          )}
          {/* ★ العطل ②: كان الإجراء لا يُعرف من أصدره */}
          <DetailRow label="أصدره" value={detail.issuerName} />
          <DetailRow label="إقرار الاطّلاع" value={fmtStamp(detail.acknowledgedAt)} />

          {detail.isAppealed && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-500 mb-2">التظلّم</p>
              <DetailRow label="تاريخ التظلّم" value={fmtStamp(detail.appealedAt)} />
              <DetailRow label="سبب التظلّم" value={detail.appealReason ?? '—'} />
              <DetailRow
                label="القرار"
                value={detail.appealDecision
                  ? appealDecisionLabel(String(detail.appealDecision))
                  : 'بانتظار البتّ'}
              />
              {detail.appealResponse && (
                <DetailRow label="تعليل القرار" value={detail.appealResponse} />
              )}
              {detail.appealDecider && (
                <DetailRow label="بتَّ فيه" value={detail.appealDecider} />
              )}
              {detail.appealDecidedAt && (
                <DetailRow label="تاريخ البتّ" value={fmtStamp(detail.appealDecidedAt)} />
              )}
            </div>
          )}

          {detail.revokedAt && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-500 mb-2">الإلغاء الإداريّ</p>
              <DetailRow label="تاريخ الإلغاء" value={fmtStamp(detail.revokedAt)} />
              <DetailRow label="السبب" value={detail.revocationReason ?? '—'} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── مكوّنات مساعدة ─────────────────────────── */

function StatBox({ label, value, color, icon: Icon }: {
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
        <Icon size={18} style={{ color, opacity: 0.5 }} />
      </div>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
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
  onClick: () => void;
  busy: boolean;
  tone: string;
  icon: LucideIcon;
  children: React.ReactNode;
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
