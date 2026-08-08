/**
 * ════════════════════════════════════════════════════════════════
 *  OnboardingPage — التعريف وإنهاء الخدمة (HR) · المرحلة 4
 *
 *  ★★★ ما كان معطوباً — كلّه مقيس على Postgres قبل الكتابة
 *      (المسبار: tools/dev/_probe_0359.sql · التفاصيل في
 *       supabase/migrations/0359_onboarding_offboarding_integrity.sql):
 *
 *  ① **إنهاء الخدمة يفشل ويترك سجلاً يتيماً**: نداءان بلا معاملة،
 *     والثاني يكتب `employment_status` وهو عمود **معدوم**
 *     ⇒ سجلُّ إنهاء مكتوب والموظف ما زال نشطاً.
 *  ② **بدء التعريف مرّتين يُضاعف المهام** (مقيس: 2×2 = 4).
 *  ③ `upsert()` حلقة `create` بلا معاملة.
 *  ④ لا FK · ⑤ لا CHECK — و`end_contract` يظهر **«تقاعد»**.
 *  ⑥ لا فرادة في إنهاء الخدمة · ⑦ `completed_by` لا يُكتب.
 *  ⑧ أربعة أعمدة إجراءات معدومة في الواجهة · ⑨ لا محفّز حذف.
 *  ⑩ أربعة استعلامات + `tasks.find()` داخل `map`.
 *  ⑪ `any` في أربعة مواضع.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `onboardingLifecycleSdk`.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, UserMinus, Loader2, CheckCircle, ListChecks,
  RefreshCw, Search, ShieldAlert, AlertTriangle, Circle,
  SkipForward, KeyRound, Wallet, Package, Users, Award,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  onboardingLifecycleSdk,
  ONBOARDING_TASK_STATUS_AR, ONBOARDING_TASK_STATUS_TONE,
  EXIT_TYPES, EXIT_TYPE_AR, exitTypeLabel, exitTypeTone,
} from '../../services/sdk';
import type {
  OnboardingRow, OnboardingTask, OffboardingRow,
  OnboardingSummary, ExitType, OnboardingTaskStatus,
} from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Modal, EmployeePicker, FormField, ModalActions } from './LoansPage';

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

const EMPTY_OFFBOARD = {
  employee_id: '',
  last_working_day: todayBaghdad(),
  reason: '',
  exit_type: 'voluntary' as ExitType,
  notes: '',
};

export default function OnboardingPage() {
  const { addToast } = useUIStore();

  const [tab, setTab] = useState<'onboarding' | 'offboarding'>('onboarding');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [offRows, setOffRows] = useState<OffboardingRow[]>([]);

  const [search, setSearch] = useState('');
  const [exitFilter, setExitFilter] = useState<'all' | ExitType>('all');

  const [showStart, setShowStart] = useState(false);
  const [startEmployee, setStartEmployee] = useState('');
  const [showOffboard, setShowOffboard] = useState(false);
  const [offForm, setOffForm] = useState({ ...EMPTY_OFFBOARD });

  /** نافذة سبب التخطّي — بديل prompt() المحظور */
  const [skipping, setSkipping] = useState<OnboardingTask | null>(null);
  const [skipReason, setSkipReason] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑩: أربعة استعلامات وتجميع في المتصفّح صارت ثلاث دوال
      const [sum, board, offs] = await Promise.all([
        onboardingLifecycleSdk.summary(),
        onboardingLifecycleSdk.board(search.trim() || null, 200),
        onboardingLifecycleSdk.offboardings({
          exitType: exitFilter === 'all' ? null : exitFilter,
          search: search.trim() || null,
          limit: 200,
        }),
      ]);
      setSummary(sum);
      setRows(board);
      setOffRows(offs);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, exitFilter]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleStart = async () => {
    if (!startEmployee) { addToast('اختر الموظف', 'warning'); return; }
    setProcessing(true);
    try {
      // ★★★ العطل ②: `ON CONFLICT` في القاعدة — الضغط مرّتين لا يُضاعف
      const n = await onboardingLifecycleSdk.start(startEmployee);
      addToast(
        n > 0 ? `أُضيفت ${n} مهمة تعريف` : 'كل المهامّ موجودة مسبقاً',
        n > 0 ? 'success' : 'info');
      setShowStart(false);
      setStartEmployee('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleTask = async (task: OnboardingTask, next: OnboardingTaskStatus) => {
    // ★ التخطّي يحتاج سبباً — القاعدة تُلزمه
    if (next === 'skipped') {
      setSkipping(task);
      setSkipReason('');
      return;
    }
    setProcessing(true);
    try {
      await onboardingLifecycleSdk.setTask(task.id, next);
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSkipConfirm = async () => {
    if (!skipping) return;
    if (skipReason.trim() === '') {
      addToast('سبب التخطّي إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      await onboardingLifecycleSdk.setTask(skipping.id, 'skipped', skipReason.trim());
      addToast('تُخطّيت المهمة', 'success');
      setSkipping(null);
      setSkipReason('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleOffboard = async () => {
    if (!offForm.employee_id) { addToast('اختر الموظف', 'warning'); return; }
    if (offForm.reason.trim() === '') {
      addToast('السبب إلزاميّ', 'warning'); return;
    }
    if (!offForm.last_working_day) {
      addToast('آخر يوم عمل إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      // ★★★ العطل ①: نداء واحد — السجلّ والتعطيل معاً في القاعدة
      await onboardingLifecycleSdk.offboard({
        employeeId: offForm.employee_id,
        lastDay: offForm.last_working_day,
        reason: offForm.reason.trim(),
        exitType: offForm.exit_type,
        notes: offForm.notes.trim() || null,
      });
      addToast('سُجِّل إنهاء الخدمة وعُطِّل الحساب', 'success');
      setShowOffboard(false);
      setOffForm({ ...EMPTY_OFFBOARD });
      setTab('offboarding');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleChecklist = async (
    rec: OffboardingRow,
    patch: { accessRevoked?: boolean; settlementDone?: boolean },
  ) => {
    setProcessing(true);
    try {
      await onboardingLifecycleSdk.updateChecklist(rec.id, patch);
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
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <UserPlus className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              التعريف وإنهاء الخدمة
            </h1>
            <p className="text-sm text-slate-500">
              استقبال الموظفين الجدد وتوديع المغادرين
            </p>
          </div>
        </div>
        <button
          onClick={() => void fetchAll()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* ═══ البطاقات ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={<ListChecks size={15} />} tone="text-slate-900"
          value={summary ? String(summary.tasksActive) : '—'}
          label="مهامّ التعريف"
          hint={summary ? `${summary.tasksMandatory} إلزاميّة` : ''}
        />
        <StatCard
          icon={<Users size={15} />} tone="text-violet-600"
          value={summary ? String(summary.inProgress) : '—'}
          label="تعريف جارٍ"
          hint={summary ? `${summary.finished} مكتمل` : ''}
        />
        {/* ★★★ NULL ≠ صفر (درس 0353) */}
        <StatCard
          icon={<Award size={15} />}
          tone={summary && summary.avgProgress !== null
            ? 'text-emerald-600' : 'text-slate-400'}
          value={summary
            ? (summary.avgProgress === null ? 'لا تعريف' : `${summary.avgProgress}%`)
            : '—'}
          label="متوسّط التقدّم"
          hint="المتخطّى يُحتسَب منجزاً"
        />
        <StatCard
          icon={<UserMinus size={15} />} tone="text-rose-600"
          value={summary ? String(summary.offboarded) : '—'}
          label="إنهاءات الخدمة"
          hint={summary && summary.pendingAccess > 0
            ? `${summary.pendingAccess} بلا سحب صلاحيات`
            : 'الصلاحيات مسحوبة'}
        />
      </div>

      {/* ★★★ العطل ①: تنبيه بالحالات الشاذّة القائمة في البيانات */}
      {summary && summary.orphanActive > 0 && (
        <div className="flex items-start gap-2 mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-red-800">
              {summary.orphanActive} سجلّ إنهاء خدمة لموظف ما زال نشطاً
            </p>
            <p className="text-red-700 mt-0.5">
              أثرٌ قديم: كان إنهاء الخدمة يُسجَّل ثم يفشل التعطيل. راجع
              السجلّات المُعلَّمة أدناه.
            </p>
          </div>
        </div>
      )}

      {/* ═══ التبويبات ═══ */}
      <div className="flex gap-2 mb-5 border-b border-slate-200">
        {([['onboarding', 'التعريف', UserPlus],
           ['offboarding', 'إنهاء الخدمة', UserMinus]] as const).map(
          ([key, label, Icon]) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 transition-colors ${
                tab === key
                  ? 'text-violet-600 border-violet-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
      </div>

      {/* ═══ البحث ═══ */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرمز…"
            className="w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        {tab === 'offboarding' && (
          <select
            value={exitFilter}
            onChange={(e) => setExitFilter(e.target.value as 'all' | ExitType)}
            aria-label="ترشيح بنوع الإنهاء"
            className="px-3 py-2.5 border border-slate-200 rounded-xl bg-white outline-none"
          >
            <option value="all">كل الأنواع</option>
            {/* ★ الأنواع الأربعة — كان العرض يفكّ ثلاثة */}
            {EXIT_TYPES.map((t) => (
              <option key={t} value={t}>{EXIT_TYPE_AR[t]}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => {
            if (tab === 'onboarding') { setStartEmployee(''); setShowStart(true); }
            else { setOffForm({ ...EMPTY_OFFBOARD }); setShowOffboard(true); }
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-xl font-semibold transition-colors shadow-sm ${
            tab === 'onboarding'
              ? 'bg-violet-600 hover:bg-violet-700'
              : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {tab === 'onboarding'
            ? <><UserPlus size={18} /> بدء تعريف</>
            : <><UserMinus size={18} /> إنهاء خدمة</>}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-violet-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل…</p>
        </div>
      ) : tab === 'onboarding' ? (
        rows.length === 0 ? (
          <EmptyState icon={<ListChecks size={40} />} text="لا توجد عمليات تعريف" />
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => (
              <OnboardingCard
                key={row.employeeId} row={row} processing={processing}
                onTask={(t, s) => void handleTask(t, s)}
              />
            ))}
          </div>
        )
      ) : (
        offRows.length === 0 ? (
          <EmptyState icon={<UserMinus size={40} />} text="لا توجد حالات إنهاء خدمة" />
        ) : (
          <div className="grid gap-3">
            {offRows.map((rec) => (
              <OffboardingCard
                key={rec.id} rec={rec} processing={processing}
                onChecklist={(p) => void handleChecklist(rec, p)}
              />
            ))}
          </div>
        )
      )}

      {/* ═══ نافذة بدء التعريف ═══ */}
      {showStart && (
        <Modal title="بدء تعريف موظف" onClose={() => setShowStart(false)}>
          <EmployeePicker value={startEmployee} onChange={setStartEmployee} />
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              تُنشأ المهامّ المفعّلة كلها في عملية واحدة. إعادة الضغط
              لا تُكرّرها — تُضيف الجديد منها فقط.
            </span>
          </div>
          <ModalActions
            onClose={() => setShowStart(false)}
            onSubmit={() => void handleStart()}
            submitLabel={processing ? 'جارٍ البدء…' : 'بدء'}
            color="purple"
          />
        </Modal>
      )}

      {/* ═══ نافذة إنهاء الخدمة ═══ */}
      {showOffboard && (
        <Modal title="إنهاء خدمة موظف" onClose={() => setShowOffboard(false)}>
          <EmployeePicker
            value={offForm.employee_id}
            onChange={(id) => setOffForm({ ...offForm, employee_id: id })}
          />
          <FormField label="آخر يوم عمل" required>
            <input
              type="date" value={offForm.last_working_day}
              onChange={(e) => setOffForm({ ...offForm, last_working_day: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500"
            />
          </FormField>
          <FormField label="نوع الإنهاء" required>
            <select
              value={offForm.exit_type}
              onChange={(e) => setOffForm({ ...offForm, exit_type: e.target.value as ExitType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {/* ★ الأربعة من الثابت — كان end_contract يظهر «تقاعد» */}
              {EXIT_TYPES.map((t) => (
                <option key={t} value={t}>{EXIT_TYPE_AR[t]}</option>
              ))}
            </select>
          </FormField>
          <FormField label="السبب" required>
            <textarea
              value={offForm.reason} rows={2}
              onChange={(e) => setOffForm({ ...offForm, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500"
            />
          </FormField>
          <FormField label="ملاحظات مقابلة الخروج">
            <textarea
              value={offForm.notes} rows={2}
              onChange={(e) => setOffForm({ ...offForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              يُسجَّل الإنهاء ويُعطَّل حساب الموظف في عملية واحدة — أو لا
              يقع شيء. والسجلّ لا يُحذف بعدها.
            </span>
          </div>
          <ModalActions
            onClose={() => setShowOffboard(false)}
            onSubmit={() => void handleOffboard()}
            submitLabel={processing ? 'جارٍ التسجيل…' : 'تأكيد'}
            color="red"
          />
        </Modal>
      )}

      {/* ═══ نافذة سبب التخطّي — بديل prompt() ═══ */}
      {skipping && (
        <Modal
          title="تخطّي مهمة"
          onClose={() => { setSkipping(null); setSkipReason(''); }}
        >
          <p className="text-sm text-slate-600">{skipping.title}</p>
          {skipping.mandatory && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              هذه مهمة <strong>إلزاميّة</strong> — التخطّي قرارٌ إداريّ
              يُسجَّل بسببه.
            </p>
          )}
          <textarea
            value={skipReason} rows={3} autoFocus
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="سبب التخطّي (إلزاميّ)"
            className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setSkipping(null); setSkipReason(''); }}
              disabled={processing}
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              تراجع
            </button>
            <button
              onClick={() => void handleSkipConfirm()}
              disabled={processing || skipReason.trim() === ''}
              className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              تأكيد التخطّي
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

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
      <div className="mx-auto text-slate-300 mb-3 w-fit">{icon}</div>
      <p className="text-slate-500">{text}</p>
    </div>
  );
}

function OnboardingCard({ row, processing, onTask }: {
  row: OnboardingRow; processing: boolean;
  onTask: (task: OnboardingTask, next: OnboardingTaskStatus) => void;
}) {
  const done = row.mandatoryLeft === 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900">{row.employeeName}</p>
            {!row.isActive && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                غير نشط
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {row.employeeCode} · {row.department}
            {row.startedAt && ` · بدأ ${fmtDate(row.startedAt)}`}
          </p>
        </div>
        <div className="text-left">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {row.progress}%
          </span>
          <p className="text-[11px] text-slate-400 mt-1">
            {row.completed} مكتملة
            {row.skipped > 0 && ` · ${row.skipped} متخطّاة`}
            {' · '}من {row.total}
          </p>
        </div>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full transition-all ${
            done ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 to-purple-500'
          }`}
          style={{ width: `${Math.min(Math.max(row.progress, 0), 100)}%` }}
        />
      </div>

      {/* ★★ مؤشّر الجاهزية الحقيقيّ: الإلزاميّ غير المُنجَز */}
      {row.mandatoryLeft > 0 ? (
        <p className="text-xs text-amber-700 mb-3 flex items-center gap-1.5">
          <AlertTriangle size={13} />
          {row.mandatoryLeft} مهمة إلزاميّة متبقّية
        </p>
      ) : (
        <p className="text-xs text-emerald-700 mb-3 flex items-center gap-1.5">
          <CheckCircle size={13} /> كل الإلزاميّ مُنجَز
        </p>
      )}

      <div className="space-y-1">
        {row.tasks.map((t) => (
          <TaskRow key={t.id} task={t} processing={processing} onTask={onTask} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, processing, onTask }: {
  task: OnboardingTask; processing: boolean;
  onTask: (task: OnboardingTask, next: OnboardingTaskStatus) => void;
}) {
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
      <button
        type="button"
        onClick={() => onTask(task, isDone ? 'pending' : 'completed')}
        disabled={processing || isSkipped}
        title={isDone ? 'تراجع' : 'إتمام'}
        className="flex-shrink-0 disabled:opacity-40"
      >
        {isDone
          ? <CheckCircle size={17} className="text-emerald-500" />
          : isSkipped
            ? <SkipForward size={17} className="text-amber-500" />
            : <Circle size={17} className="text-slate-300 hover:text-violet-400" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-sm ${
            isDone || isSkipped ? 'text-slate-400 line-through' : 'text-slate-700'
          }`}>
            {task.title}
          </span>
          {task.mandatory && (
            <span className="text-[10px] font-bold text-rose-600">إلزاميّة</span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
            ONBOARDING_TASK_STATUS_TONE[task.status]
          }`}>
            {ONBOARDING_TASK_STATUS_AR[task.status]}
          </span>
        </div>
        {/* ★ العطل ⑦: مَن أتمّ المهمة ومتى */}
        {isDone && task.completer !== '—' && (
          <p className="text-[10px] text-slate-400">
            أتمّها {task.completer} · {fmtDate(task.completedAt)}
          </p>
        )}
        {isSkipped && task.skippedReason && (
          <p className="text-[10px] text-amber-600">
            تُخطّيت: {task.skippedReason}
          </p>
        )}
      </div>

      {!isDone && !isSkipped && (
        <button
          type="button"
          onClick={() => onTask(task, 'skipped')}
          disabled={processing}
          title="تخطّي"
          className="flex-shrink-0 p-1 rounded text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors disabled:opacity-40"
        >
          <SkipForward size={14} />
        </button>
      )}
    </div>
  );
}

function OffboardingCard({ rec, processing, onChecklist }: {
  rec: OffboardingRow; processing: boolean;
  onChecklist: (patch: { accessRevoked?: boolean; settlementDone?: boolean }) => void;
}) {
  return (
    <div className={`bg-white rounded-2xl border p-4 ${
      rec.stillActive ? 'border-red-300 bg-red-50/30' : 'border-slate-200'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900">{rec.employeeName}</p>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
              exitTypeTone(rec.exitType)
            }`}>
              {/* ★ العطل ⑤: end_contract كان يظهر «تقاعد» */}
              {exitTypeLabel(rec.exitType)}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {rec.employeeCode} · {rec.department}
            {rec.conductor !== '—' && ` · نفّذه ${rec.conductor}`}
          </p>
        </div>
        <div className="text-left flex-shrink-0">
          <p className="text-sm font-semibold text-slate-700">
            {fmtDate(rec.lastDay)}
          </p>
          <p className="text-xs text-slate-400">آخر يوم عمل</p>
        </div>
      </div>

      {/* ★★★ العطل ①: كشف الحالة الشاذّة */}
      {rec.stillActive && (
        <div className="flex items-start gap-2 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            سجلُّ إنهاء خدمة والموظف <strong>ما زال نشطاً</strong> —
            أثرٌ قديم من فشل التعطيل. يحتاج مراجعة.
          </span>
        </div>
      )}

      <p className="text-sm text-slate-600 mt-2 bg-slate-50 px-3 py-2 rounded-lg">
        {rec.reason}
      </p>
      {rec.notes && (
        <p className="text-xs text-slate-500 mt-1.5 px-3">
          مقابلة الخروج: {rec.notes}
        </p>
      )}

      {/* ★ العطل ⑧: إجراءات كانت في القاعدة بلا أيّ زرّ */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <ChecklistChip
          active={rec.accessRevoked} label="سحب الصلاحيات"
          icon={<KeyRound size={13} />} disabled={processing}
          onClick={() => onChecklist({ accessRevoked: !rec.accessRevoked })}
        />
        <ChecklistChip
          active={rec.settlementDone} label="التصفية النهائية"
          icon={<Wallet size={13} />} disabled={processing}
          onClick={() => onChecklist({ settlementDone: !rec.settlementDone })}
        />
        {rec.assets.length > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
            <Package size={13} /> {rec.assets.length} عهدة
          </span>
        )}
      </div>
    </div>
  );
}

function ChecklistChip({ active, label, icon, disabled, onClick }: {
  active: boolean; label: string; icon: React.ReactNode;
  disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {active ? <CheckCircle size={13} /> : icon}
      {label}
    </button>
  );
}
