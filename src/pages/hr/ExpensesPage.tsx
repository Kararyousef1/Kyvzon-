/**
 * ExpensesPage — طلبات النفقات (HR) · migration 0363
 *
 * ★★★ أُعيدت كتابتها بعد إثبات ثمانية عشر عطلاً تشغيلياً على Postgres 17
 *     (المسبار: tools/dev/_probe_0363.sql). أخطرها:
 *
 *  ① ★★★ **طلب اعتمادٍ مجمَّدٌ إلى الأبد — والحارس صامت.**
 *     مستأجرٌ بلا `approval_rules` وموظفٌ بلا قسم ⇒ يُنشأ
 *     `hr_approval_requests` بحالة `pending` و**صفر خطوة**، فلا يظهر
 *     في أيّ صندوق موافقات ولا أحد يستطيع اعتماده. و
 *     `APPROVAL_CHAIN_BYPASS` يعدّ **الخطوات** فيبقى صامتاً.
 *     ⇒ الصفحة الآن **تكشف** المجمَّد براية حمراء وعدّاد في البطاقات.
 *  ② `tenant_id` NULL · ③/④ `employee_id` بلا FK (معدومٌ أو من شركةٍ أخرى)
 *  ⑤ `amount` صفرٌ وسالب · ⑥ تاريخٌ بعد 400 يوم · ⑦ فئةٌ حرّة بلا واجهة
 *  ⑧ ★★★ **رفضٌ بلا سبب مسموح في القاعدة** (الصفحة تُلزم والقاعدة لا)
 *  ⑨ ★★★ **`approved_by`/`approved_at` لا يُملآن** ⇒ معتمَدةٌ بلا معتمِد
 *  ⑩ ★★★ **`paid_at` عمودٌ ميت** — لا زرّ دفع، و«مدفوع» فلترٌ لا يمتلئ
 *  ⑪ `cancelled` مفردةٌ بلا زرّ ومفقودةٌ من شريط الترشيح
 *  ⑫ ★★★ **الحذف النهائيّ مسموح** بدور `authenticated` حقيقيّ
 *  ⑬ `receipt_url` بلا رفع ولا عرض · ⑭ جلب كل الموظفين و`Map` يدويّ
 *  ⑮ `findAll` بلا حدّ · ⑯ صفر دالة في المنظومة
 *  ⑰ ★★★ **الموظف لا يستطيع إنشاء نفقته** (سياسة INSERT تشترط staff)
 *     والصفحة **بلا زرّ إنشاء**: لوحةُ مراجعةٍ لطلباتٍ لا سبيل لتقديمها.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `expenseSdk`.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, Loader2, CheckCircle, XCircle, Plus, Wallet, AlertTriangle,
  Clock, Ban, FileText, Search, Timer,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { formatCurrency } from '../../utils/payrollUtils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  expenseSdk, EXPENSE_STATES, EXPENSE_CATEGORIES,
  expenseStateLabel, expenseStateTone, expenseCategoryLabel,
} from '../../services/sdk';
import type {
  ExpenseRow, ExpenseSummary, ExpenseState, ExpenseCategory,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

const EMPTY_FORM = {
  title: '', description: '', amount: '',
  category: 'general' as ExpenseCategory,
  expenseDate: '', receiptUrl: '', employeeId: '',
};

export default function ExpensesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseState>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExpenseRow | null>(null);
  const [rejecting, setRejecting] = useState<ExpenseRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelling, setCancelling] = useState<ExpenseRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑭: استعلامٌ واحد بدل جلب كل الموظفين وبناء Map
      const [board, sum] = await Promise.all([
        expenseSdk.board(
          statusFilter === 'all' ? null : statusFilter,
          categoryFilter === 'all' ? null : categoryFilter,
          200,
        ),
        expenseSdk.summary().catch(() => null),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, statusFilter, categoryFilter]);

  useEffect(() => { void load(); }, [load]);

  /** ★★★ العطل ⑰: الموظف يُقدّم نفقته — لم يكن هناك زرّ إنشاء إطلاقاً */
  const handleCreate = async () => {
    if (!form.title.trim()) { addToast('العنوان مطلوب', 'warning'); return; }
    if (!form.description.trim()) { addToast('الوصف مطلوب', 'warning'); return; }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('المبلغ يجب أن يكون موجباً', 'warning');
      return;
    }
    setSaving(true);
    try {
      await expenseSdk.submit({
        title:       form.title.trim(),
        description: form.description.trim(),
        amount,
        category:    form.category,
        expenseDate: form.expenseDate || null,
        receiptUrl:  form.receiptUrl.trim() || null,
        employeeId:  form.employeeId || null,
      });
      addToast('تم تقديم طلب النفقة', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (row: ExpenseRow) => {
    setBusyId(row.id);
    try {
      await expenseSdk.decide(row.id, 'approved');
      addToast('تمت الموافقة — وسُجّل المعتمِد ووقته', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * الرفض مع سبب.
   *
   * ★ العطل ⑧: القاعدة نفسها تُلزم بالسبب الآن
   *   (`expense_requests_rejection_chk` + `EXPENSE_REJECTION_REASON_REQUIRED`)
   *   — لم يكن الإلزام إلا في الواجهة.
   */
  const handleReject = async () => {
    if (!rejecting) return;
    if (rejectReason.trim() === '') { addToast('سبب الرفض مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await expenseSdk.decide(rejecting.id, 'rejected', rejectReason.trim());
      addToast('تم الرفض مع تسجيل السبب', 'success');
      setRejecting(null);
      setRejectReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★ العطل ⑪: الإلغاء — مفردةٌ كانت في القيد بلا زرّ */
  const handleCancel = async () => {
    if (!cancelling) return;
    setSaving(true);
    try {
      await expenseSdk.decide(cancelling.id, 'cancelled');
      addToast('أُلغي الطلب (لم يُحذف)', 'success');
      setCancelling(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★★ العطل ⑩: الصرف الذي لم يكن موجوداً */
  const handlePay = async (row: ExpenseRow) => {
    setBusyId(row.id);
    try {
      await expenseSdk.markPaid(row.id);
      addToast('تم الصرف — وسُجّل وقته', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        r.title.toLowerCase().includes(q)
        || r.employeeName.toLowerCase().includes(q)
        || r.employeeCode.toLowerCase().includes(q))
    : rows;

  const fmtDate = (d: string | null): string =>
    d ? format(new Date(d), 'd MMM yyyy', { locale: ar }) : '—';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Receipt className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">طلبات النفقات</h1>
            <p className="text-sm text-slate-500">التقديم والاعتماد والصرف</p>
          </div>
        </div>
        {/* ★★★ العطل ⑰: زرٌّ لم يكن موجوداً */}
        <button
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
        >
          <Plus size={18} /> طلب نفقة
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="بانتظار الموافقة" value={formatCurrency(summary.amtPending)}
                  sub={`${summary.pending} طلب`} tone="amber" icon={<Clock size={16} />} />
            <Stat label="موافق عليه" value={formatCurrency(summary.amtApproved)}
                  sub={`${summary.approved} طلب`} tone="emerald" icon={<CheckCircle size={16} />} />
            <Stat label="مدفوع" value={formatCurrency(summary.amtPaid)}
                  sub={`${summary.paid} طلب`} tone="indigo" icon={<Wallet size={16} />} />
            <Stat label="مرفوض" value={String(summary.rejected)}
                  sub="طلب" tone="red" icon={<XCircle size={16} />} />
            <Stat label="ملغى" value={String(summary.cancelled)}
                  sub="طلب" tone="slate" icon={<Ban size={16} />} />
          </div>

          {/* ★★★ العطل ①: الرقم الذي يكشف الطلبات المجمَّدة */}
          {summary.stalled > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 leading-relaxed">
                <b>{summary.stalled}</b> طلباً <b>مجمَّداً</b>: له سلسلة اعتماد
                معلَّقة <b>بصفر خطوة</b> — لا يظهر في أيّ صندوق موافقات ولا أحد
                يستطيع اعتماده. السبب أن الموظف بلا قسم أو الشركة بلا قواعد
                اعتماد.
              </p>
            </div>
          )}
          {summary.awaitingPay > 0 && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <Wallet size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-emerald-800 leading-relaxed">
                <b>{summary.awaitingPay}</b> طلباً معتمَداً <b>ينتظر الصرف</b>.
              </p>
            </div>
          )}
          {summary.noReceipt > 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <FileText size={13} className="text-slate-400" />
              <b>{summary.noReceipt}</b> طلباً بلا إيصال مرفق.
            </p>
          )}
        </>
      )}

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالعنوان أو الموظف أو الرمز…"
          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-pink-400"
        />
      </div>

      {/* ★ العطل ⑪: المفردات الخمس كاملة — cancelled كان مفقوداً */}
      <div className="flex gap-2 flex-wrap">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="الكل" />
        {EXPENSE_STATES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
                label={expenseStateLabel(s)} />
        ))}
      </div>

      {/* ★ العطل ⑦: الفئة صارت مرئيّة وقابلة للترشيح */}
      <div className="flex gap-2 flex-wrap">
        <Chip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}
              label="كل الفئات" tone="slate" />
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}
                label={expenseCategoryLabel(c)} tone="slate" />
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-pink-500" size={40} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد طلبات نفقات مطابقة</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((row) => (
            <div key={row.id}
              className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-shadow ${
                row.isStalled ? 'border-red-300' : 'border-slate-200'
              }`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    onClick={() => setDetail(row)}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${expenseStateTone(row.status)}`}
                  >
                    <Receipt size={20} />
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setDetail(row)}
                        className="font-bold text-slate-900 truncate hover:text-pink-700">
                        {row.title}
                      </button>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${expenseStateTone(row.status)}`}>
                        {expenseStateLabel(row.status)}
                      </span>
                      {/* ★★★ العطل ①: الراية التي تكشف التجمّد */}
                      {row.isStalled && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                          <Timer size={11} /> مجمَّد — بلا خطوة اعتماد
                        </span>
                      )}
                      {row.openSteps > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                          {row.openSteps} خطوة اعتماد
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {row.employeeName}
                      <span className="text-slate-400"> · {row.employeeCode} · {row.department}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {expenseCategoryLabel(row.category)} · {fmtDate(row.expenseDate)}
                      {row.ageDays > 0 && ` · منذ ${row.ageDays} يوم`}
                      {row.receiptUrl ? ' · بإيصال' : ' · بلا إيصال'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="font-bold text-slate-900">{formatCurrency(row.amount)}</p>
                  <div className="flex gap-1">
                    {row.status === 'pending' && (
                      <>
                        <button
                          onClick={() => void handleApprove(row)}
                          disabled={busyId === row.id || row.openSteps > 0}
                          title={row.openSteps > 0
                            ? 'له سلسلة اعتماد مفتوحة — استعمل صندوق الموافقات'
                            : 'موافقة'}
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                        >
                          {busyId === row.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <CheckCircle size={16} />}
                        </button>
                        <button
                          onClick={() => { setRejecting(row); setRejectReason(''); }}
                          disabled={busyId === row.id || row.openSteps > 0}
                          title="رفض"
                          className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40"
                        >
                          <XCircle size={16} />
                        </button>
                        <button
                          onClick={() => setCancelling(row)}
                          disabled={busyId === row.id}
                          title="إلغاء (لا حذف)"
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                        >
                          <Ban size={16} />
                        </button>
                      </>
                    )}
                    {/* ★★★ العطل ⑩: زرّ الصرف الذي لم يكن موجوداً */}
                    {row.status === 'approved' && (
                      <button
                        onClick={() => void handlePay(row)}
                        disabled={busyId === row.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-40"
                      >
                        {busyId === row.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Wallet size={13} />} صرف
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────── طلب نفقة ─────────────── */}
      {showCreate && (
        <Modal title="طلب نفقة" onClose={() => setShowCreate(false)}>
          <FormField label="العنوان" required>
            <input value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500" />
          </FormField>
          <FormField label="الوصف" required>
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="المبلغ" required>
            <input type="number" min={1} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="الفئة" required>
            <select value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{expenseCategoryLabel(c)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="تاريخ المصروف">
            <input type="date" value={form.expenseDate}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mt-1">
              تاريخٌ في المستقبل مرفوض — المصروف يقع ثم يُطالَب به.
            </p>
          </FormField>
          <FormField label="رابط الإيصال">
            <input value={form.receiptUrl}
              onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          {/* ★ staff وحده يُقدّم نيابةً — والقاعدة تحرس ذلك */}
          <EmployeePicker
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <p className="text-xs text-slate-600 bg-pink-50 border border-pink-200 rounded-lg p-2.5 leading-relaxed">
            اتركه فارغاً لتقديم النفقة <b>باسمك</b>. الموارد البشرية وحدها
            تُقدّم نيابةً عن غيرها.
          </p>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={() => { if (!saving) void handleCreate(); }}
            submitLabel={saving ? 'جارٍ التقديم…' : 'تقديم'}
            color="red"
          />
        </Modal>
      )}

      {/* ─────────────── التفاصيل ─────────────── */}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <DetailRow label="الموظف" value={`${detail.employeeName} · ${detail.employeeCode}`} />
          <DetailRow label="القسم" value={detail.department} />
          <DetailRow label="المبلغ" value={formatCurrency(detail.amount)} />
          <DetailRow label="الفئة" value={expenseCategoryLabel(detail.category)} />
          <DetailRow label="الوصف" value={detail.description} />
          <DetailRow label="تاريخ المصروف" value={fmtDate(detail.expenseDate)} />
          <DetailRow label="الحالة" value={expenseStateLabel(detail.status)} />
          {/* ★★★ العطل ⑨: المعتمِد ووقته — كانا فارغَين دائماً */}
          <DetailRow label="اعتمدها" value={detail.approverName} />
          <DetailRow label="وقت الاعتماد" value={fmtDate(detail.approvedAt)} />
          <DetailRow label="وقت الصرف" value={fmtDate(detail.paidAt)} />
          <DetailRow label="سبب الرفض" value={detail.rejectionReason ?? undefined} />
          <DetailRow label="الإيصال" value={detail.receiptUrl ?? undefined} />

          {detail.isStalled && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 leading-relaxed">
              <b>هذا الطلب مجمَّد.</b> له سلسلة اعتماد معلَّقة بصفر خطوة —
              لن يظهر في صندوق موافقات أحد. عالِج السبب: أسنِد قسماً
              للموظف أو عرّف قواعد الاعتماد، ثم أعد إنشاء السلسلة.
            </p>
          )}
        </Modal>
      )}

      {/* ★ سبب الرفض — Modal لا prompt() (سياسة المنصة) */}
      {rejecting && (
        <Modal title={`رفض: ${rejecting.title}`} onClose={() => setRejecting(null)}>
          <p className="text-sm text-slate-600">
            {rejecting.employeeName} — {formatCurrency(rejecting.amount)}
          </p>
          <FormField label="سبب الرفض" required>
            <textarea value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3} autoFocus
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          </FormField>
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            الرفض بلا سبب مرفوض <b>في القاعدة نفسها</b> — والسبب يبقى في
            السجلّ ولا يُحذف.
          </p>
          <ModalActions
            onClose={() => setRejecting(null)}
            onSubmit={() => { if (!saving) void handleReject(); }}
            submitLabel={saving ? 'جارٍ…' : 'تأكيد الرفض'}
            color="red"
          />
        </Modal>
      )}

      {/* ★ الإلغاء — بديل الحذف الممنوع في القاعدة */}
      {cancelling && (
        <Modal title="إلغاء الطلب" onClose={() => setCancelling(null)}>
          <p className="text-sm text-slate-700">
            إلغاء <b>«{cancelling.title}»</b> — {formatCurrency(cancelling.amount)}؟
          </p>
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
            الطلب يُلغى ولا يُحذف: المبلغ والإيصال وسبب القرار سجلٌّ ماليّ
            قد يُطلب لاحقاً. الحذف النهائيّ ممنوع في القاعدة.
          </p>
          <ModalActions
            onClose={() => setCancelling(null)}
            onSubmit={() => { if (!saving) void handleCancel(); }}
            submitLabel={saving ? 'جارٍ…' : 'إلغاء الطلب'}
            color="orange"
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────

function Stat({ label, value, sub, tone, icon }: {
  label: string; value: string; sub: string; tone: string; icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}<span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-lg font-extrabold truncate">{value}</p>
      <p className="text-[11px] opacity-70">{sub}</p>
    </div>
  );
}

function Chip({ active, onClick, label, tone = 'pink' }: {
  active: boolean; onClick: () => void; label: string; tone?: string;
}) {
  const on = tone === 'slate' ? 'bg-slate-700 text-white' : 'bg-pink-600 text-white';
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active ? on : 'bg-white text-slate-600 border border-slate-200 hover:border-pink-300'
      }`}>
      {label}
    </button>
  );
}
