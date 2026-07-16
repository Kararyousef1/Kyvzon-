import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, MapPin, Plus, Search } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import { useUIStore } from '../../core/stores';
import { branchService, employeeService, entitlementService } from '../../services/sdk';
import type { BranchRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { Modal, FormField, ModalActions, DetailRow } from '../hr/LoansPage';

export default function BranchesPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<BranchRecord | null>(null);
  const [form, setForm] = useState({ name_ar: '', name_en: '', code: '', city: '', country: 'IQ', address: '', manager_id: '', phone: '', email: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [branchRows, employeeRows] = await Promise.all([
        branchService.findAll({ orderBy: 'name_ar' }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
      ]);
      setBranches(branchRows || []);
      setEmployees(employeeRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);
  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const filtered = branches.filter(b => !search || [b.name_ar, b.name_en, b.code, b.city].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));

  const createBranch = async () => {
    if (!form.name_ar.trim()) return addToast('يرجى إدخال اسم الفرع', 'warning');
    try {
      await entitlementService.assertCanAddBranch();
      await branchService.createBranch({ ...form, name_ar: form.name_ar.trim(), name_en: form.name_en || undefined, code: form.code || undefined, manager_id: form.manager_id || undefined });
      addToast('تم إنشاء الفرع', 'success');
      setShowCreate(false);
      setForm({ name_ar: '', name_en: '', code: '', city: '', country: 'IQ', address: '', manager_id: '', phone: '', email: '' });
      await loadData();
    } catch (err) { addToast(getErrorMessage(err), 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-rose-600" size={36} /></div>;

  return <div className="space-y-6 animate-fade-in" dir="rtl">
    <div className="bg-gradient-to-br from-rose-600 to-red-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
      <div><p className="text-white/70 text-sm font-semibold">Branches</p><h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Building2 /> إدارة الفروع</h2><p className="text-white/75 mt-2 text-sm">تعريف الفروع وربطها بالمدراء والمواقع.</p></div>
      <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold"><Plus size={18} /> فرع جديد</button>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card><p className="text-2xl font-extrabold text-slate-900">{branches.length}</p><p className="text-xs text-slate-500">إجمالي الفروع</p></Card>
      <Card><p className="text-2xl font-extrabold text-emerald-600">{branches.filter(b => b.status === 'active').length}</p><p className="text-xs text-slate-500">نشطة</p></Card>
      <Card><p className="text-2xl font-extrabold text-slate-700">{new Set(branches.map(b => b.city).filter(Boolean)).size}</p><p className="text-xs text-slate-500">مدن</p></Card>
      <Card><p className="text-2xl font-extrabold text-rose-600">{branches.filter(b => !b.manager_id).length}</p><p className="text-xs text-slate-500">بدون مدير</p></Card>
    </div>
    <div className="relative"><Search size={16} className="absolute right-3 top-3 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في الفروع..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-rose-400" /></div>
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map(branch => <Card key={branch.id} hover onClick={() => setSelected(branch)}><div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center"><MapPin size={20} /></div><div><p className="font-bold text-slate-900">{branch.name_ar}</p><p className="text-xs text-slate-500 mt-1">{branch.city || 'غير محدد'} • {branch.code || 'بدون كود'}</p><p className="text-xs text-slate-400 mt-2">المدير: {employeeMap.get(branch.manager_id || '')?.full_name_ar || 'غير محدد'}</p></div></div></Card>)}
    </div>
    {showCreate && <BranchModal form={form} setForm={setForm} employees={employees} onClose={() => setShowCreate(false)} onSubmit={createBranch} />}
    {selected && <Modal title="تفاصيل الفرع" onClose={() => setSelected(null)}><DetailRow label="الاسم" value={selected.name_ar} /><DetailRow label="الكود" value={selected.code || '—'} /><DetailRow label="المدينة" value={selected.city || '—'} /><DetailRow label="العنوان" value={selected.address || '—'} /><DetailRow label="المدير" value={employeeMap.get(selected.manager_id || '')?.full_name_ar || '—'} /><DetailRow label="الهاتف" value={selected.phone || '—'} /><DetailRow label="البريد" value={selected.email || '—'} /></Modal>}
  </div>;
}

function BranchModal({ form, setForm, employees, onClose, onSubmit }: any) {
  return <Modal title="فرع جديد" onClose={onClose}><FormField label="اسم الفرع" required><input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الكود"><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="المدينة"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="المدير"><select value={form.manager_id} onChange={e => setForm({ ...form, manager_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{employees.map((e: any) => <option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField><FormField label="العنوان"><textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الهاتف"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="البريد"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><ModalActions onClose={onClose} onSubmit={onSubmit} submitLabel="حفظ" color="red" /></Modal>;
}
