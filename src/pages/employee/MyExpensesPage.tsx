/**
 * MyExpensesPage - نفقاتي (صفحة الموظف لتقديم طلبات النفقات)
 */
import { useState, useEffect } from 'react';
import { Receipt, Plus, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import { employeeService, expenseRequestService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { ExpenseRequest } from '../../shared/types/hrModules';
import { EXPENSE_STATUS_LABELS } from '../../shared/types/hrModules';
import { formatCurrency } from '../../utils/payrollUtils';
import { Modal, FormField, ModalActions } from '../hr/LoansPage';

export default function MyExpensesPage() {
  const { user } = useAuthStore();
  const { addToast } = useAuthStore() as any;
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', amount: 0, category: 'general',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
  });

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
        const data = await expenseRequestService.findByEmployee(employeeId) as unknown as ExpenseRequest[];
        setExpenses((data || []) as ExpenseRequest[]);
      } catch (err) {
        console.error(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  const handleCreate = async () => {
    if (!form.title || !form.amount) {
      if (addToast) addToast({ type: 'warning', message: 'يرجى ملء الحقول' });
      return;
    }
    try {
      await expenseRequestService.createRequest({
        employee_id: employeeId,
        title: form.title,
        description: form.description,
        amount: Number(form.amount),
        category: form.category,
        expense_date: form.expense_date,
      } as any);
      if (addToast) addToast({ type: 'success', message: 'تم إرسال طلب النفقة' });
      setShowCreate(false);
      setForm({ title: '', description: '', amount: 0, category: 'general', expense_date: format(new Date(), 'yyyy-MM-dd') });
      // إعادة الجلب
      const data = await expenseRequestService.findByEmployee(employeeId) as unknown as ExpenseRequest[];
      setExpenses((data || []) as ExpenseRequest[]);
    } catch (err) {
      if (addToast) addToast({ type: 'error', message: getErrorMessage(err) });
    }
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#f59e0b22', text: '#f59e0b' },
    approved: { bg: '#10b98122', text: '#10b981' },
    rejected: { bg: '#ef444422', text: '#ef4444' },
    paid: { bg: '#6366f122', text: '#6366f1' },
    cancelled: { bg: '#64748b22', text: '#64748b' },
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Receipt className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">نفقاتي</h1>
            <p className="text-sm text-slate-500">طلبات النفقات والمصاريف</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-semibold transition-colors">
          <Plus size={18} /> طلب نفقة
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-pink-500" size={40} /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16"><Receipt size={40} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500">لا توجد طلبات نفقات</p></div>
      ) : (
        <div className="grid gap-3">
          {expenses.map((exp) => {
            const sc = statusColors[exp.status] || statusColors.pending;
            return (
              <div key={exp.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{exp.title}</p>
                  <p className="text-xs text-slate-500">{exp.description} · {format(new Date(exp.expense_date), 'd MMM yyyy', { locale: ar })}</p>
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-900">{formatCurrency(exp.amount)}</p>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1" style={{ background: sc.bg, color: sc.text }}>
                    {EXPENSE_STATUS_LABELS[exp.status]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="طلب نفقة جديدة" onClose={() => setShowCreate(false)}>
          <FormField label="العنوان" required>
            <input type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500" />
          </FormField>
          <FormField label="الوصف">
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="المبلغ" required>
            <input type="number" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500" />
          </FormField>
          <FormField label="الفئة">
            <select value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              <option value="general">عام</option>
              <option value="travel">سفر</option>
              <option value="meals">وجبات</option>
              <option value="supplies">مستلزمات</option>
              <option value="training">تدريب</option>
              <option value="medical">طبي</option>
            </select>
          </FormField>
          <FormField label="التاريخ" required>
            <input type="date" value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <ModalActions onClose={() => setShowCreate(false)} onSubmit={handleCreate} submitLabel="إرسال" color="blue" />
        </Modal>
      )}
    </div>
  );
}
