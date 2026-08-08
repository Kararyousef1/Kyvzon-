/**
 * ════════════════════════════════════════════════════════════════
 *  LoansPage — السلف والقروض (HR) · أُعيدت كتابتها في المرحلة 4
 *
 *  ★★★ ما كان معطوباً — كلّه مقيس على Postgres قبل الكتابة
 *      (المسابر: tools/dev/_probe_0355*.sql · التفاصيل في
 *       supabase/migrations/0355_employee_loans_lifecycle.sql):
 *
 *  ① مفردتان مختلَقتان `'active'` و`'completed'` ترفضهما القاعدة
 *     ⇒ ثلاث بطاقات من أربع تعرض صفراً أبداً، وشريط التقدّم لا يظهر
 *       لأيّ سلفة، وزرّا فلترة يعرضان فراغاً دائماً.
 *  ② لا شيء كان يُسدّد قسطاً ⇒ سلفة أبدية تُخصم كل شهر بلا نهاية،
 *     و«المدفوع: 0/12 شهر» بعد سنتين من الخصم.
 *  ③ `setMonth` يقفز 31 يناير إلى 3 مارس.
 *  ④ زرّ «موافقة» يرمي APPROVAL_CHAIN_BYPASS لكل سلفة أنشأها موظف.
 *  ⑤ لا سلسلة اعتماد لسلف HR — باب خلفيّ للمبالغ الكبيرة.
 *  ⑥ `start_date` يُجمع في النموذج ولا يُمرَّر، ولا حقل إدخال له.
 *  ⑦ `amount / 0` = Infinity ⇒ قسط صفر.
 *  ⑧ استعلامان بلا حدّ + ربط في المتصفّح.
 *  ⑨ لا سجلّ تدقيق لأي تسديد.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `loanService`.
 *  ★ المكوّنات المشتركة (Modal · FormField · ModalActions ·
 *    EmployeePicker · DetailRow) تبقى مُصدَّرة من هنا: تسع صفحات
 *    تستوردها منها.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard, Plus, Loader2, CheckCircle, XCircle, Eye, X,
  ShieldAlert, History, Wallet, TrendingDown, Ban, RefreshCw,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  loanService, employeeService,
  LOAN_STATUSES, LOAN_STATUS_AR, LOAN_STATUS_TONE,
} from '../../services/sdk';
import type {
  LoanRow, LoanSummary, LoanDbStatus, RepaymentRow,
} from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { formatCurrency } from '../../utils/payrollUtils';

/** اليوم بتوقيت بغداد — القاعدة تستعمل Asia/Baghdad صراحةً */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const EMPTY_FORM = {
  employee_id: '',
  amount: '',
  months: '12',
  purpose: '',
  start_date: todayBaghdad(),
};

