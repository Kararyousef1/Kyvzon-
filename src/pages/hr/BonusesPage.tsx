/**
 * ════════════════════════════════════════════════════════════════
 *  BonusesPage — الجوائز والمكافآت (HR) · أُعيدت كتابتها في المرحلة 4
 *
 *  ★★★ ما كان معطوباً — كلّه مقيس على Postgres قبل الكتابة
 *      (المسبار: tools/dev/_probe_0358.sql · التفاصيل في
 *       supabase/migrations/0358_bonus_lifecycle_integrity.sql):
 *
 *  ① **زرّ «موافقة» يرمي دائماً**: `approveBonus(id, "system")`
 *     ⇒ `invalid input syntax for type uuid: "system"`.
 *  ② **مفردتان عربيّتان**: `'موافق'`/`'ملغي'` تُكتبان والصفحة تقرأ
 *     `'approved'`/`'cancelled'` ⇒ بطاقة «معتمدة» صفر أبداً وشارة خام.
 *  ③ **حقلان للمبلغ يتضاربان**: مقيس `(100000, 999999)` في صفٍّ واحد.
 *  ④ لا حارس على المبلغ · ⑤ `bonus_type` بلا CHECK · ⑥ لا FK.
 *  ⑦ حذف نهائيّ · ⑧ الفترة تُجمَع وتُهمَل.
 *  ⑨ `referral` مفقود من أزرار الفلترة (ستّة أنواع · خمسة أزرار).
 *  ⑩ جدولان كاملان + ربط بـMap.
 *  ⑪ نافذة التفاصيل تستعمل `PAYROLL_STATUS_LABELS` ⇒ `undefined`.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `bonusSdk`.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Award, Plus, Loader2, CheckCircle, XCircle, Eye, Filter,
  RefreshCw, Archive, Search, Wallet, Banknote, Users, ShieldAlert,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  bonusSdk,
  BONUS_STATUSES, BONUS_STATUS_AR, BONUS_STATUS_TONE, BONUS_TRANSITIONS,
  BONUS_TYPES, BONUS_TYPE_AR,
} from '../../services/sdk';
import type {
  BonusSummary, BonusRow, BonusDbStatus, BonusDbType, BonusDecision,
} from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { formatCurrency } from '../../utils/payrollUtils';
import { Modal, FormField, ModalActions, EmployeePicker } from './LoansPage';

/** اليوم بتوقيت بغداد — القاعدة تستعمل Asia/Baghdad صراحةً */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  return format(t, 'd MMM yyyy', { locale: ar });
}

const EMPTY_FORM = {
  employee_id: '',
  type: 'performance' as BonusDbType,
  amount: '',
  reason: '',
  period_start: '',
  period_end: '',
};

