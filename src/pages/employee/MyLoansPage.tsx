/**
 * MyLoansPage - سلفي (صفحة الموظف)
 * تحسينات المرحلة الثانية:
 * - ملخص السلف والأقساط
 * - تقديم طلب سلفة ذاتياً
 * - جدول سداد تقديري
 * - توحيد قراءة الحقول القديمة والجديدة
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CreditCard, Eye, Loader2, Plus, TrendingDown } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService, employeeLoanService } from '../../services/sdk';
import { financialRequestService } from '../../services/sdk/FinancialRequestService';
import { getErrorMessage } from '../../services/errors';
import { addMonths, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { EmployeeLoan, LoanStatus } from '../../shared/types/payroll';
import type { EmployeeLoanRecord } from '../../shared/types/sdk';
import { LOAN_STATUS_LABELS, LOAN_STATUS_COLORS, formatCurrency } from '../../utils/payrollUtils';
import { Modal, DetailRow, FormField, ModalActions } from '../hr/LoansPage';

interface NormalizedLoan extends EmployeeLoan {
  amount: number;
  remaining_amount: number;
  monthly_installment: number;
  months_count: number;
  months_paid: number;
  start_date: string;
}

function normalizeLoan(row: EmployeeLoanRecord): NormalizedLoan {
  const amount = Number(row.amount ?? row.loan_amount ?? 0);
  const months = Number(row.months_count ?? row.total_installments ?? 1) || 1;
  const monthly = Number(row.monthly_installment ?? row.installment_amount ?? (amount / months));
  const remaining = Number(row.remaining_amount ?? Math.max(amount - (Number(row.months_paid ?? 0) * monthly), 0));
  const status = normalizeLoanStatus(row.status);
  return {
    ...row,
    amount,
    remaining_amount: remaining,
    monthly_installment: monthly,
    months_count: months,
    months_paid: Number(row.months_paid ?? 0),
    start_date: row.start_date || row.granted_at || row.created_at || new Date().toISOString(),
    status,
  } as NormalizedLoan;
}

function normalizeLoanStatus(status?: string): LoanStatus {
  const s = String(status || 'pending').toLowerCase();
  if (['approved', 'موافق', 'موافق عليه'].includes(s)) return 'approved';
  if (['active', 'ساري'].includes(s)) return 'active';
  if (['completed', 'paid', 'مكتمل', 'مسدد'].includes(s)) return 'completed';
  if (['rejected', 'مرفوض'].includes(s)) return 'rejected';
  return 'pending';
}

export default function MyLoansPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [loans, setLoans] = useState<NormalizedLoan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<NormalizedLoan | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: 0, months_count: 6, purpose: '', start_date: format(new Date(), 'yyyy-MM-dd') });

  useEffect(() => {
    (async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        if (user.employee_id) {
          setEmployeeId(user.employee_id);
          return;
        }
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) setEmployeeId(employees[0].id);
        else setLoading(false);
      } catch (err) {
        console.error(getErrorMessage(err));
        addToast('تعذر جلب بيانات الموظف', 'error');
        setLoading(false);
      }
    })();
  }, [addToast, user]);

  const fetchLoans = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await employeeLoanService.findByEmployee(employeeId);
      setLoans((data || []).map(normalizeLoan));
    } catch (err) {
      console.error(getErrorMessage(err));
      addToast('تعذر جلب السلف', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, employeeId]);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const summary = useMemo(() => {
    const outstanding = loans.filter(l => ['active', 'approved', 'pending'].includes(l.status)).reduce((s, l) => s + l.remaining_amount, 0);
    const monthly = loans.filter(l => l.status === 'active').reduce((s, l) => s + l.monthly_installment, 0);
    return {
      count: loans.length,
      pending: loans.filter(l => l.status === 'pending').length,
      outstanding,
      monthly,
    };
  }, [loans]);

  const handleRequestLoan = async () => {
    if (!employeeId) return;
    if (!form.amount || form.amount <= 0 || !form.purpose.trim()) {
      addToast('يرجى إدخال المبلغ والغرض', 'warning');
      return;
    }
    if (form.months_count < 1 || form.months_count > 60) {
      addToast('عدد الأشهر يجب أن يكون بين 1 و 60', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const created = await employeeLoanService.createLoan({
        employee_id: employeeId,
        amount: Number(form.amount),
        months_count: Number(form.months_count),
        monthly_installment: Number(form.amount) / Number(form.months_count),
        // ★ remaining_amount تُضبط عند **الاعتماد** لا عند الطلب
        //   (sync_hr_source_status في 0325). نتركها صفراً حتى يُعتمد.
        remaining_amount: 0,
        months_paid: 0,
        start_date: form.start_date,
        purpose: form.purpose.trim(),
        status: 'pending',
      } as unknown as Parameters<typeof employeeLoanService.createLoan>[0]);

      // ★ سلسلة الاعتماد (migration 0325) — بحسب مبلغ السلفة
      if (created?.id) {
        await financialRequestService.createApproval(
          'loan', created.id, employeeId, Number(form.amount),
        );
      }
      addToast('تم إرسال طلب السلفة إلى الموارد البشرية', 'success');
      setShowRequest(false);
      setForm({ amount: 0, months_count: 6, purpose: '', start_date: format(new Date(), 'yyyy-MM-dd') });
      await fetchLoans();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <CreditCard className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">سلفي</h1>
            <p className="text-sm text-slate-500">طلبات السلف، المتبقي، وجدول السداد</p>
          </div>
        </div>
        <button onClick={() => setShowRequest(true)} disabled={!employeeId}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors">
          <Plus size={18} /> طلب سلفة
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي الطلبات', value: summary.count, icon: CreditCard, color: 'bg-slate-50 text-slate-700' },
          { label: 'بانتظار الموافقة', value: summary.pending, icon: CalendarClock, color: 'bg-amber-50 text-amber-700' },
          { label: 'المتبقي', value: formatCurrency(summary.outstanding), icon: TrendingDown, color: 'bg-orange-50 text-orange-700' },
          { label: 'الأقساط الشهرية', value: formatCurrency(summary.monthly), icon: CreditCard, color: 'bg-indigo-50 text-indigo-700' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div>
              <p className="text-lg font-extrabold text-slate-900">{item.value}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          );
        })}
      </div>

      {loans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">لا توجد سلف</p>
          <p className="text-sm text-slate-400 mt-1">يمكنك تقديم طلب سلفة جديد من هذه الصفحة</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {loans.map((loan) => {
            const statusColor = LOAN_STATUS_COLORS[loan.status] || LOAN_STATUS_COLORS.pending;
            const progress = loan.amount > 0 ? Math.min(((loan.amount - loan.remaining_amount) / loan.amount) * 100, 100) : 0;
            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{formatCurrency(loan.amount)}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{loan.purpose}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: statusColor.bg, color: statusColor.text }}>
                      {LOAN_STATUS_LABELS[loan.status]}
                    </span>
                    <button onClick={() => setSelectedLoan(loan)} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><Eye size={16} /></button>
                  </div>
                </div>
                {['active', 'approved', 'completed'].includes(loan.status) && (
                  <>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{loan.months_paid}/{loan.months_count} شهر مدفوع</span>
                      <span>المتبقي: {formatCurrency(loan.remaining_amount)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">القسط الشهري: {formatCurrency(loan.monthly_installment)}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showRequest && (
        <Modal title="طلب سلفة جديد" onClose={() => setShowRequest(false)}>
          <FormField label="المبلغ" required>
            <input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" />
          </FormField>
          <FormField label="عدد الأشهر" required>
            <input type="number" min={1} max={60} value={form.months_count} onChange={(e) => setForm({ ...form, months_count: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" />
          </FormField>
          {form.amount > 0 && form.months_count > 0 && (
            <p className="text-sm text-orange-700 bg-orange-50 px-3 py-2 rounded-lg">القسط التقديري: {formatCurrency(form.amount / form.months_count)}</p>
          )}
          <FormField label="تاريخ بداية السداد المقترح">
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none" />
          </FormField>
          <FormField label="الغرض" required>
            <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none" />
          </FormField>
          <ModalActions onClose={() => setShowRequest(false)} onSubmit={handleRequestLoan} submitLabel={submitting ? 'جاري الإرسال...' : 'إرسال الطلب'} color="orange" />
        </Modal>
      )}

      {selectedLoan && (
        <Modal title="تفاصيل السلفة" onClose={() => setSelectedLoan(null)}>
          <DetailRow label="المبلغ" value={formatCurrency(selectedLoan.amount)} />
          <DetailRow label="المتبقي" value={formatCurrency(selectedLoan.remaining_amount)} />
          <DetailRow label="القسط الشهري" value={formatCurrency(selectedLoan.monthly_installment)} />
          <DetailRow label="عدد الأشهر" value={`${selectedLoan.months_count}`} />
          <DetailRow label="المدفوع" value={`${selectedLoan.months_paid} شهر`} />
          <DetailRow label="تاريخ البداية" value={format(new Date(selectedLoan.start_date), 'd MMM yyyy', { locale: ar })} />
          <DetailRow label="الغرض" value={selectedLoan.purpose} />
          <DetailRow label="الحالة" value={LOAN_STATUS_LABELS[selectedLoan.status]} />
          {selectedLoan.rejection_reason && <DetailRow label="سبب الرفض" value={selectedLoan.rejection_reason} />}
          <RepaymentSchedule loan={selectedLoan} />
        </Modal>
      )}
    </div>
  );
}

function RepaymentSchedule({ loan }: { loan: NormalizedLoan }) {
  const rows = Array.from({ length: Math.min(loan.months_count, 12) }, (_, i) => {
    const installmentNo = i + 1;
    const dueDate = addMonths(new Date(loan.start_date), i);
    const paid = installmentNo <= loan.months_paid;
    return { installmentNo, dueDate, paid };
  });

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs font-bold text-slate-500 mb-2">جدول السداد التقديري {loan.months_count > 12 ? '(أول 12 شهر)' : ''}</p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {rows.map(row => (
          <div key={row.installmentNo} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
            <span>القسط {row.installmentNo}</span>
            <span>{format(row.dueDate, 'MMM yyyy', { locale: ar })}</span>
            <span className={row.paid ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{row.paid ? 'مدفوع' : 'مجدول'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