export default function LoansPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading]   = useState(true);
  const [rows, setRows]         = useState<LoanRow[]>([]);
  const [summary, setSummary]   = useState<LoanSummary | null>(null);
  const [filter, setFilter]     = useState<'all' | LoanDbStatus>('all');
  const [processing, setProcessing] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [selected, setSelected] = useState<LoanRow | null>(null);
  const [history, setHistory]   = useState<RepaymentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /** نافذة الرفض/الإلغاء — بديل prompt() المحظور بسياسة المنصة */
  const [deciding, setDeciding] =
    useState<{ loan: LoanRow; kind: 'rejected' | 'cancelled' } | null>(null);
  const [reason, setReason] = useState('');

  /** تسديد يدويّ */
  const [repaying, setRepaying] = useState<LoanRow | null>(null);
  const [repayAmount, setRepayAmount] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ★ استدعاءان فقط، كلاهما محسوب في القاعدة وبحدّ أعلى.
      //   النسخة السابقة جلبت كل السلف **وكل الموظفين** بلا حدّ ثم
      //   ربطتهما بـMap في المتصفّح.
      const [board, sum] = await Promise.all([
        loanService.board(null, 300),
        loanService.summary(),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((l) => l.status === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const s of LOAN_STATUSES) c[s] = 0;
    for (const l of rows) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [rows]);

  /** القسط المُعاين — بحارس القسمة على صفر (العطل ⑦) */
  const previewInstallment = useMemo(() => {
    const a = Number(form.amount);
    const m = Number(form.months);
    if (!Number.isFinite(a) || a <= 0) return null;
    if (!Number.isInteger(m) || m < 1 || m > 60) return null;
    return a / m;
  }, [form.amount, form.months]);

  const handleCreate = async () => {
    const amount = Number(form.amount);
    const months = Number(form.months);
    if (!form.employee_id) { addToast('اختر الموظف', 'warning'); return; }
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('المبلغ يجب أن يكون رقماً موجباً', 'warning'); return;
    }
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      addToast('عدد الأشهر يجب أن يكون عدداً صحيحاً بين 1 و 60', 'warning');
      return;
    }
    if (form.purpose.trim() === '') {
      addToast('الغرض إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      // ★ العطل ⑥: `start_date` يُمرَّر فعلاً الآن — وله حقل إدخال.
      // ★ العطل ⑤: `loan_create` يبني سلسلة الاعتماد في المعاملة نفسها.
      // ★ العطل ③: `end_date` تُحسب في القاعدة بحساب تقويميّ.
      // ★ لا حساب قسط هنا: القاعدة تحسبه وتحرسه.
      await loanService.create({
        employeeId: form.employee_id,
        amount,
        months,
        purpose: form.purpose.trim(),
        startDate: form.start_date || null,
      });
      addToast('أُنشئت السلفة وأُرسلت إلى سلسلة الاعتماد', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (loan: LoanRow) => {
    // ★★★ العطل ④: الزرّ كان يُصدر UPDATE مباشراً فيرمي محفّز القاعدة
    //   رسالةً غامضة. الآن نمنع الضغط أصلاً ونشرح السبب.
    if (loan.chainOpen > 0) {
      addToast(
        `للسلفة ${loan.chainOpen} خطوة اعتماد مفتوحة — البتّ من صندوق الموافقات`,
        'warning');
      return;
    }
    setProcessing(true);
    try {
      await loanService.decide(loan.id, 'approved');
      addToast('اعتُمدت السلفة وضُبط متبقّيها بالمبلغ', 'success');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecideWithReason = async () => {
    if (!deciding) return;
    if (reason.trim() === '') {
      addToast('السبب إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      await loanService.decide(deciding.loan.id, deciding.kind, reason.trim());
      addToast(
        deciding.kind === 'rejected' ? 'رُفضت السلفة' : 'أُلغيت السلفة',
        'success');
      setDeciding(null);
      setReason('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleRepay = async () => {
    if (!repaying) return;
    const raw = repayAmount.trim();
    const amt = raw === '' ? null : Number(raw);
    if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) {
      addToast('المبلغ يجب أن يكون رقماً موجباً — أو اتركه فارغاً للقسط',
        'warning');
      return;
    }
    setProcessing(true);
    try {
      // ★ القاعدة تقصّ عند المتبقّي: آخر قسط لا يتجاوز الباقي.
      const paid = await loanService.repayManually(repaying.id, amt, 'manual');
      addToast(
        paid > 0 ? `سُدِّد ${formatCurrency(paid)}` : 'لا متبقٍّ للتسديد',
        paid > 0 ? 'success' : 'info');
      setRepaying(null);
      setRepayAmount('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const openDetails = async (loan: LoanRow) => {
    setSelected(loan);
    setHistory([]);
    setHistoryLoading(true);
    try {
      // ★ العطل ⑨: سجلّ التسديد لم يكن موجوداً — لا جدول ولا واجهة.
      setHistory(await loanService.repayments(loan.id));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <CreditCard className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">السلف والقروض</h1>
            <p className="text-sm text-slate-500">
              الأقساط تُسدَّد آلياً عند اعتماد كشف الرواتب
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
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
          >
            <Plus size={18} /> سلفة جديدة
          </button>
        </div>
      </div>

      {/* ═══ البطاقات — محسوبة في القاعدة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<CreditCard size={16} />}
          tone="text-slate-900"
          value={summary ? String(summary.total) : '—'}
          label="إجمالي السلف"
          hint={summary ? `${summary.pending} بانتظار الاعتماد` : ''}
        />
        <StatCard
          icon={<Wallet size={16} />}
          tone="text-orange-600"
          value={summary ? formatCurrency(summary.outstanding) : '—'}
          label="المتبقّي القائم"
          /* ★ «السارية» اشتقاق: approved بمتبقٍّ موجب — لا حالة active */
          hint={summary ? `${summary.active} سلفة سارية` : ''}
        />
        <StatCard
          icon={<TrendingDown size={16} />}
          tone="text-amber-600"
          value={summary ? formatCurrency(summary.monthly) : '—'}
          label="الالتزام الشهريّ"
          hint="يُخصم عند اعتماد الرواتب"
        />
        <StatCard
          icon={<CheckCircle size={16} />}
          tone="text-emerald-600"
          value={summary ? formatCurrency(summary.repaid) : '—'}
          label="المسدَّد تراكمياً"
          hint={summary ? `من ${formatCurrency(summary.disbursed)} مصروفة` : ''}
        />
      </div>

      {/* ═══ الفلترة — بمفردات القاعدة الخمس وحدها ═══ */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterChip
          active={filter === 'all'} onClick={() => setFilter('all')}
          label="الكل" count={counts.all}
        />
        {LOAN_STATUSES.map((s) => (
          <FilterChip
            key={s} active={filter === s} onClick={() => setFilter(s)}
            label={LOAN_STATUS_AR[s]} count={counts[s] ?? 0}
          />
        ))}
      </div>

      {/* ═══ القائمة ═══ */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-orange-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">
            {filter === 'all' ? 'لا توجد سلف' : `لا سلف بحالة «${LOAN_STATUS_AR[filter]}»`}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              processing={processing}
              onDetails={() => void openDetails(loan)}
              onApprove={() => void handleApprove(loan)}
              onReject={() => { setDeciding({ loan, kind: 'rejected' }); setReason(''); }}
              onCancel={() => { setDeciding({ loan, kind: 'cancelled' }); setReason(''); }}
              onRepay={() => { setRepaying(loan); setRepayAmount(''); }}
            />
          ))}
        </div>
      )}

      {/* ═══ نافذة الإنشاء ═══ */}
      {showCreate && (
        <Modal title="سلفة جديدة" onClose={() => setShowCreate(false)}>
          <EmployeePicker
            value={form.employee_id}
            onChange={(id) => setForm({ ...form, employee_id: id })}
          />
          <FormField label="المبلغ" required>
            <input
              type="number" min="1" inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          <FormField label="عدد الأشهر (1–60)" required>
            <input
              type="number" min="1" max="60" inputMode="numeric"
              value={form.months}
              onChange={(e) => setForm({ ...form, months: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          {/* ★ العطل ⑥: الحقل لم يكن موجوداً رغم وجوده في الحالة */}
          <FormField label="تاريخ البداية" required>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              تاريخ الانتهاء يُحسب في القاعدة بشهور تقويمية
            </p>
          </FormField>
          {/* ★ العطل ⑦: لا عرض لـInfinity — الحارس قبل الحساب */}
          {previewInstallment !== null ? (
            <p className="text-sm text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">
              القسط الشهريّ: {formatCurrency(previewInstallment)}
            </p>
          ) : (form.amount !== '' || form.months !== '') ? (
            <p className="text-sm text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
              أدخل مبلغاً موجباً وعدد أشهر بين 1 و 60 لعرض القسط
            </p>
          ) : null}
          <FormField label="الغرض" required>
            <textarea
              value={form.purpose} rows={2}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              تُرسَل السلفة إلى سلسلة الاعتماد تلقائياً بحسب المبلغ والقسم.
            </span>
          </div>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={() => void handleCreate()}
            submitLabel={processing ? 'جارٍ الإنشاء…' : 'إنشاء'}
            color="orange"
          />
        </Modal>
      )}

      {/* ═══ نافذة التفاصيل + سجلّ التسديد ═══ */}
      {selected && (
        <Modal title="تفاصيل السلفة" onClose={() => setSelected(null)}>
          <div className="space-y-1">
            <DetailRow label="الموظف" value={selected.employeeName} />
            <DetailRow label="الرمز" value={selected.employeeCode} />
            <DetailRow label="القسم" value={selected.department} />
            <DetailRow label="المبلغ" value={formatCurrency(selected.amount)} />
            <DetailRow label="المتبقّي" value={formatCurrency(selected.remaining)} />
            <DetailRow label="القسط الشهريّ" value={formatCurrency(selected.installment)} />
            <DetailRow
              label="الأقساط"
              value={`${selected.monthsPaid} من ${selected.monthsCount}`}
            />
            <DetailRow label="البداية" value={fmtDate(selected.startDate)} />
            <DetailRow label="الانتهاء" value={fmtDate(selected.endDate)} />
            <DetailRow label="الغرض" value={selected.purpose} />
            <DetailRow label="الحالة" value={LOAN_STATUS_AR[selected.status]} />
            {selected.rejectionReason && (
              <DetailRow label="السبب" value={selected.rejectionReason} />
            )}
            {selected.chainOpen > 0 && (
              <DetailRow
                label="سلسلة الاعتماد"
                value={`${selected.chainOpen} خطوة مفتوحة`}
              />
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <History size={15} className="text-slate-400" />
              <h4 className="text-sm font-bold text-slate-700">سجلّ التسديد</h4>
            </div>
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                <Loader2 size={14} className="animate-spin" /> جارٍ التحميل…
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">
                لا تسديدات بعد — القسط يُخصم عند اعتماد كشف الرواتب
              </p>
            ) : (
              <div className="space-y-1.5">
                {history.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-700">
                        القسط {r.no}
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-500 text-xs">
                        {r.periodName}
                      </span>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(r.amount)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        المتبقّي {formatCurrency(r.remainingAfter)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ═══ نافذة السبب — بديل prompt() المحظور ═══ */}
      {deciding && (
        <Modal
          title={deciding.kind === 'rejected' ? 'رفض السلفة' : 'إلغاء السلفة'}
          onClose={() => { setDeciding(null); setReason(''); }}
        >
          <p className="text-sm text-slate-600">
            {deciding.loan.employeeName} — {formatCurrency(deciding.loan.amount)}
          </p>
          <textarea
            value={reason} rows={3} autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder="السبب (إلزاميّ)"
            className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setDeciding(null); setReason(''); }}
              disabled={processing}
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              تراجع
            </button>
            <button
              onClick={() => void handleDecideWithReason()}
              disabled={processing || reason.trim() === ''}
              className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              تأكيد
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ نافذة التسديد اليدويّ ═══ */}
      {repaying && (
        <Modal
          title="تسديد يدويّ"
          onClose={() => { setRepaying(null); setRepayAmount(''); }}
        >
          <p className="text-sm text-slate-600">
            {repaying.employeeName} — المتبقّي {formatCurrency(repaying.remaining)}
          </p>
          <FormField label="المبلغ (اتركه فارغاً لقسط واحد)">
            <input
              type="number" min="1" inputMode="numeric"
              value={repayAmount} autoFocus
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder={String(repaying.installment)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
          </FormField>
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            التسديد لا يتجاوز المتبقّي — يُقصّ في القاعدة. وعند بلوغ الصفر
            تصير السلفة «مسدَّدة» فلا تُخصم من الرواتب بعدها.
          </p>
          <ModalActions
            onClose={() => { setRepaying(null); setRepayAmount(''); }}
            onSubmit={() => void handleRepay()}
            submitLabel={processing ? 'جارٍ التسديد…' : 'تسديد'}
            color="emerald"
          />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ مكوّنات الصفحة ═══════════════

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  return format(t, 'd MMM yyyy', { locale: ar });
}

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
          ? 'bg-orange-600 text-white border-orange-600'
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

function LoanCard({ loan, processing, onDetails, onApprove, onReject, onCancel, onRepay }: {
  loan: LoanRow; processing: boolean;
  onDetails: () => void; onApprove: () => void;
  onReject: () => void; onCancel: () => void; onRepay: () => void;
}) {
  /* ★ «الساري» اشتقاق لا حالة: approved بمتبقٍّ موجب */
  const isLive = loan.status === 'approved' && loan.remaining > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <CreditCard size={20} className="text-orange-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">
              {loan.employeeName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {loan.employeeCode} · {loan.department} · {loan.purpose}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <p className="font-bold text-slate-900">
              {formatCurrency(loan.amount)}
            </p>
            <span
              className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                LOAN_STATUS_TONE[loan.status]
              }`}
            >
              {LOAN_STATUS_AR[loan.status]}
            </span>
          </div>
          <button
            onClick={onDetails}
            title="التفاصيل وسجلّ التسديد"
            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <Eye size={18} />
          </button>
        </div>
      </div>

      {/* ★ شريط التقدّم — كان مشروطاً بحالة `active` غير الموجودة
          فلا يظهر لأيّ سلفة على الإطلاق (العطل ①). */}
      {(isLive || loan.status === 'paid') && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>المسدَّد: {loan.monthsPaid}/{loan.monthsCount} قسط</span>
            <span>المتبقّي: {formatCurrency(loan.remaining)}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                loan.status === 'paid'
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500'
              }`}
              style={{ width: `${Math.min(Math.max(loan.progress, 0), 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            القسط الشهريّ: {formatCurrency(loan.installment)} ·{' '}
            {loan.progress}% مسدَّد
          </p>
        </div>
      )}

      {/* ★★★ العطل ④: تنبيه بدل رسالة خطأ غامضة بعد الضغط */}
      {loan.status === 'pending' && loan.chainOpen > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {loan.chainOpen} خطوة اعتماد مفتوحة — البتّ من صندوق الموافقات
            لا من هنا.
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-3 flex-wrap">
        {loan.status === 'pending' && (
          <>
            <button
              onClick={onApprove}
              disabled={processing || loan.chainOpen > 0}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40"
            >
              <CheckCircle size={14} /> اعتماد
            </button>
            <button
              onClick={onReject}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors disabled:opacity-40"
            >
              <XCircle size={14} /> رفض
            </button>
            <button
              onClick={onCancel}
              disabled={processing}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              <Ban size={14} /> إلغاء
            </button>
          </>
        )}
        {isLive && (
          <button
            onClick={onRepay}
            disabled={processing}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40"
          >
            <Wallet size={14} /> تسديد يدويّ
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════ مكوّنات مشتركة ═══════════════
// ★ تسع صفحات تستوردها من هنا — التوقيعات ثابتة:
//   admin/BranchesPage · admin/CompliancePage · employee/MyExpensesPage
//   employee/MyLoansPage · hr/BonusesPage · hr/DisciplinaryPage
//   hr/DocumentsPage · hr/EmployeeContractsPage · hr/HRServiceCenterPage
//   hr/HealthSafetyPage

export function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export function ModalActions({ onClose, onSubmit, submitLabel, color = 'emerald' }: {
  onClose: () => void; onSubmit: () => void; submitLabel: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    orange:  'bg-orange-600 hover:bg-orange-700',
    blue:    'bg-blue-600 hover:bg-blue-700',
    red:     'bg-red-600 hover:bg-red-700',
    purple:  'bg-purple-600 hover:bg-purple-700',
  };
  return (
    <div className="flex gap-2 pt-2">
      <button
        onClick={onClose}
        className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
      >
        إلغاء
      </button>
      <button
        onClick={onSubmit}
        className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold transition-colors ${colorMap[color]}`}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export function EmployeePicker({ value, onChange }: {
  value: string; onChange: (id: string) => void;
}) {
  const [employees, setEmployees] =
    useState<{ id: string; full_name_ar: string; employee_code: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const data = await employeeService.findAll({ filters: { is_active: true } });
      setEmployees((data ?? []) as unknown as Parameters<typeof setEmployees>[0]);
    })();
  }, []);
  return (
    <FormField label="الموظف" required>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
      >
        <option value="">اختر موظف…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {/* ★ full_name_ar = NULL لكل موظف (مُحقَّق) — احتياطيّ صريح */}
            {e.full_name_ar || `موظف ${e.employee_code}`} ({e.employee_code})
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0 gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-sm text-left">
        {value || '—'}
      </span>
    </div>
  );
}
