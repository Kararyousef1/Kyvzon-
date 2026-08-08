/**
 * EmployeeContractsPage — عقود الموظفين (HR) · migration 0364
 *
 * ★★★ أُعيدت كتابتها بعد إثبات سبعة عشر عطلاً تشغيلياً على Postgres 17
 *     (المسبار: tools/dev/_probe_0364.sql). أخطرها:
 *
 *  ① ★★★ **شرطٌ ميّتٌ في سياسة القراءة**: `employee_id = auth.uid()`
 *     — `employees.id ≠ auth.users.id` وصفر صفّ يطابق `id = user_id`.
 *     شيفرةٌ ميتة في جدارٍ أمنيّ تُوحي بأمانٍ مزدوج غير موجود.
 *  ②/③ **`employee_id` بلا FK** — معدومٌ أو من **شركةٍ أخرى** يُقبل.
 *  ④ **`end_date` قبل `start_date`** — عقدٌ ينتهي قبل أن يبدأ بـ400 يوم.
 *  ⑤ ★★★ **ثلاثة عقودٍ نشطة للموظف نفسه** — أيُّها النافذ؟ والراتب
 *     المرجعيّ ثلاثة أرقام متناقضة.
 *  ⑥ **«محدد المدة» بلا نهاية** — تناقضٌ في التسمية نفسها.
 *  ⑦ ★★★ **المنتهي يبقى «نشطاً»** — عقدان انتهيا منذ 400 يوم وحالتهما
 *     `active`، وصفر دالة في المنظومة تُحدّث الحالة. فبطاقة «عقود
 *     نشطة» تعدّ عقوداً منتهية.
 *  ⑧ `renewal_notice_days = -30` يُقبل ⇒ شرط التنبيه عبث.
 *  ⑨ راتبٌ سالب وعملةٌ بلا قيد.
 *  ⑩ ★★★ **الحذف النهائيّ مسموح** — عقد العمل وثيقةٌ قانونية.
 *  ⑪ ★★★ **التجديد يكتب فوق القديم** — لا `renewed_from` ولا
 *     `previous_end_date` ولا `renewal_count` ولا جدول تاريخ.
 *     عقدٌ جُدِّد خمس مرّات يبدو عقداً واحداً طويلاً.
 *  ⑫ **الإنهاء بلا سبب ولا تاريخ.**
 *  ⑬ **العقد جزيرةٌ معزولة** — لا ربط بالتوظيف (0362) ولا بإنهاء
 *     الخدمة (0359).
 *  ⑮ ★★★ **الحساب بتوقيت المتصفّح**: `differenceInCalendarDays`.
 *     عند 01:30 بغداد يعطي **يوماً زائداً** لكل عقد.
 *  ⑯ جلب **كل** الموظفين و`Map` يدويّ وترتيبٌ عشوائيّ.
 *  ⑰ `created_by` لا يُملأ · ⑱ `contract_number` يقبل الفراغ.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `contractSdk`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, FileText, Loader2, Plus, Search, ShieldCheck,
  AlertTriangle, RefreshCw, XOctagon, History, UserX, Wallet,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  contractSdk, CONTRACT_TYPES, CONTRACT_STATES, CONTRACT_CURRENCIES,
  contractTypeLabel, contractStateLabel, contractStateTone,
  contractExpiryLabel, contractExpiryTone, needsEndDate,
} from '../../services/sdk';
import type {
  ContractRow, ContractSummary, ContractType, ContractState, ContractCurrency,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

const EMPTY_FORM = {
  employeeId: '', contractNumber: '',
  contractType: 'permanent' as ContractType,
  title: '', startDate: '', endDate: '', noticeDays: 30,
  salaryAmount: '', salaryCurrency: 'IQD' as ContractCurrency,
  documentUrl: '', notes: '', status: 'active' as ContractState,
};

export default function EmployeeContractsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ContractState>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ContractType>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContractRow | null>(null);
  const [renewing, setRenewing] = useState<ContractRow | null>(null);
  const [renewEnd, setRenewEnd] = useState('');
  const [renewSalary, setRenewSalary] = useState('');
  const [renewNumber, setRenewNumber] = useState('');
  const [terminating, setTerminating] = useState<ContractRow | null>(null);
  const [terminateReason, setTerminateReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑯: استعلامٌ واحد بدل جلب كل الموظفين وبناء Map
      const [board, sum] = await Promise.all([
        contractSdk.board(
          statusFilter === 'all' ? null : statusFilter,
          typeFilter === 'all' ? null : typeFilter,
          200,
        ),
        contractSdk.summary().catch(() => null),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!form.employeeId) { addToast('اختر الموظف', 'warning'); return; }
    // ★ العطل ⑥: نُخبر قبل أن ترفض القاعدة
    if (needsEndDate(form.contractType) && !form.endDate) {
      addToast(`«${contractTypeLabel(form.contractType)}» يحتاج تاريخ نهاية`, 'warning');
      return;
    }
    // ★ العطل ④
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      addToast('تاريخ النهاية قبل البداية', 'warning');
      return;
    }
    setSaving(true);
    try {
      await contractSdk.save({
        employeeId:     form.employeeId,
        contractType:   form.contractType,
        contractNumber: form.contractNumber.trim() || null,
        title:          form.title.trim() || null,
        startDate:      form.startDate || null,
        endDate:        form.endDate || null,
        noticeDays:     form.noticeDays,
        salaryAmount:   form.salaryAmount === '' ? null : Number(form.salaryAmount),
        salaryCurrency: form.salaryCurrency,
        documentUrl:    form.documentUrl.trim() || null,
        notes:          form.notes.trim() || null,
        status:         form.status,
      });
      addToast('تم حفظ العقد', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★★ العطل ⑦: الترحيل الذي لم يكن موجوداً */
  const handleExpireDue = async () => {
    setBusyId('expire');
    try {
      const n = await contractSdk.expireDue();
      addToast(n === 0 ? 'لا عقود مستحقّة للترحيل' : `رُحّل ${n} عقداً إلى «منتهٍ»`, 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑪: التجديد يُنشئ عقداً جديداً ويحفظ السلسلة */
  const handleRenew = async () => {
    if (!renewing) return;
    if (!renewEnd) { addToast('تاريخ النهاية الجديد مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await contractSdk.renew(
        renewing.id, renewEnd,
        renewSalary === '' ? null : Number(renewSalary),
        renewNumber.trim() || null,
      );
      addToast('تم التجديد — والعقد القديم محفوظ في السلسلة', 'success');
      setRenewing(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★ العطل ⑫: الإنهاء بسببٍ إلزاميّ */
  const handleTerminate = async () => {
    if (!terminating) return;
    if (!terminateReason.trim()) { addToast('سبب الإنهاء مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await contractSdk.terminate(terminating.id, terminateReason.trim());
      addToast('أُنهي العقد مع تسجيل السبب', 'success');
      setTerminating(null);
      setTerminateReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        r.employeeName.toLowerCase().includes(q)
        || r.employeeCode.toLowerCase().includes(q)
        || r.contractNumber.toLowerCase().includes(q)
        || r.title.toLowerCase().includes(q))
    : rows;

  const fmtDate = (d: string | null): string =>
    d ? format(new Date(d), 'd MMM yyyy', { locale: ar }) : '—';
  const fmtMoney = (n: number | null, c: string): string =>
    n == null ? '—' : `${new Intl.NumberFormat('ar-IQ').format(n)} ${c}`;

  return (
    <div className="space-y-5 animate-fade-in p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">HR Contracts</p>
          <h2 className="text-2xl font-extrabold mt-1">عقود الموظفين</h2>
          <p className="text-white/75 mt-2 text-sm">
            العقود وتجديدها وإنهاؤها — والمدد محسوبةٌ بتوقيت بغداد.
          </p>
        </div>
        <div className="flex gap-2">
          {/* ★★★ العطل ⑦: زرٌّ لم يكن موجوداً */}
          <button
            onClick={() => void handleExpireDue()}
            disabled={busyId === 'expire'}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold transition-colors disabled:opacity-50"
          >
            {busyId === 'expire'
              ? <Loader2 size={18} className="animate-spin" />
              : <RefreshCw size={18} />} ترحيل المنتهية
          </button>
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
            className="flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 rounded-xl px-4 py-2 font-bold transition-colors"
          >
            <Plus size={18} /> عقد جديد
          </button>
        </div>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="الإجمالي" value={summary.total} tone="slate" icon={<FileText size={16} />} />
            <Stat label="نشطة" value={summary.active} tone="emerald" icon={<ShieldCheck size={16} />} />
            <Stat label="تقارب الانتهاء" value={summary.expiring} tone="amber" icon={<CalendarClock size={16} />} />
            <Stat label="منتهية" value={summary.expired} tone="red" icon={<XOctagon size={16} />} />
            <Stat label="مُنهاة" value={summary.terminated} tone="orange" icon={<UserX size={16} />} />
          </div>

          {/* ★★★ العطل ⑦: التناقض القائم في البيانات */}
          {summary.stale > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 leading-relaxed">
                <b>{summary.stale}</b> عقداً حالته <b>«نشط»</b> وقد <b>انتهى فعلاً</b>.
                لم يكن في المنظومة أيُّ مسارٍ يُحدّث الحالة — اضغط
                «ترحيل المنتهية» لتصحيحها.
              </p>
            </div>
          )}
          {summary.uncovered > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <UserX size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 leading-relaxed">
                <b>{summary.uncovered}</b> موظفاً نشطاً <b>بلا عقدٍ نشط</b>.
              </p>
            </div>
          )}
          {summary.noDocument > 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <FileText size={13} className="text-slate-400" />
              <b>{summary.noDocument}</b> عقداً نشطاً بلا ملفٍ مرفق.
            </p>
          )}
        </>
      )}

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالموظف أو رقم العقد أو المسمّى…"
          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="كل الحالات" />
        {CONTRACT_STATES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
                label={contractStateLabel(s)} />
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}
              label="كل الأنواع" tone="slate" />
        {CONTRACT_TYPES.map((t) => (
          <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}
                label={contractTypeLabel(t)} tone="slate" />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-emerald-600" size={36} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">
          لا توجد عقود مطابقة
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setDetail(c)}
                      className="font-bold text-slate-900 hover:text-emerald-700">
                      {c.employeeName}
                    </button>
                    <span className="text-xs text-slate-400">{c.employeeCode}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${contractStateTone(c.status)}`}>
                      {contractStateLabel(c.status)}
                    </span>
                    {/* ★★★ العطل ⑮: الحالة محسوبةٌ بتوقيت بغداد */}
                    {c.expiryState !== 'open_ended' && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${contractExpiryTone(c.expiryState)}`}>
                        {contractExpiryLabel(c.expiryState)}
                      </span>
                    )}
                    {/* ★★ العطل ⑪: سلسلة التجديد */}
                    {c.renewalCount > 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
                        <History size={11} /> تجديد {c.renewalCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {contractTypeLabel(c.contractType)} · {c.contractNumber} · {c.department}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    من {fmtDate(c.startDate)}
                    {c.endDate ? ` إلى ${fmtDate(c.endDate)}` : ' — بلا نهاية'}
                    {/* ★ NULL = بلا نهاية لا صفر (درس 0353) */}
                    {c.daysLeft != null && (
                      <span className={c.daysLeft < 0 ? 'text-red-600 font-semibold' : ''}>
                        {' '}({c.daysLeft < 0
                          ? `منذ ${Math.abs(c.daysLeft)} يوم`
                          : `بعد ${c.daysLeft} يوم`})
                      </span>
                    )}
                    {c.salaryAmount != null && (
                      <> · <Wallet size={11} className="inline" />{' '}
                        {fmtMoney(c.salaryAmount, c.salaryCurrency)}</>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {(c.status === 'active' || c.status === 'expired') && (
                    <button
                      onClick={() => {
                        setRenewing(c); setRenewEnd(''); setRenewSalary(''); setRenewNumber('');
                      }}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100"
                    >
                      <RefreshCw size={13} /> تجديد
                    </button>
                  )}
                  {c.status !== 'terminated' && (
                    <button
                      onClick={() => { setTerminating(c); setTerminateReason(''); }}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-orange-50 text-orange-700 text-xs font-bold hover:bg-orange-100"
                    >
                      <XOctagon size={13} /> إنهاء
                    </button>
                  )}
                  <button onClick={() => setDetail(c)}
                    className="px-3 py-2 rounded-xl bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100">
                    التفاصيل
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────── عقد جديد ─────────────── */}
      {showCreate && (
        <Modal title="عقد موظف جديد" onClose={() => setShowCreate(false)}>
          <EmployeePicker
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <FormField label="رقم العقد">
            <input value={form.contractNumber}
              onChange={(e) => setForm({ ...form, contractNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="نوع العقد" required>
            <select value={form.contractType}
              onChange={(e) => setForm({ ...form, contractType: e.target.value as ContractType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>{contractTypeLabel(t)}</option>
              ))}
            </select>
            {/* ★ العطل ⑥: نُخبر بالقاعدة قبل الاصطدام بها */}
            {needsEndDate(form.contractType) && (
              <p className="text-xs text-amber-700 mt-1">
                «{contractTypeLabel(form.contractType)}» يُلزم بتاريخ نهاية.
              </p>
            )}
          </FormField>
          <FormField label="المسمّى">
            <input value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ البداية">
              <input type="date" value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
            <FormField label="تاريخ النهاية" required={needsEndDate(form.contractType)}>
              <input type="date" value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
          </div>
          <FormField label="التنبيه قبل الانتهاء (أيام)" required>
            <input type="number" min={1} max={365} value={form.noticeDays}
              onChange={(e) => setForm({ ...form, noticeDays: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mt-1">بين 1 و365 — والقاعدة تحرس ذلك.</p>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الراتب">
              <input type="number" min={1} value={form.salaryAmount}
                onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
            <FormField label="العملة">
              <select value={form.salaryCurrency}
                onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value as ContractCurrency })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                {CONTRACT_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="رابط ملف العقد">
            <input value={form.documentUrl}
              onChange={(e) => setForm({ ...form, documentUrl: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="ملاحظات">
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="الحالة" required>
            <select value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ContractState })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {CONTRACT_STATES.map((s) => (
                <option key={s} value={s}>{contractStateLabel(s)}</option>
              ))}
            </select>
            {/* ★★★ العطل ⑤ */}
            <p className="text-xs text-slate-400 mt-1">
              للموظف <b>عقدٌ نشطٌ واحد</b> فقط — جدّد القائم أو أنهِه أولاً.
            </p>
          </FormField>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={() => { if (!saving) void handleCreate(); }}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'حفظ'}
            color="emerald"
          />
        </Modal>
      )}

      {/* ─────────────── التفاصيل ─────────────── */}
      {detail && (
        <Modal title={`عقد ${detail.employeeName}`} onClose={() => setDetail(null)}>
          <DetailRow label="الموظف" value={`${detail.employeeName} · ${detail.employeeCode}`} />
          <DetailRow label="القسم" value={detail.department} />
          <DetailRow label="رقم العقد" value={detail.contractNumber} />
          <DetailRow label="النوع" value={contractTypeLabel(detail.contractType)} />
          <DetailRow label="المسمّى" value={detail.title} />
          <DetailRow label="الحالة" value={contractStateLabel(detail.status)} />
          <DetailRow label="البداية" value={fmtDate(detail.startDate)} />
          <DetailRow
            label="النهاية"
            value={detail.endDate
              ? `${fmtDate(detail.endDate)} — ${contractExpiryLabel(detail.expiryState)}`
              : 'بلا نهاية'}
          />
          <DetailRow label="التنبيه قبل" value={`${detail.noticeDays} يوم`} />
          <DetailRow
            label="الراتب"
            value={fmtMoney(detail.salaryAmount, detail.salaryCurrency)}
          />
          {/* ★★ العطل ⑪: سلسلة التجديد */}
          <DetailRow label="عدد التجديدات" value={String(detail.renewalCount)} />
          <DetailRow label="نهاية العقد السابق" value={fmtDate(detail.previousEnd)} />
          {/* ★★ العطل ⑫ */}
          <DetailRow label="تاريخ الإنهاء" value={fmtDate(detail.terminatedAt)} />
          <DetailRow label="سبب الإنهاء" value={detail.terminationReason ?? undefined} />
          {/* ★ العطل ⑰ */}
          <DetailRow label="أنشأه" value={detail.creatorName} />
          <DetailRow label="ملاحظات" value={detail.notes ?? undefined} />
          {detail.documentUrl && (
            <a href={detail.documentUrl} target="_blank" rel="noreferrer"
              className="block text-center text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl py-2 mt-2">
              فتح ملف العقد
            </a>
          )}
        </Modal>
      )}

      {/* ─────────────── التجديد ─────────────── */}
      {renewing && (
        <Modal title={`تجديد عقد ${renewing.employeeName}`} onClose={() => setRenewing(null)}>
          <DetailRow label="النهاية الحالية" value={fmtDate(renewing.endDate)} />
          <DetailRow label="الراتب الحالي"
            value={fmtMoney(renewing.salaryAmount, renewing.salaryCurrency)} />
          <FormField label="النهاية الجديدة" required>
            <input type="date" value={renewEnd}
              onChange={(e) => setRenewEnd(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mt-1">
              يجب أن تكون <b>بعد</b> النهاية الحالية وليست في الماضي.
            </p>
          </FormField>
          <FormField label="الراتب الجديد (اتركه فارغاً للإبقاء)">
            <input type="number" min={1} value={renewSalary}
              onChange={(e) => setRenewSalary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="رقم العقد الجديد">
            <input value={renewNumber}
              onChange={(e) => setRenewNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          {/* ★★★ العطل ⑪ */}
          <p className="text-xs text-slate-700 bg-indigo-50 border border-indigo-200 rounded-xl p-3 leading-relaxed">
            التجديد <b>يُنشئ عقداً جديداً</b> ويحفظ القديم في السلسلة
            (نهايته الأصلية وعدد التجديدات). لا يُكتب فوق القديم —
            فتاريخ العقود يبقى كاملاً.
          </p>
          <ModalActions
            onClose={() => setRenewing(null)}
            onSubmit={() => { if (!saving) void handleRenew(); }}
            submitLabel={saving ? 'جارٍ التجديد…' : 'تجديد'}
            color="blue"
          />
        </Modal>
      )}

      {/* ─────────────── الإنهاء ─────────────── */}
      {terminating && (
        <Modal title={`إنهاء عقد ${terminating.employeeName}`} onClose={() => setTerminating(null)}>
          <DetailRow label="رقم العقد" value={terminating.contractNumber} />
          <DetailRow label="النوع" value={contractTypeLabel(terminating.contractType)} />
          <FormField label="سبب الإنهاء" required>
            <textarea value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              rows={3} autoFocus
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </FormField>
          {/* ★★ العطلان ⑫/⑩ */}
          <p className="text-xs text-slate-700 bg-orange-50 border border-orange-200 rounded-xl p-3 leading-relaxed">
            الإنهاء بلا سبب <b>مرفوض في القاعدة نفسها</b>، وتاريخه
            يُسجَّل تلقائياً. والعقد <b>لا يُحذف أبداً</b> — وثيقةٌ
            قانونية قد تُطلب بعد سنوات.
          </p>
          <ModalActions
            onClose={() => setTerminating(null)}
            onSubmit={() => { if (!saving) void handleTerminate(); }}
            submitLabel={saving ? 'جارٍ…' : 'تأكيد الإنهاء'}
            color="orange"
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────

function Stat({ label, value, tone, icon }: {
  label: string; value: number; tone: string; icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    orange:  'bg-orange-50 text-orange-700 border-orange-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}<span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function Chip({ active, onClick, label, tone = 'emerald' }: {
  active: boolean; onClick: () => void; label: string; tone?: string;
}) {
  const on = tone === 'slate' ? 'bg-slate-700 text-white' : 'bg-emerald-600 text-white';
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active ? on : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
      }`}>
      {label}
    </button>
  );
}