export default function BonusesPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading]       = useState(true);
  const [processing, setProcessing] = useState(false);
  const [rows, setRows]             = useState<BonusRow[]>([]);
  const [summary, setSummary]       = useState<BonusSummary | null>(null);

  const [typeFilter, setTypeFilter]     = useState<'all' | BonusDbType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | BonusDbStatus>('all');
  const [search, setSearch]             = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selected, setSelected] = useState<BonusRow | null>(null);

  /** نافذة السبب — بديل prompt() المحظور */
  const [noting, setNoting] =
    useState<{ bonus: BonusRow; kind: 'cancelled' | 'archive' } | null>(null);
  const [note, setNote] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑩: جدولان كاملان وربط بـMap صارا دالتَي قاعدة محدودتين
      const [board, sum] = await Promise.all([
        bonusSdk.board({
          status: statusFilter === 'all' ? null : statusFilter,
          type:   typeFilter === 'all' ? null : typeFilter,
          search: search.trim() || null,
          includeArchived,
          limit: 300,
        }),
        bonusSdk.summary(),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, statusFilter, typeFilter, search, includeArchived]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of BONUS_STATUSES) c[s] = 0;
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const handleCreate = async () => {
    const amount = Number(form.amount);
    if (!form.employee_id) { addToast('اختر الموظف', 'warning'); return; }
    // ★ العطل ④: المبلغ السالب كان يمرّ إلى القاعدة
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('المبلغ يجب أن يكون رقماً موجباً', 'warning'); return;
    }
    if (form.reason.trim() === '') {
      addToast('السبب إلزاميّ', 'warning'); return;
    }
    // ★ العطل ⑧: الفترة تُفحَص ثم تُمرَّر فعلاً
    if (form.period_start && form.period_end
        && form.period_end < form.period_start) {
      addToast('تاريخ النهاية قبل البداية', 'warning'); return;
    }
    setProcessing(true);
    try {
      await bonusSdk.create({
        employeeId: form.employee_id,
        type: form.type,
        amount,
        reason: form.reason.trim(),
        periodStart: form.period_start || null,
        periodEnd: form.period_end || null,
      });
      addToast('أُنشئت المكافأة بحالة «بانتظار الاعتماد»', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecide = async (bonus: BonusRow, decision: BonusDecision) => {
    // ★ الإلغاء يحتاج سبباً — القاعدة تُلزمه
    if (decision === 'cancelled') {
      setNoting({ bonus, kind: 'cancelled' });
      setNote('');
      return;
    }
    setProcessing(true);
    try {
      // ★★★ العطل ①: لا تُمرَّر "system" — القاعدة تكتب auth.uid()
      await bonusSdk.decide(bonus.id, decision);
      addToast(`الحالة الآن: ${BONUS_STATUS_AR[decision]}`, 'success');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleNoteConfirm = async () => {
    if (!noting) return;
    if (note.trim() === '') {
      addToast('السبب إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      if (noting.kind === 'cancelled') {
        await bonusSdk.decide(noting.bonus.id, 'cancelled', note.trim());
        addToast('أُلغيت المكافأة', 'success');
      } else {
        // ★ العطل ⑦: الحذف كان نهائياً — الآن أرشفة بأثر تدقيق
        await bonusSdk.archive(noting.bonus.id, note.trim());
        addToast('أُرشِفت المكافأة — تبقى للتدقيق', 'success');
      }
      setNoting(null);
      setNote('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Award className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الجوائز والمكافآت</h1>
            <p className="text-sm text-slate-500">
              الاعتماد ثم الصرف — بأثر تدقيق كامل
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
          >
            <Plus size={18} /> مكافأة جديدة
          </button>
        </div>
      </div>

      {/* ═══ البطاقات — محسوبة في القاعدة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Award size={15} />} tone="text-slate-900"
          value={summary ? String(summary.total) : '—'}
          label="إجمالي المكافآت"
          hint={summary ? `${summary.pending} بانتظار الاعتماد` : ''}
        />
        <StatCard
          icon={<Wallet size={15} />} tone="text-amber-600"
          value={summary ? formatCurrency(summary.amtPending) : '—'}
          label="بانتظار الاعتماد"
          hint={summary ? `${summary.pending} مكافأة` : ''}
        />
        {/* ★★★ العطل ②: هذه البطاقة كانت صفراً أبداً */}
        <StatCard
          icon={<CheckCircle size={15} />} tone="text-indigo-600"
          value={summary ? formatCurrency(summary.amtApproved) : '—'}
          label="معتمدة (لم تُصرف)"
          hint={summary ? `${summary.approved} مكافأة` : ''}
        />
        <StatCard
          icon={<Banknote size={15} />} tone="text-emerald-600"
          value={summary ? formatCurrency(summary.amtPaid) : '—'}
          label="مدفوعة"
          hint={summary ? `${summary.paid} مكافأة` : ''}
        />
      </div>

      {summary && (summary.amtMonth > 0 || summary.employees > 0) && (
        <div className="flex flex-wrap items-center gap-4 mb-5 px-4 py-3 bg-purple-50 border border-purple-200 rounded-2xl text-sm">
          <span className="flex items-center gap-1.5 text-purple-800 font-semibold">
            <Banknote size={15} />
            مكافآت الشهر: {formatCurrency(summary.amtMonth)}
          </span>
          <span className="flex items-center gap-1.5 text-purple-700">
            <Users size={15} />
            {summary.employees} موظفاً بمكافآت فعّالة
          </span>
        </div>
      )}

      {/* ═══ المرشّحات — كلها في القاعدة ═══ */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرمز أو السبب…"
            className="w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox" checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-slate-300"
          />
          إظهار المؤرشف
        </label>
      </div>

      {/* ★ الأنواع — ستّة أزرار مشتقّة من الثابت (كان referral مفقوداً) */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
            typeFilter === 'all'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Filter size={14} /> كل الأنواع
        </button>
        {BONUS_TYPES.map((t) => (
          <button
            key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
              typeFilter === t
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {BONUS_TYPE_AR[t]}
          </button>
        ))}
      </div>

      {/* ★ الحالات الأربع */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterChip
          active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}
          label="كل الحالات" count={statusCounts.all}
        />
        {BONUS_STATUSES.map((s) => (
          <FilterChip
            key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
            label={BONUS_STATUS_AR[s]} count={statusCounts[s] ?? 0}
          />
        ))}
      </div>

      {/* ═══ القائمة ═══ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-purple-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Award size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد مكافآت مطابقة</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((b) => (
            <BonusCard
              key={b.id} bonus={b} processing={processing}
              onDetails={() => setSelected(b)}
              onDecide={(d) => void handleDecide(b, d)}
              onArchive={() => { setNoting({ bonus: b, kind: 'archive' }); setNote(''); }}
            />
          ))}
        </div>
      )}

      {/* ═══ نافذة الإنشاء ═══ */}
      {showCreate && (
        <Modal title="مكافأة جديدة" onClose={() => setShowCreate(false)}>
          <EmployeePicker
            value={form.employee_id}
            onChange={(id) => setForm({ ...form, employee_id: id })}
          />
          <FormField label="نوع المكافأة" required>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as BonusDbType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              {BONUS_TYPES.map((t) => (
                <option key={t} value={t}>{BONUS_TYPE_AR[t]}</option>
              ))}
            </select>
          </FormField>
          <FormField label="المبلغ" required>
            <input
              type="number" min="1" inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </FormField>
          <FormField label="السبب" required>
            <textarea
              value={form.reason} rows={2}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </FormField>
          {/* ★ العطل ⑧: الحقلان كانا يُجمَعان ولا يُمرَّران */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ">
              <input
                type="date" value={form.period_start} max={form.period_end || undefined}
                onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </FormField>
            <FormField label="إلى تاريخ">
              <input
                type="date" value={form.period_end} min={form.period_start || undefined}
                onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </FormField>
          </div>
          {form.period_start && form.period_end
            && form.period_end < form.period_start && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              تاريخ النهاية قبل البداية
            </p>
          )}
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              تاريخ المكافأة يتبع «من تاريخ» حين يُحدَّد — فتُحسَب في شهرها
              لا في شهر الإدخال. وتُنشأ «بانتظار الاعتماد».
            </span>
          </div>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={() => void handleCreate()}
            submitLabel={processing ? 'جارٍ الإنشاء…' : 'إنشاء'}
            color="purple"
          />
        </Modal>
      )}

      {/* ═══ نافذة التفاصيل ═══ */}
      {selected && (
        <Modal title="تفاصيل المكافأة" onClose={() => setSelected(null)}>
          <div className="space-y-1">
            <DetailRow label="الموظف" value={selected.employeeName} />
            <DetailRow label="الرمز" value={selected.employeeCode} />
            <DetailRow label="القسم" value={selected.department} />
            <DetailRow
              label="النوع"
              value={BONUS_TYPE_AR[selected.type as BonusDbType] ?? selected.type}
            />
            <DetailRow label="المبلغ" value={formatCurrency(selected.amount)} />
            <DetailRow label="العملة" value={selected.currency} />
            <DetailRow label="السبب" value={selected.reason} />
            {/* ★ العطل ⑪: كانت تستعمل PAYROLL_STATUS_LABELS ⇒ undefined */}
            <DetailRow label="الحالة" value={BONUS_STATUS_AR[selected.status]} />
            <DetailRow label="تاريخ المكافأة" value={fmtDate(selected.bonusDate)} />
            <DetailRow
              label="الفترة"
              value={selected.periodStart
                ? `${fmtDate(selected.periodStart)} ← ${fmtDate(selected.periodEnd)}`
                : '—'}
            />
            <DetailRow label="المعتمِد" value={selected.approverName} />
            <DetailRow label="تاريخ القرار" value={fmtDate(selected.decidedAt)} />
            {selected.decisionNote && (
              <DetailRow label="ملاحظة القرار" value={selected.decisionNote} />
            )}
            <DetailRow label="أُنشئت" value={fmtDate(selected.createdAt)} />
          </div>
        </Modal>
      )}

      {/* ═══ نافذة السبب — بديل prompt() المحظور ═══ */}
      {noting && (
        <Modal
          title={noting.kind === 'cancelled' ? 'إلغاء المكافأة' : 'أرشفة المكافأة'}
          onClose={() => { setNoting(null); setNote(''); }}
        >
          <p className="text-sm text-slate-600">
            {noting.bonus.employeeName} — {formatCurrency(noting.bonus.amount)}
          </p>
          {noting.kind === 'archive' && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
              المكافأة تبقى للتدقيق ولا تُحذف، وتخرج من كل الحسابات.
            </p>
          )}
          <textarea
            value={note} rows={3} autoFocus
            onChange={(e) => setNote(e.target.value)}
            placeholder="السبب (إلزاميّ)"
            className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setNoting(null); setNote(''); }}
              disabled={processing}
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              تراجع
            </button>
            <button
              onClick={() => void handleNoteConfirm()}
              disabled={processing || note.trim() === ''}
              className={`px-5 py-2.5 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 ${
                noting.kind === 'cancelled' ? 'bg-red-600' : 'bg-slate-800'
              }`}
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              تأكيد
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ مكوّنات الصفحة ═══════════════

function StatCard({ icon, tone, value, label, hint }: {
  icon: React.ReactNode; tone: string; value: string;
  label: string; hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-bold ${tone} truncate`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
        active
          ? 'bg-purple-600 text-white border-purple-600'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`mr-1.5 text-xs ${active ? 'opacity-80' : 'text-slate-400'}`}>
        {count}
      </span>
    </button>
  );
}

function BonusCard({ bonus, processing, onDetails, onDecide, onArchive }: {
  bonus: BonusRow; processing: boolean;
  onDetails: () => void;
  onDecide: (d: BonusDecision) => void;
  onArchive: () => void;
}) {
  // ★ الانتقالات المسموحة فقط — نسخة من جدول القاعدة
  const nexts = bonus.archived
    ? []
    : (BONUS_TRANSITIONS[bonus.status] ?? []);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 transition-shadow ${
      bonus.archived ? 'opacity-60' : 'hover:shadow-md'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Award size={20} className="text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{bonus.employeeName}</p>
            <p className="text-xs text-slate-500 truncate">
              {/* ★ النوع المجهول يظهر بنصّه لا فارغاً */}
              {BONUS_TYPE_AR[bonus.type as BonusDbType] ?? bonus.type}
              {' · '}{bonus.department}{' · '}{bonus.reason}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <p className="font-bold text-slate-900">
              {formatCurrency(bonus.amount)}
            </p>
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                BONUS_STATUS_TONE[bonus.status]
              }`}>
                {BONUS_STATUS_AR[bonus.status]}
              </span>
              {bonus.archived && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500">
                  <Archive size={10} className="inline ml-1" />مؤرشفة
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onDetails}
            title="التفاصيل"
            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>

      {bonus.periodStart && (
        <p className="text-[11px] text-slate-400 mt-2">
          الفترة: {fmtDate(bonus.periodStart)} ← {fmtDate(bonus.periodEnd)}
        </p>
      )}

      {!bonus.archived && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {nexts.map((next) => (
            <button
              key={next}
              onClick={() => onDecide(next as BonusDecision)}
              disabled={processing}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 ${
                next === 'cancelled'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : next === 'paid'
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {next === 'cancelled' ? <XCircle size={14} /> : <CheckCircle size={14} />}
              {BONUS_STATUS_AR[next]}
            </button>
          ))}
          <button
            onClick={onArchive} disabled={processing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-40"
          >
            <Archive size={14} /> أرشفة
          </button>
          {bonus.approverName !== '—' && (
            <span className="text-[11px] text-slate-400 mr-auto">
              المعتمِد: {bonus.approverName}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0 gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-sm text-left">
        {value || '—'}
      </span>
    </div>
  );
}
