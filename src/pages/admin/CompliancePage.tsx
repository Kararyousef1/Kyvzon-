import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import { useAuthStore, useUIStore } from '../../core/stores';
import { complianceCheckService, employeeService, policyAcknowledgementService } from '../../services/sdk';
import type { ComplianceCheckRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { Modal, FormField, ModalActions, DetailRow } from '../hr/LoansPage';

const categoryLabels: Record<string, string> = {
  security: 'الأمن', hr: 'الموارد البشرية', documents: 'المستندات', permissions: 'الصلاحيات', data_protection: 'حماية البيانات', operations: 'العمليات', other: 'أخرى'
};
const riskLabels: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' };
const statusLabels: Record<string, string> = { open: 'مفتوح', in_progress: 'قيد العمل', closed: 'مغلق', waived: 'مستثنى' };

export default function CompliancePage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<ComplianceCheckRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [ackCount, setAckCount] = useState(0);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ComplianceCheckRecord | null>(null);
  const [form, setForm] = useState({ title: '', category: 'security' as ComplianceCheckRecord['category'], description: '', risk_level: 'medium' as ComplianceCheckRecord['risk_level'], owner_id: '', due_date: '', evidence_url: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [checkRows, employeeRows, ackRows] = await Promise.all([
        complianceCheckService.findAll({ orderBy: 'created_at', ascending: false }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
        policyAcknowledgementService.findAll({ limit: 500 }).catch(() => []),
      ]);
      setChecks(checkRows || []);
      setEmployees(employeeRows || []);
      setAckCount((ackRows || []).length);
    } catch (err) { addToast(getErrorMessage(err), 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const summary = useMemo(() => ({ total: checks.length, open: checks.filter(c => ['open', 'in_progress'].includes(c.status)).length, high: checks.filter(c => ['high', 'critical'].includes(c.risk_level)).length, closed: checks.filter(c => c.status === 'closed').length }), [checks]);
  const filtered = checks.filter(c => !search || [c.title, c.description, c.category, c.risk_level, employeeMap.get(c.owner_id || '')?.full_name_ar].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));

  const createCheck = async () => {
    if (!form.title.trim()) return addToast('يرجى إدخال عنوان فحص الامتثال', 'warning');
    try {
      await complianceCheckService.createCheck({ ...form, title: form.title.trim(), description: form.description || undefined, owner_id: form.owner_id || undefined, due_date: form.due_date || undefined, evidence_url: form.evidence_url || undefined, created_by: user?.id });
      addToast('تم إنشاء فحص الامتثال', 'success');
      setShowCreate(false);
      setForm({ title: '', category: 'security', description: '', risk_level: 'medium', owner_id: '', due_date: '', evidence_url: '' });
      await loadData();
    } catch (err) { addToast(getErrorMessage(err), 'error'); }
  };

  const closeCheck = async (check: ComplianceCheckRecord) => {
    try { await complianceCheckService.closeCheck(check.id, user?.id); addToast('تم إغلاق فحص الامتثال', 'success'); setSelected(null); await loadData(); }
    catch (err) { addToast(getErrorMessage(err), 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-rose-600" size={36} /></div>;

  return <div className="space-y-6 animate-fade-in" dir="rtl">
    <div className="bg-gradient-to-br from-slate-800 to-rose-800 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap"><div><p className="text-white/70 text-sm font-semibold">Compliance Center</p><h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><ShieldCheck /> مركز الامتثال</h2><p className="text-white/75 mt-2 text-sm">متابعة فحوصات الأمن، الصلاحيات، المستندات، وحماية البيانات.</p></div><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold"><Plus size={18} /> فحص جديد</button></div>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[{l:'الفحوصات',v:summary.total,c:'text-slate-700',i:ShieldCheck},{l:'مفتوحة',v:summary.open,c:'text-amber-700',i:ShieldAlert},{l:'عالية/حرجة',v:summary.high,c:'text-red-700',i:ShieldAlert},{l:'مغلقة',v:summary.closed,c:'text-emerald-700',i:CheckCircle2},{l:'إقرارات سياسة',v:ackCount,c:'text-indigo-700',i:ShieldCheck}].map(x => { const I=x.i; return <Card key={x.l}><I className={x.c} size={20}/><p className={`text-2xl font-extrabold mt-2 ${x.c}`}>{x.v}</p><p className="text-xs text-slate-500">{x.l}</p></Card>; })}
    </div>
    <div className="relative"><Search size={16} className="absolute right-3 top-3 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في فحوصات الامتثال..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-rose-400" /></div>
    <div className="grid gap-3">{filtered.length === 0 ? <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد فحوصات امتثال</div> : filtered.map(check => <div key={check.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-3 flex-wrap"><div><p className="font-bold text-slate-900">{check.title}</p><p className="text-xs text-slate-500 mt-1">{categoryLabels[check.category]} • المسؤول: {employeeMap.get(check.owner_id || '')?.full_name_ar || 'غير محدد'}</p></div><div className="flex items-center gap-2"><span className={`text-xs font-bold px-2 py-1 rounded-full ${['high','critical'].includes(check.risk_level) ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>{riskLabels[check.risk_level]}</span><span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700">{statusLabels[check.status]}</span><button onClick={() => setSelected(check)} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold">إدارة</button></div></div></div>)}</div>
    {showCreate && <ComplianceModal form={form} setForm={setForm} employees={employees} onClose={() => setShowCreate(false)} onSubmit={createCheck} />}
    {selected && <Modal title="تفاصيل فحص الامتثال" onClose={() => setSelected(null)}><DetailRow label="العنوان" value={selected.title}/><DetailRow label="الفئة" value={categoryLabels[selected.category]}/><DetailRow label="الخطر" value={riskLabels[selected.risk_level]}/><DetailRow label="الحالة" value={statusLabels[selected.status]}/><DetailRow label="المسؤول" value={employeeMap.get(selected.owner_id || '')?.full_name_ar || '—'}/><DetailRow label="الوصف" value={selected.description || '—'}/>{selected.evidence_url && <a href={selected.evidence_url} target="_blank" rel="noreferrer" className="block text-center text-sm font-bold text-rose-700 bg-rose-50 rounded-xl py-2">فتح الدليل</a>}<button onClick={() => closeCheck(selected)} disabled={selected.status === 'closed'} className="w-full bg-emerald-600 disabled:opacity-60 text-white rounded-xl py-2.5 font-bold">إغلاق الفحص</button></Modal>}
  </div>;
}

function ComplianceModal({ form, setForm, employees, onClose, onSubmit }: any) { return <Modal title="فحص امتثال جديد" onClose={onClose}><FormField label="العنوان" required><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الفئة"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(categoryLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField><FormField label="مستوى الخطر"><select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(riskLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField><FormField label="المسؤول"><select value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField><FormField label="تاريخ الاستحقاق"><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="رابط الدليل"><input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الوصف"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><ModalActions onClose={onClose} onSubmit={onSubmit} submitLabel="حفظ" color="red" /></Modal> }
