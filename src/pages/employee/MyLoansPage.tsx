/**
 * MyLoansPage - سلفي (صفحة الموظف)
 */
import { useState, useEffect } from 'react';
import { CreditCard, Loader2, Eye } from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import { employeeService, employeeLoanService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { EmployeeLoan } from '../../shared/types/payroll';
import { LOAN_STATUS_LABELS, LOAN_STATUS_COLORS, formatCurrency } from '../../utils/payrollUtils';
import { Modal, DetailRow } from '../hr/LoansPage';

export default function MyLoansPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<EmployeeLoan | null>(null);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
      if (employees.length > 0) setEmployeeId(employees[0].id);
    })();
  }, [user]);

  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      setLoading(true);
      try {
        const data = await employeeLoanService.findByEmployee(employeeId) as unknown as EmployeeLoan[];
        setLoans((data || []) as EmployeeLoan[]);
      } catch (err) {
        console.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  if (loading) return <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-orange-500" size={40} /></div>;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
          <CreditCard className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سلفي</h1>
          <p className="text-sm text-slate-500">عرض السلف والقروض</p>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">لا توجد سلف</p>
          <p className="text-sm text-slate-400 mt-1">يمكنك تقديم طلب سلفة من خلال قسم الموارد البشرية</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {loans.map((loan) => {
            const statusColor = LOAN_STATUS_COLORS[loan.status] || LOAN_STATUS_COLORS.pending;
            const progress = loan.amount > 0 ? ((loan.amount - loan.remaining_amount) / loan.amount) * 100 : 0;
            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-900">{formatCurrency(loan.amount)}</p>
                    <p className="text-xs text-slate-500">{loan.purpose}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={{ background: statusColor.bg, color: statusColor.text }}>
                      {LOAN_STATUS_LABELS[loan.status]}
                    </span>
                    <button onClick={() => setSelectedLoan(loan)}
                      className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
                {loan.status === 'active' && (
                  <>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>{loan.months_paid}/{loan.months_count} شهر مدفوع</span>
                      <span>المتبقي: {formatCurrency(loan.remaining_amount)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">القسط الشهري: {formatCurrency(loan.monthly_installment)}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
        </Modal>
      )}
    </div>
  );
}
