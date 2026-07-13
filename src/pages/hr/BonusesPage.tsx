/**
 * ════════════════════════════════════════════════════════════════
 *  BonusesPage - إدارة الجوائز والمكافآت (HR)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { Award, Plus, Loader2, CheckCircle, XCircle, Eye, Filter } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { bonusService, employeeService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Bonus, BonusType, PayrollStatus } from '../../shared/types/payroll';
import { BONUS_TYPE_LABELS, PAYROLL_STATUS_LABELS, PAYROLL_STATUS_COLORS, formatCurrency } from '../../utils/payrollUtils';
import { Modal, FormField, ModalActions, EmployeePicker } from './LoansPage';

// قيم حالة الجوائز (تشمل 'pending' كحالة قيد المعالجة)
type BonusStatus = PayrollStatus | 'pending';

// ألوان حالات المكافآت (تشمل pending غير الموجود في PAYROLL_STATUS_COLORS)
const BONUS_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ...PAYROLL_STATUS_COLORS,
  pending: { bg: '#f59e0b22', text: '#f59e0b' },
  approved: { bg: '#10b98122', text: '#10b981' },
  cancelled: { bg: '#ef444422', text: '#ef4444' },
  paid: { bg: '#10b98122', text: '#10b981' },
};

// تسميات حالات المكافآت (تشمل pending غير الموجود في PAYROLL_STATUS_LABELS)
const BONUS_STATUS_LABELS: Record<string, string> = {
  ...PAYROLL_STATUS_LABELS,
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  cancelled: 'ملغاة',
  paid: 'مدفوعة',
};


export default function BonusesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState<Bonus | null>(null);
  const [filterType, setFilterType] = useState<'all' | BonusType>('all');

  const [formData, setFormData] = useState({
    employee_id: '', bonus_type: 'performance' as BonusType,
    amount: 0, reason: '', period_start: '', period_end: '',
  });

  const fetchBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bonusService.findAllBonuses();
      // Fetch employee names for display
      const employees = await employeeService.findAll({ orderBy: 'full_name_ar' });
      const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
      const enriched = (data || []).map((b: any) => ({
        ...b,
        employees: empMap.get(b.employee_id) || null,
      }));
      setBonuses(enriched as unknown as Bonus[]);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchBonuses(); }, [fetchBonuses]);

  const handleCreate = async () => {
    if (!formData.employee_id || !formData.amount || !formData.reason) {
      addToast('يرجى ملء جميع الحقول', 'warning');
      return;
    }
    try {
      await bonusService.createBonus({
        employee_id: formData.employee_id,
        bonus_type: formData.bonus_type,
        bonus_amount: Number(formData.amount)  /* was amount */,
        reason: formData.reason,
      });
      addToast('تم إنشاء المكافأة بنجاح', 'success');
      setShowCreateModal(false);
      setFormData({ employee_id: '', bonus_type: 'performance', amount: 0, reason: '', period_start: '', period_end: '' });
      await fetchBonuses();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleApprove = async (bonus: Bonus) => {
    try {
      await bonusService.approveBonus(bonus.id, "system");
      addToast('تمت الموافقة على المكافأة', 'success');
      await fetchBonuses();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleReject = async (bonus: Bonus) => {
    try {
      await bonusService.cancelBonus(bonus.id);
      addToast('تم إلغاء المكافأة', 'success');
      await fetchBonuses();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const filtered = filterType === 'all' ? bonuses : bonuses.filter((b) => b.bonus_type === filterType);
  const totalPending = bonuses.filter((b) => (b.status as BonusStatus) === 'pending').reduce((s, b) => s + b.amount, 0);
  const totalApproved = bonuses.filter((b) => (b.status as BonusStatus) === 'approved').reduce((s, b) => s + b.amount, 0);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Award className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">الجوائز والمكافآت</h1>
            <p className="text-sm text-slate-500">إدارة المكافآت والجوائز للموظفين</p>
          </div>
        </div>
        <button onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors shadow-sm">
          <Plus size={18} /> مكافأة جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{bonuses.length}</p>
          <p className="text-xs text-slate-500">إجمالي المكافآت</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-slate-500">بانتظار الاعتماد</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalApproved)}</p>
          <p className="text-xs text-slate-500">معتمدة</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterType('all')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterType === 'all' ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
          <Filter size={14} /> الكل
        </button>
        {(['performance', 'overtime', 'annual', 'spot', 'other'] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterType === t ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {BONUS_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-purple-500" size={40} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Award size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد مكافآت</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((bonus) => {
            const emp = (bonus as any).employees;
            const statusColor = BONUS_STATUS_COLORS[bonus.status] || { bg: '#64748b22', text: '#64748b' };
            return (
              <div key={bonus.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Award size={20} className="text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{emp?.full_name_ar || 'موظف'}</p>
                    <p className="text-xs text-slate-500">{BONUS_TYPE_LABELS[bonus.bonus_type]} · {bonus.reason}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="font-bold text-slate-900">{formatCurrency(bonus.amount)}</p>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5"
                      style={{ background: statusColor.bg, color: statusColor.text }}>
                      {BONUS_STATUS_LABELS[bonus.status] || bonus.status}
                    </span>
                  </div>
                  {(bonus.status as BonusStatus) === 'pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => handleApprove(bonus)}
                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><CheckCircle size={16} /></button>
                      <button onClick={() => handleReject(bonus)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"><XCircle size={16} /></button>
                    </div>
                  )}
                  <button onClick={() => setSelectedBonus(bonus)}
                    className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"><Eye size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <Modal title="مكافأة جديدة" onClose={() => setShowCreateModal(false)}>
          <EmployeePicker value={formData.employee_id} onChange={(id) => setFormData({ ...formData, employee_id: id })} />
          <FormField label="نوع المكافأة" required>
            <select value={formData.bonus_type}
              onChange={(e) => setFormData({ ...formData, bonus_type: e.target.value as BonusType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500">
              {Object.entries(BONUS_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="المبلغ" required>
            <input type="number" value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
          </FormField>
          <FormField label="السبب" required>
            <textarea value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ">
              <input type="date" value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
            </FormField>
            <FormField label="إلى تاريخ">
              <input type="date" value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500" />
            </FormField>
          </div>
          <ModalActions onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} submitLabel="إنشاء" color="purple" />
        </Modal>
      )}

      {selectedBonus && (
        <Modal title="تفاصيل المكافأة" onClose={() => setSelectedBonus(null)}>
          <DetailRow label="الموظف" value={(selectedBonus as any).employees?.full_name_ar} />
          <DetailRow label="النوع" value={BONUS_TYPE_LABELS[selectedBonus.bonus_type]} />
          <DetailRow label="المبلغ" value={formatCurrency(selectedBonus.amount)} />
          <DetailRow label="السبب" value={selectedBonus.reason} />
          <DetailRow label="الحالة" value={PAYROLL_STATUS_LABELS[selectedBonus.status]} />
          <DetailRow label="تاريخ الإنشاء" value={format(new Date(selectedBonus.created_at), 'd MMM yyyy', { locale: ar })} />
        </Modal>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 text-sm">{value || '—'}</span>
    </div>
  );
}
