/**
 * MyExpensesPage - نفقاتي (صفحة الموظف)
 * تحسينات المرحلة الثانية:
 * - ملخص مالي وحالات واضحة
 * - فلترة حسب الحالة
 * - نافذة تفاصيل مع مسار موافقة مبسط
 * - رقم إيصال/رابط إيصال اختياري بدون كسر قاعدة البيانات الحالية
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Eye, Loader2, Plus, Receipt, Search, X, XCircle } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService, expenseRequestService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { ExpenseRequest } from '../../shared/types/hrModules';
import { EXPENSE_STATUS_LABELS } from '../../shared/types/hrModules';
import { formatCurrency } from '../../utils/payrollUtils';
import { Modal, FormField, ModalActions, DetailRow } from '../hr/LoansPage';

type ExpenseFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';

const categoryLabels: Record<string, string> = {
  general: 'عام',
  travel: 'سفر',
  meals: 'وجبات',
  supplies: 'مستلزمات',
  training: 'تدريب',
  medical: 'طبي',
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  pending:   { bg: '#f59e0b22', text: '#b45309', border: '#f59e0b44' },
  approved:  { bg: '#10b98122', text: '#047857', border: '#10b98144' },
  rejected:  { bg: '#ef444422', text: '#b91c1c', border: '#ef444444' },
  paid:      { bg: '#6366f122', text: '#4338ca', border: '#6366f144' },
  cancelled: { bg: '#64748b22', text: '#475569', border: '#64748b44' },
};

function normalizeStatus(status?: string): ExpenseFilter {
  const s = String(status || 'pending').toLowerCase();
  if (['approved', 'موافق', 'موافق عليه'].includes(s)) return 'approved';
  if (['rejected', 'مرفوض'].includes(s)) return 'rejected';
  if (['paid', 'مدفوع'].includes(s)) return 'paid';
  if (['cancelled', 'canceled', 'ملغي'].includes(s)) return 'cancelled';
  return 'pending';
}

export default function MyExpensesPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRequest | null>(null);
  const [filter, setFilter] = useState<ExpenseFilter>('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: 0,
    category: 'general',
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    receipt_url: '',
  });

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) setEmployeeId(employees[0].id);
        else {
          setEmployeeId('');
          setLoading(false);
        }
      } catch (err) {
        console.error('خطأ في جلب بيانات الموظف:', getErrorMessage(err));
        setError('تعذر جلب بيانات الموظف');
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const fetchExpenses = useCallback(async () => {
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
  }, [employeeId]);

  useEffect(() => {
    if (employeeId === null) return;
    if (employeeId === '') {
      setLoading(false);
      return;
    }
    fetchExpenses();
  }, [employeeId, fetchExpenses]);

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
        title: form.title.trim(),
        description: form.description.trim(),
        amount: Number(form.amount),
        category: form.category,
        expense_date: form.expense_date,
        receipt_url: form.receipt_url.trim() || undefined,
        status: 'pending',
      } as any);

      addToast?.('تم إرسال طلب النفقة', 'success');
      setShowCreate(false);
      setForm({ title: '', description: '', amount: 0, category: 'general', expense_date: format(new Date(), 'yyyy-MM-dd'), receipt_url: '' });
      await fetchExpenses();
    } catch (err) {
      addToast?.(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const summary = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const pending = expenses.filter(e => normalizeStatus(e.status) === 'pending').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const approved = expenses.filter(e => normalizeStatus(e.status) === 'approved').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const paid = expenses.filter(e => normalizeStatus(e.status) === 'paid').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return { total, pending, approved, paid };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      const status = normalizeStatus(expense.status);
      const matchesFilter = filter === 'all' || status === filter;
      const matchesSearch = !q
        || expense.title?.toLowerCase().includes(q)
        || expense.description?.toLowerCase().includes(q)
        || expense.category?.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [expenses, filter, search]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-pink-500 mb-3" size={40} />
        <p className="text-slate-500">جاري التحميل...</p>
      </div>
    );
  }

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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
            <Receipt className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">نفقاتي</h1>
            <p className="text-sm text-slate-500">طلبات النفقات، الإيصالات، وحالة الاسترداد</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} disabled={!employeeId}
          className="flex items-center gap-2 px-4 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors">
          <Plus size={18} /> طلب نفقة
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي الطلبات', value: formatCurrency(summary.total), icon: Receipt, color: 'bg-slate-50 text-slate-700' },
          { label: 'قيد المراجعة', value: formatCurrency(summary.pending), icon: Clock3, color: 'bg-amber-50 text-amber-700' },
          { label: 'موافق عليها', value: formatCurrency(summary.approved), icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'مدفوعة', value: formatCurrency(summary.paid), icon: CalendarDays, color: 'bg-indigo-50 text-indigo-700' },
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

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-3 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في النفقات..."
            className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-pink-400" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${filter === s ? 'bg-pink-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s === 'all' ? 'الكل' : EXPENSE_STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {filteredExpenses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">لا توجد طلبات نفقات مطابقة</p>
          <p className="text-sm text-slate-400 mt-1">يمكنك تقديم طلب جديد أو تغيير الفلتر</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredExpenses.map((exp) => {
            const status = normalizeStatus(exp.status);
            const sc = statusColors[status] || statusColors.pending;
            return (
              <div key={exp.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900">{exp.title}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{categoryLabels[exp.category || 'general'] || exp.category}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      {exp.description || 'بدون وصف'}
                      {exp.expense_date ? ` · ${format(new Date(exp.expense_date), 'd MMM yyyy', { locale: ar })}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left">
                      <p className="font-bold text-slate-900">{formatCurrency(exp.amount)}</p>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1 border" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                        {EXPENSE_STATUS_LABELS[status] || status}
                      </span>
                    </div>
                    <button onClick={() => setSelectedExpense(exp)} className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><Eye size={16} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="طلب نفقة جديدة" onClose={() => setShowCreate(false)}>
          <FormField label="العنوان" required>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: تذاكر سفر للمؤتمر"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none" />
          </FormField>
          <FormField label="الوصف">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none" />
          </FormField>
          <FormField label="المبلغ (د.ع)" required>
            <input type="number" min={0} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 focus:outline-none" />
          </FormField>
          <FormField label="الفئة">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none">
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
          <FormField label="التاريخ" required>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none" />
          </FormField>
          <FormField label="رابط الإيصال / المرفق">
            <input value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} placeholder="اختياري: رابط ملف الإيصال"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none" />
          </FormField>
          <ModalActions onClose={() => setShowCreate(false)} onSubmit={handleCreate} submitLabel={submitting ? 'جاري الإرسال...' : 'إرسال'} color="blue" />
        </Modal>
      )}

      {selectedExpense && (
        <Modal title="تفاصيل طلب النفقة" onClose={() => setSelectedExpense(null)}>
          <DetailRow label="العنوان" value={selectedExpense.title} />
          <DetailRow label="الفئة" value={categoryLabels[selectedExpense.category || 'general'] || selectedExpense.category} />
          <DetailRow label="المبلغ" value={formatCurrency(selectedExpense.amount)} />
          <DetailRow label="تاريخ النفقة" value={selectedExpense.expense_date ? format(new Date(selectedExpense.expense_date), 'd MMM yyyy', { locale: ar }) : '—'} />
          <DetailRow label="الحالة" value={EXPENSE_STATUS_LABELS[normalizeStatus(selectedExpense.status)] || selectedExpense.status} />
          <DetailRow label="الوصف" value={selectedExpense.description || '—'} />
          {(selectedExpense as any).rejection_reason && <DetailRow label="سبب الرفض" value={(selectedExpense as any).rejection_reason} />}
          {(selectedExpense as any).receipt_url && (
            <a href={(selectedExpense as any).receipt_url} target="_blank" rel="noreferrer" className="block text-center text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl py-2">فتح الإيصال</a>
          )}
          <ExpenseTimeline status={normalizeStatus(selectedExpense.status)} />
        </Modal>
      )}
    </div>
  );
}

function ExpenseTimeline({ status }: { status: ExpenseFilter }) {
  const steps = [
    { key: 'pending', label: 'تم التقديم', icon: Clock3 },
    { key: 'approved', label: 'الموافقة', icon: CheckCircle2 },
    { key: 'paid', label: 'الصرف', icon: Receipt },
  ] as const;
  if (status === 'rejected' || status === 'cancelled') {
    return <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold flex items-center gap-2"><XCircle size={16} /> الطلب غير مكتمل: {status === 'rejected' ? 'مرفوض' : 'ملغي'}</div>;
  }
  const rank: Record<string, number> = { pending: 1, approved: 2, paid: 3 };
  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs font-bold text-slate-500 mb-3">مسار الطلب</p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map(step => {
          const Icon = step.icon;
          const done = rank[status] >= rank[step.key];
          return <div key={step.key} className={`rounded-xl p-2 text-center text-xs font-bold ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}><Icon size={16} className="mx-auto mb-1" />{step.label}</div>;
        })}
      </div>
    </div>
  );
}
