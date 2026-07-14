/**
 * MyExpensesPage - نفقاتي (صفحة الموظف)
 * ✅ إصلاح: infinite loading عندما لا يوجد employee record
 * ✅ إصلاح: نمط employeeId null/string بدلاً من ''
 */
import { useState, useEffect } from 'react';
import { Receipt, Plus, Loader2, X } from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import { useUIStore } from '../../core/stores';
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
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null); // null = جاري البحث
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: 0,
    category: 'general',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
  });

  // المرحلة 1: جلب employee_id
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const employees = await employeeService.findAll({
          filters: { user_id: user.id },
          limit: 1,
        });

        if (employees.length > 0) {
          setEmployeeId(employees[0].id);
        } else {
          setEmployeeId(''); // لا يوجد سجل موظف
          setLoading(false);
        }
      } catch (err) {
        console.error('خطأ في جلب بيانات الموظف:', getErrorMessage(err));
        setError('تعذر جلب بيانات الموظف');
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // المرحلة 2: جلب النفقات
  useEffect(() => {
    if (employeeId === null) return; // لا زلنا ننتظر
    if (employeeId === '') {
      setLoading(false);
      return;
    }
    fetchExpenses();
  }, [employeeId]);

  const fetchExpenses = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await expenseRequestService.findByEmployee(employeeId) as unknown as ExpenseRequest[];
      setExpenses(data || []);
    } catch (err) {
      console.error('خطأ في جلب النفقات:', getErrorMessage(err));
      setError('تعذر جلب طلبات النفقات');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.amount || Number(form.amount) <= 0) {
      addToast?.('يرجى ملء العنوان والمبلغ', 'warning');
      return;
    }
    if (!employeeId) return;

    setSubmitting(true);
    try {
      await expenseRequestService.createRequest({
        employee_id: employeeId,
        title: form.title,
        description: form.description,
        amount: Number(form.amount),
        category: form.category,
        expense_date: form.expense_date,
      } as any);

      addToast?.('تم إرسال طلب النفقة', 'success');
      setShowCreate(false);
      setForm({
        title: '',
        description: '',
        amount: 0,
        category: 'general',
        expense_date: format(new Date(), 'yyyy-MM-dd'),
      });
      await fetchExpenses();
    } catch (err) {
      addToast?.(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    pending:   { bg: '#f59e0b22', text: '#f59e0b' },
    approved:  { bg: '#10b98122', text: '#10b981' },
    rejected:  { bg: '#ef444422', text: '#ef4444' },
    paid:      { bg: '#6366f122', text: '#6366f1' },
    cancelled: { bg: '#64748b22', text: '#64748b' },
  };

  // ─── حالة التحميل ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-pink-500 mb-3" size={40} />
        <p className="text-slate-500">جاري التحميل...</p>
      </div>
    );
  }

  // ─── حالة الخطأ ───
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 flex items-center justify-center mb-3">
          <X size={28} className="text-red-400" />
        </div>
        <p className="font-semibold text-slate-700">{error}</p>
        <p className="text-sm text-slate-400 mt-1">تحقق من اتصالك وحاول مجدداً</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* الهيدر */}
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
        <button
          onClick={() => setShowCreate(true)}
          disabled={!employeeId}
          className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors"
        >
          <Plus size={18} /> طلب نفقة
        </button>
      </div>

      {/* القائمة */}
      {expenses.length === 0 ? (
        <div className="text-center py-16">
          <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">لا توجد طلبات نفقات</p>
          <p className="text-sm text-slate-400 mt-1">اضغط "طلب نفقة" لتقديم طلب جديد</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {expenses.map((exp) => {
            const sc = statusColors[exp.status] || statusColors.pending;
            return (
              <div
                key={exp.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-slate-900">{exp.title}</p>
                  <p className="text-xs text-slate-500">
                    {exp.description}
                    {exp.expense_date
                      ? ` · ${format(new Date(exp.expense_date), 'd MMM yyyy', { locale: ar })}`
                      : ''}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <p className="font-bold text-slate-900">{formatCurrency(exp.amount)}</p>
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1"
                    style={{ background: sc.bg, color: sc.text }}
                  >
                    {EXPENSE_STATUS_LABELS[exp.status] || exp.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: طلب نفقة جديدة */}
      {showCreate && (
        <Modal title="طلب نفقة جديدة" onClose={() => setShowCreate(false)}>
          <FormField label="العنوان" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثال: تذاكر سفر للمؤتمر"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none"
            />
          </FormField>
          <FormField label="الوصف">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
            />
          </FormField>
          <FormField label="المبلغ (د.ع)" required>
            <input
              type="number"
              min={0}
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              placeholder="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none"
            />
          </FormField>
          <FormField label="الفئة">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
            >
              <option value="general">عام</option>
              <option value="travel">سفر</option>
              <option value="meals">وجبات</option>
              <option value="supplies">مستلزمات</option>
              <option value="training">تدريب</option>
              <option value="medical">طبي</option>
            </select>
          </FormField>
          <FormField label="التاريخ" required>
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
            />
          </FormField>
          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={handleCreate}
            submitLabel={submitting ? 'جاري الإرسال...' : 'إرسال'}
            color="blue"
          />
        </Modal>
      )}
    </div>
  );
}
