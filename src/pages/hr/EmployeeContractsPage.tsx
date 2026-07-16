import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, FileText, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeContractService, employeeService } from '../../services/sdk';
import type { EmployeeContractRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { format, differenceInCalendarDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Modal, FormField, ModalActions, DetailRow } from './LoansPage';

const contractTypeLabels: Record<string, string> = {
  permanent: 'دائم',
  fixed_term: 'محدد المدة',
  probation: 'تجربة',
  part_time: 'دوام جزئي',
  consultant: 'استشاري',
  other: 'آخر',
};

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشط',
  expired: 'منتهي',
  terminated: 'منهى',
  renewed: 'مجدد',
};

export default function EmployeeContractsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<EmployeeContractRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<EmployeeContractRecord | null>(null);
  const [form, setForm] = useState({
    employee_id: '',
    contract_number: '',
    contract_type: 'permanent' as EmployeeContractRecord['contract_type'],
    title: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
    renewal_notice_days: 30,
    salary_amount: 0,
    salary_currency: 'IQD',
    document_url: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRows, employeeRows] = await Promise.all([
        employeeContractService.findAll({ orderBy: 'end_date', ascending: true }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
      ]);
      setContracts(contractRows || []);
      setEmployees(employeeRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const summary = useMemo(() => {
    const today = new Date();
    const active = contracts.filter(c => c.status === 'active').length;
    const expiring = contracts.filter(c => c.status === 'active' && c.end_date && differenceInCalendarDays(new Date(c.end_date), today) <= (c.renewal_notice_days || 30) && differenceInCalendarDays(new Date(c.end_date), today) >= 0).length;
    const expired = contracts.filter(c => c.status === 'expired' || (c.end_date && differenceInCalendarDays(new Date(c.end_date), today) < 0)).length;
    return { active, expiring, expired, total: contracts.length };
  }, [contracts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter(c => {
      const emp = employeeMap.get(c.employee_id);
      return [c.contract_number, c.title, c.contract_type, emp?.full_name_ar, emp?.employee_code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [contracts, employeeMap, search]);

  const handleCreate = async () => {
    if (!form.employee_id || !form.start_date) {
      addToast('يرجى اختيار الموظف وتاريخ البداية', 'warning');
      return;
    }
    try {
      await employeeContractService.createContract({
        employee_id: form.employee_id,
        contract_number: form.contract_number.trim() || undefined,
        contract_type: form.contract_type,
        title: form.title.trim() || undefined,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        renewal_notice_days: Number(form.renewal_notice_days || 30),
        salary_amount: form.salary_amount ? Number(form.salary_amount) : undefined,
        salary_currency: form.salary_currency,
        document_url: form.document_url.trim() || undefined,
        notes: form.notes.trim() || undefined,
        created_by: user?.id,
      });
      addToast('تم حفظ عقد الموظف', 'success');
      setShowCreate(false);
      setForm({ employee_id: '', contract_number: '', contract_type: 'permanent', title: '', start_date: format(new Date(), 'yyyy-MM-dd'), end_date: '', renewal_notice_days: 30, salary_amount: 0, salary_currency: 'IQD', document_url: '', notes: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">HR Contracts</p>
          <h2 className="text-2xl font-extrabold mt-1">عقود الموظفين</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة عقود العمل، انتهاء الصلاحية، والتنبيهات قبل التجديد.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold transition-colors"><Plus size={18} /> عقد جديد</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي العقود', value: summary.total, icon: FileText, color: 'bg-slate-50 text-slate-700' },
          { label: 'عقود نشطة', value: summary.active, icon: ShieldCheck, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'قريبة الانتهاء', value: summary.expiring, icon: CalendarClock, color: 'bg-amber-50 text-amber-700' },
          { label: 'منتهية', value: summary.expired, icon: FileText, color: 'bg-red-50 text-red-700' },
        ].map(item => { const Icon = item.icon; return (
          <div key={item.label} className="bg-white border border-slate-100 rounded-2xl p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div>
            <p className="text-2xl font-extrabold text-slate-900">{item.value}</p>
            <p className="text-xs text-slate-500">{item.label}</p>
          </div>
        );})}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-3 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو رقم العقد..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400" />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد عقود مطابقة</div> : filtered.map(contract => {
          const emp = employeeMap.get(contract.employee_id);
          const daysLeft = contract.end_date ? differenceInCalendarDays(new Date(contract.end_date), new Date()) : null;
          return (
            <div key={contract.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold text-slate-900">{emp?.full_name_ar || 'موظف'} <span className="text-xs text-slate-400">{emp?.employee_code}</span></p>
                  <p className="text-xs text-slate-500 mt-1">{contractTypeLabels[contract.contract_type]} • {contract.contract_number || 'بدون رقم'} • يبدأ {format(new Date(contract.start_date), 'd MMM yyyy', { locale: ar })}</p>
                </div>
                <div className="flex items-center gap-3">
                  {daysLeft !== null && <span className={`text-xs font-bold px-2 py-1 rounded-full ${daysLeft < 0 ? 'bg-red-50 text-red-700' : daysLeft <= contract.renewal_notice_days ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{daysLeft < 0 ? 'منتهي' : `${daysLeft} يوم`}</span>}
                  <button onClick={() => setSelected(contract)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100">التفاصيل</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <Modal title="عقد موظف جديد" onClose={() => setShowCreate(false)}>
          <FormField label="الموظف" required>
            <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none">
              <option value="">اختر موظف...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_ar || e.email} ({e.employee_code})</option>)}
            </select>
          </FormField>
          <FormField label="رقم العقد"><input value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="نوع العقد"><select value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value as EmployeeContractRecord['contract_type'] })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(contractTypeLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="تاريخ البداية" required><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
            <FormField label="تاريخ النهاية"><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          </div>
          <FormField label="تنبيه قبل الانتهاء بالأيام"><input type="number" min={1} value={form.renewal_notice_days} onChange={e => setForm({ ...form, renewal_notice_days: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="رابط ملف العقد"><input value={form.document_url} onChange={e => setForm({ ...form, document_url: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="ملاحظات"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <ModalActions onClose={() => setShowCreate(false)} onSubmit={handleCreate} submitLabel="حفظ" color="emerald" />
        </Modal>
      )}

      {selected && (
        <Modal title="تفاصيل العقد" onClose={() => setSelected(null)}>
          <DetailRow label="الموظف" value={employeeMap.get(selected.employee_id)?.full_name_ar} />
          <DetailRow label="رقم العقد" value={selected.contract_number || '—'} />
          <DetailRow label="نوع العقد" value={contractTypeLabels[selected.contract_type]} />
          <DetailRow label="الحالة" value={statusLabels[selected.status]} />
          <DetailRow label="البداية" value={format(new Date(selected.start_date), 'd MMM yyyy', { locale: ar })} />
          <DetailRow label="النهاية" value={selected.end_date ? format(new Date(selected.end_date), 'd MMM yyyy', { locale: ar }) : 'غير محدد'} />
          <DetailRow label="ملاحظات" value={selected.notes || '—'} />
          {selected.document_url && <a href={selected.document_url} target="_blank" rel="noreferrer" className="block text-center text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl py-2">فتح ملف العقد</a>}
        </Modal>
      )}
    </div>
  );
}
