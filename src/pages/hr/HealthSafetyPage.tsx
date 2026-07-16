import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Plus, Search, ShieldAlert } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { correctiveActionService, employeeService, incidentService } from '../../services/sdk';
import type { CorrectiveActionRecord, IncidentRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { Modal, DetailRow, FormField, ModalActions } from './LoansPage';

const safetyCategories = ['safety', 'health_safety', 'work_injury', 'near_miss', 'security_incident'];
const priorityLabels: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' };

export default function HealthSafetyPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [actions, setActions] = useState<CorrectiveActionRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showIncident, setShowIncident] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [incidentForm, setIncidentForm] = useState({ title: '', description: '', category: 'safety', severity: 'medium', employee_id: '' });
  const [actionForm, setActionForm] = useState({ incident_id: '', title: '', description: '', priority: 'medium' as CorrectiveActionRecord['priority'], owner_id: '', due_date: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [incidentRows, actionRows, employeeRows] = await Promise.all([
        incidentService.findAll({ orderBy: 'created_at', ascending: false }),
        correctiveActionService.findAll({ orderBy: 'due_date', ascending: true }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
      ]);
      setIncidents((incidentRows || []).filter((i: any) => safetyCategories.includes(String(i.category || '')) || ['high', 'critical'].includes(String(i.severity || ''))));
      setActions(actionRows || []);
      setEmployees(employeeRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const summary = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter(i => !['resolved', 'closed'].includes(i.status)).length,
    critical: incidents.filter(i => ['critical', 'high'].includes(String(i.severity))).length,
    openActions: actions.filter(a => !['completed', 'cancelled'].includes(a.status)).length,
  }), [actions, incidents]);

  const filteredIncidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return incidents;
    return incidents.filter(i => [i.title, i.description, i.category, i.severity, employeeMap.get(i.employee_id || '')?.full_name_ar].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [employeeMap, incidents, search]);

  const createIncident = async () => {
    if (!incidentForm.title.trim() || !incidentForm.description.trim()) {
      addToast('يرجى إدخال العنوان والوصف', 'warning');
      return;
    }
    try {
      await incidentService.createIncident({
        title: incidentForm.title.trim(),
        description: incidentForm.description.trim(),
        category: incidentForm.category,
        severity: incidentForm.severity,
        employee_id: incidentForm.employee_id || undefined,
      });
      addToast('تم تسجيل حادث السلامة', 'success');
      setShowIncident(false);
      setIncidentForm({ title: '', description: '', category: 'safety', severity: 'medium', employee_id: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const createAction = async () => {
    if (!actionForm.title.trim()) {
      addToast('يرجى إدخال عنوان الإجراء التصحيحي', 'warning');
      return;
    }
    try {
      await correctiveActionService.createAction({
        incident_id: actionForm.incident_id || undefined,
        title: actionForm.title.trim(),
        description: actionForm.description.trim() || undefined,
        priority: actionForm.priority,
        owner_id: actionForm.owner_id || undefined,
        due_date: actionForm.due_date || undefined,
        created_by: user?.id,
      });
      addToast('تم إنشاء الإجراء التصحيحي', 'success');
      setShowAction(false);
      setActionForm({ incident_id: '', title: '', description: '', priority: 'medium', owner_id: '', due_date: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-red-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-red-600 to-orange-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">Health & Safety</p>
          <h2 className="text-2xl font-extrabold mt-1">الصحة والسلامة المهنية</h2>
          <p className="text-white/75 mt-2 text-sm">تسجيل حوادث السلامة ومتابعة الإجراءات التصحيحية CAPA.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowIncident(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold"><Plus size={18} /> حادث</button>
          <button onClick={() => setShowAction(true)} className="flex items-center gap-2 bg-white text-red-700 hover:bg-red-50 rounded-xl px-4 py-2 font-bold"><ClipboardCheck size={18} /> إجراء</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'الحوادث', value: summary.total, icon: ShieldAlert, color: 'bg-red-50 text-red-700' },
          { label: 'حوادث مفتوحة', value: summary.open, icon: AlertTriangle, color: 'bg-amber-50 text-amber-700' },
          { label: 'عالية/حرجة', value: summary.critical, icon: AlertTriangle, color: 'bg-orange-50 text-orange-700' },
          { label: 'إجراءات مفتوحة', value: summary.openActions, icon: ClipboardCheck, color: 'bg-blue-50 text-blue-700' },
        ].map(item => { const Icon = item.icon; return <div key={item.label} className="bg-white border border-slate-100 rounded-2xl p-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div><p className="text-2xl font-extrabold text-slate-900">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></div>; })}
      </div>

      <div className="relative"><Search size={16} className="absolute right-3 top-3 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في حوادث السلامة..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-red-400" /></div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">حوادث السلامة</h3>
          {filteredIncidents.length === 0 ? <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد حوادث سلامة</div> : filteredIncidents.map(incident => <div key={incident.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{incident.title}</p><p className="text-xs text-slate-500 mt-1">{incident.category || 'safety'} • {incident.created_at ? format(new Date(incident.created_at), 'yyyy/MM/dd') : ''}</p></div><div className="flex gap-2"><span className={`text-xs font-bold px-2 py-1 rounded-full ${incident.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{incident.severity || 'medium'}</span><button onClick={() => setSelectedIncident(incident)} className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold">تفاصيل</button></div></div></div>)}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">الإجراءات التصحيحية</h3>
          {actions.length === 0 ? <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد إجراءات تصحيحية</div> : actions.slice(0, 12).map(action => <div key={action.id} className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{action.title}</p><p className="text-xs text-slate-500 mt-1">المسؤول: {employeeMap.get(action.owner_id || '')?.full_name_ar || 'غير محدد'} • {action.due_date || 'بدون موعد'}</p></div><button onClick={() => correctiveActionService.completeAction(action.id, user?.id).then(loadData)} disabled={action.status === 'completed'} className={`px-3 py-2 rounded-xl text-xs font-bold ${action.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{action.status === 'completed' ? 'مكتمل' : 'إكمال'}</button></div></div>)}
        </div>
      </div>

      {showIncident && <Modal title="تسجيل حادث سلامة" onClose={() => setShowIncident(false)}><FormField label="العنوان" required><input value={incidentForm.title} onChange={e => setIncidentForm({ ...incidentForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="النوع"><select value={incidentForm.category} onChange={e => setIncidentForm({ ...incidentForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="safety">سلامة</option><option value="work_injury">إصابة عمل</option><option value="near_miss">خطر محتمل</option><option value="security_incident">حادث أمني</option></select></FormField><FormField label="الخطورة"><select value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">عالٍ</option><option value="critical">حرج</option></select></FormField><FormField label="الموظف المرتبط"><select value={incidentForm.employee_id} onChange={e => setIncidentForm({ ...incidentForm, employee_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField><FormField label="الوصف" required><textarea value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><ModalActions onClose={() => setShowIncident(false)} onSubmit={createIncident} submitLabel="حفظ" color="red" /></Modal>}

      {showAction && <Modal title="إجراء تصحيحي" onClose={() => setShowAction(false)}><FormField label="مرتبط بحادث"><select value={actionForm.incident_id} onChange={e => setActionForm({ ...actionForm, incident_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير مرتبط</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></FormField><FormField label="العنوان" required><input value={actionForm.title} onChange={e => setActionForm({ ...actionForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الأولوية"><select value={actionForm.priority} onChange={e => setActionForm({ ...actionForm, priority: e.target.value as CorrectiveActionRecord['priority'] })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(priorityLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField><FormField label="المسؤول"><select value={actionForm.owner_id} onChange={e => setActionForm({ ...actionForm, owner_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField><FormField label="تاريخ الاستحقاق"><input type="date" value={actionForm.due_date} onChange={e => setActionForm({ ...actionForm, due_date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><FormField label="الوصف"><textarea value={actionForm.description} onChange={e => setActionForm({ ...actionForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField><ModalActions onClose={() => setShowAction(false)} onSubmit={createAction} submitLabel="حفظ" color="red" /></Modal>}

      {selectedIncident && <Modal title="تفاصيل حادث السلامة" onClose={() => setSelectedIncident(null)}><DetailRow label="العنوان" value={selectedIncident.title} /><DetailRow label="التصنيف" value={selectedIncident.category || '—'} /><DetailRow label="الخطورة" value={selectedIncident.severity || '—'} /><DetailRow label="الحالة" value={selectedIncident.status} /><DetailRow label="الوصف" value={selectedIncident.description} /><button onClick={() => { setActionForm({ ...actionForm, incident_id: selectedIncident.id }); setSelectedIncident(null); setShowAction(true); }} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold"><Plus size={14} /> إجراء تصحيحي لهذا الحادث</button></Modal>}
    </div>
  );
}
