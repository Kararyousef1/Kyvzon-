/**
 * ════════════════════════════════════════════════════════════════
 *  LoansPage - إدارة السلف والقروض (HR)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Plus, Loader2, CheckCircle, XCircle, Eye, X } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { employeeLoanService, employeeService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { EmployeeLoan, LoanStatus } from '../../shared/types/payroll';
import { LOAN_STATUS_LABELS, LOAN_STATUS_COLORS, formatCurrency } from '../../utils/payrollUtils';

export default function LoansPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<EmployeeLoan | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | LoanStatus>('all');

  const [formData, setFormData] = useState({
    employee_id: '',
    amount: 0,
    months_count: 12,
    purpose: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeLoanService.findAll({ orderBy: 'created_at', ascending: false });
      const employees = await employeeService.findAll({ orderBy: 'full_name_ar' });
      const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
      const enriched = (data || []).map((l: any) => ({ ...l, employees: empMap.get(l.employee_id) || null }));
      setLoans(enriched as unknown as EmployeeLoan[]);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const handleCreate = async () => {
    if (!formData.employee_id || !formData.amount || !formData.purpose) {
      addToast('يرجى ملء جميع الحقول المطلوبة', 'warning');
      return;
    }
    const installment = formData.amount / formData.months_count;
    try {
      await employeeLoanService.createLoan({
        employee_id: formData.employee_id,
        loan_amount: Number(formData.amount),
        purpose: formData.purpose,
        total_installments: Number(formData.months_count),
        installment_amount: installment,
      } as any);
      addToast('تم إنشاء طلب السلفة بنجاح', 'success');
      setShowCreateModal(false);
      setFormData({ employee_id: '', amount: 0, months_count: 12, purpose: '', start_date: format(new Date(), 'yyyy-MM-dd') });
      await fetchLoans();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleApprove = async (loan: EmployeeLoan) => {
    const end = new Date(loan.start_date);
    end.setMonth(end.getMonth() + loan.months_count);
    try {
      await employeeLoanService.approveLoan(loan.id, '');
      addToast('تمت الموافقة على السلفة', 'success');
      await fetchLoans();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleReject = async (loan: EmployeeLoan) => {
    const reason = prompt('سبب الرفض:');
    if (reason === null) return;
    try {
      await employeeLoanService.rejectLoan(loan.id, reason);
      addToast('تم رفض السلفة', 'success');
      await fetchLoans();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const filteredLoans = filterStatus === 'all' ? loans : loans.filter((l) => l.status === filterStatus);
  const totalActive = loans.filter((l) => l.status === 'active').reduce((s, l) => s + l.remaining_amount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <CreditCard className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">السلف والقروض</h1>
            <p className="text-sm text-slate-500">إدارة طلبات السلف والأقساط</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-colors shadow-sm">
          <Plus size={18} /> سلفة جديدة
        </button>
      </div>

      {/* ملخص */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{loans.length}</p>
          <p className="text-xs text-slate-500">إجمالي الطلبات</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalActive)}</p>
          <p className="text-xs text-slate-500">المتبقي النشط</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-amber-600">{loans.filter(l => l.status === 'pending').length}</p>
          <p className="text-xs text-slate-500">بانتظار الموافقة</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-emerald-600">{loans.filter(l => l.status === 'completed').length}</p>
          <p className="text-xs text-slate-500">مكتملة</p>
        </div>
      </div>

      {/* فلتر */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'pending', 'active', 'completed', 'rejected'] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              filterStatus === s ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}>
            {s === 'all' ? 'الكل' : LOAN_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-orange-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل...</p>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد سلف</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredLoans.map((loan) => {
            const emp = (loan as any).employees;
            const statusColor = LOAN_STATUS_COLORS[loan.status] || LOAN_STATUS_COLORS.pending;
            const progress = loan.amount > 0 ? ((loan.amount - loan.remaining_amount) / loan.amount) * 100 : 0;
            return (
              <div key={loan.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                      <CreditCard size={20} className="text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{emp?.full_name_ar || 'موظف'}</p>
                      <p className="text-xs text-slate-500">{emp?.employee_code} · {loan.purpose}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className="font-bold text-slate-900">{formatCurrency(loan.amount)}</p>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5"
                        style={{ background: statusColor.bg, color: statusColor.text }}>
                        {LOAN_STATUS_LABELS[loan.status]}
                      </span>
                    </div>
                    <button onClick={() => setSelectedLoan(loan)}
                      className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                      <Eye size={18} />
                    </button>
                  </div>
                </div>

                {/* شريط التقدم */}
                {loan.status === 'active' && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>المدفوع: {loan.months_paid}/{loan.months_count} شهر</span>
                      <span>المتبقي: {formatCurrency(loan.remaining_amount)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all"
                        style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">القسط الشهري: {formatCurrency(loan.monthly_installment)}</p>
                  </div>
                )}

                {/* أزرار الموافقة/الرفض */}
                {loan.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleApprove(loan)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors">
                      <CheckCircle size={14} /> موافقة
                    </button>
                    <button onClick={() => handleReject(loan)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors">
                      <XCircle size={14} /> رفض
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: إنشاء */}
      {showCreateModal && (
        <Modal title="سلفة جديدة" onClose={() => setShowCreateModal(false)}>
          <EmployeePicker value={formData.employee_id}
            onChange={(id) => setFormData({ ...formData, employee_id: id })} />
          <FormField label="المبلغ" required>
            <input type="number" value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500" />
          </FormField>
          <FormField label="عدد الأشهر" required>
            <input type="number" value={formData.months_count} min="1" max="60"
              onChange={(e) => setFormData({ ...formData, months_count: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500" />
          </FormField>
          {formData.amount > 0 && formData.months_count > 0 && (
            <p className="text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
              القسط الشهري: {formatCurrency(formData.amount / formData.months_count)}
            </p>
          )}
          <FormField label="الغرض" required>
            <textarea value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500" />
          </FormField>
          <ModalActions onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} submitLabel="إنشاء" color="orange" />
        </Modal>
      )}

      {/* Modal: تفاصيل */}
      {selectedLoan && (
        <Modal title="تفاصيل السلفة" onClose={() => setSelectedLoan(null)}>
          <div className="space-y-2">
            <DetailRow label="الموظف" value={(selectedLoan as any).employees?.full_name_ar} />
            <DetailRow label="المبلغ الإجمالي" value={formatCurrency(selectedLoan.amount)} />
            <DetailRow label="المتبقي" value={formatCurrency(selectedLoan.remaining_amount)} />
            <DetailRow label="القسط الشهري" value={formatCurrency(selectedLoan.monthly_installment)} />
            <DetailRow label="عدد الأشهر" value={`${selectedLoan.months_count} شهر`} />
            <DetailRow label="المدفوع" value={`${selectedLoan.months_paid} شهر`} />
            <DetailRow label="تاريخ البداية" value={format(new Date(selectedLoan.start_date), 'd MMM yyyy', { locale: ar })} />
            <DetailRow label="الغرض" value={selectedLoan.purpose} />
            <DetailRow label="الحالة" value={LOAN_STATUS_LABELS[selectedLoan.status]} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ مكونات مساعدة مشتركة ═══════════════

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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
    orange: 'bg-orange-600 hover:bg-orange-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    red: 'bg-red-600 hover:bg-red-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
  };
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onClose}
        className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors">
        إلغاء
      </button>
      <button onClick={onSubmit}
        className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold transition-colors ${colorMap[color]}`}>
        {submitLabel}
      </button>
    </div>
  );
}

export function EmployeePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [employees, setEmployees] = useState<{ id: string; full_name_ar: string; employee_code: string }[]>([]);
  useEffect(() => {
    (async () => {
      const data = await employeeService.findAll({ filters: { is_active: true } });
      setEmployees((data || []) as any);
    })();
  }, []);
  return (
    <FormField label="الموظف" required>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500">
        <option value="">اختر موظف...</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.full_name_ar} ({e.employee_code})</option>
        ))}
      </select>
    </FormField>
  );
}

export function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 text-sm">{value || '—'}</span>
    </div>
  );
}
