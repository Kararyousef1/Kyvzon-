import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Crown, Loader2, Plus, Search, ShieldAlert, Target, Users } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { criticalPositionService, successionCandidateService, employeeService, departmentService } from '../../services/sdk';
import type { CriticalPositionRecord, SuccessionCandidateRecord, SuccessionReadinessLevel } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { Modal, FormField, ModalActions, DetailRow } from './LoansPage';

const riskLabels: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'عالٍ', critical: 'حرج' };
const readinessLabels: Record<SuccessionReadinessLevel, string> = {
  ready_now: 'جاهز الآن',
  ready_6_months: 'جاهز خلال 6 أشهر',
  ready_12_months: 'جاهز خلال 12 شهر',
  future_potential: 'موهبة مستقبلية',
};

export default function SuccessionPlanningPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<CriticalPositionRecord[]>([]);
  const [candidates, setCandidates] = useState<SuccessionCandidateRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showPosition, setShowPosition] = useState(false);
  const [showCandidate, setShowCandidate] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<CriticalPositionRecord | null>(null);
  const [positionForm, setPositionForm] = useState({ title: '', department_id: '', incumbent_employee_id: '', risk_level: 'medium' as CriticalPositionRecord['risk_level'], business_impact: '', required_skills: '' });
  const [candidateForm, setCandidateForm] = useState({ critical_position_id: '', employee_id: '', readiness_level: 'ready_12_months' as SuccessionReadinessLevel, readiness_score: 60, strengths: '', gaps: '', manager_notes: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [positionRows, employeeRows, departmentRows] = await Promise.all([
        criticalPositionService.findAll({ orderBy: 'created_at', ascending: false }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
        departmentService.findAll({ orderBy: 'name_ar' }).catch(() => []),
      ]);
      setPositions(positionRows || []);
      setEmployees(employeeRows || []);
      setDepartments(departmentRows || []);
      const candidateSets = await Promise.all((positionRows || []).map(p => successionCandidateService.findByPosition(p.id).catch(() => [])));
      setCandidates(candidateSets.flat());
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const departmentMap = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments]);
  const candidatesByPosition = useMemo(() => {
    const map = new Map<string, SuccessionCandidateRecord[]>();
    for (const c of candidates) {
      const list = map.get(c.critical_position_id) || [];
      list.push(c);
      map.set(c.critical_position_id, list);
    }
    return map;
  }, [candidates]);

  const summary = useMemo(() => ({
    positions: positions.length,
    critical: positions.filter(p => ['critical', 'high'].includes(p.risk_level)).length,
    readyNow: candidates.filter(c => c.readiness_level === 'ready_now').length,
    uncovered: positions.filter(p => (candidatesByPosition.get(p.id) || []).length === 0).length,
  }), [positions, candidates, candidatesByPosition]);

  const filteredPositions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter(p => [p.title, p.business_impact, riskLabels[p.risk_level], employeeMap.get(p.incumbent_employee_id || '')?.full_name_ar].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [employeeMap, positions, search]);

  const handleCreatePosition = async () => {
    if (!positionForm.title.trim()) {
      addToast('يرجى إدخال عنوان المنصب', 'warning');
      return;
    }
    try {
      await criticalPositionService.createPosition({
        title: positionForm.title.trim(),
        department_id: positionForm.department_id || undefined,
        incumbent_employee_id: positionForm.incumbent_employee_id || undefined,
        risk_level: positionForm.risk_level,
        business_impact: positionForm.business_impact.trim() || undefined,
        required_skills: positionForm.required_skills.split(',').map(s => s.trim()).filter(Boolean),
        created_by: user?.id,
      });
      addToast('تمت إضافة المنصب الحرج', 'success');
      setShowPosition(false);
      setPositionForm({ title: '', department_id: '', incumbent_employee_id: '', risk_level: 'medium', business_impact: '', required_skills: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const openCandidateModal = (position?: CriticalPositionRecord) => {
    setCandidateForm({ ...candidateForm, critical_position_id: position?.id || candidateForm.critical_position_id });
    setShowCandidate(true);
  };

  const handleCreateCandidate = async () => {
    if (!candidateForm.critical_position_id || !candidateForm.employee_id) {
      addToast('يرجى اختيار المنصب والمرشح', 'warning');
      return;
    }
    try {
      await successionCandidateService.createCandidate({
        critical_position_id: candidateForm.critical_position_id,
        employee_id: candidateForm.employee_id,
        readiness_level: candidateForm.readiness_level,
        readiness_score: Number(candidateForm.readiness_score),
        strengths: candidateForm.strengths.trim() || undefined,
        gaps: candidateForm.gaps.trim() || undefined,
        manager_notes: candidateForm.manager_notes.trim() || undefined,
        nominated_by: user?.id,
      });
      addToast('تم ترشيح الموظف لخطة التعاقب', 'success');
      setShowCandidate(false);
      setCandidateForm({ critical_position_id: '', employee_id: '', readiness_level: 'ready_12_months', readiness_score: 60, strengths: '', gaps: '', manager_notes: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">Succession Planning</p>
          <h2 className="text-2xl font-extrabold mt-1">تخطيط التعاقب</h2>
          <p className="text-white/75 mt-2 text-sm">تحديد المناصب الحرجة، المرشحين، وجاهزية الخلفاء.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPosition(true)} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold"><Plus size={18} /> منصب حرج</button>
          <button onClick={() => openCandidateModal()} className="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 rounded-xl px-4 py-2 font-bold"><Users size={18} /> مرشح</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'مناصب حرجة', value: summary.positions, icon: Crown, color: 'bg-blue-50 text-blue-700' },
          { label: 'مخاطر عالية', value: summary.critical, icon: ShieldAlert, color: 'bg-red-50 text-red-700' },
          { label: 'جاهزون الآن', value: summary.readyNow, icon: Award, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'بدون خلفاء', value: summary.uncovered, icon: Target, color: 'bg-amber-50 text-amber-700' },
        ].map(item => { const Icon = item.icon; return <div key={item.label} className="bg-white border border-slate-100 rounded-2xl p-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div><p className="text-2xl font-extrabold text-slate-900">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></div>; })}
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-3 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في المناصب أو المرشحين..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400" />
      </div>

      <div className="grid gap-3">
        {filteredPositions.length === 0 ? <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد مناصب حرجة مطابقة</div> : filteredPositions.map(position => {
          const positionCandidates = candidatesByPosition.get(position.id) || [];
          return (
            <div key={position.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">{position.title}</p>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${position.risk_level === 'critical' ? 'bg-red-50 text-red-700' : position.risk_level === 'high' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{riskLabels[position.risk_level]}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">الشاغل الحالي: {employeeMap.get(position.incumbent_employee_id || '')?.full_name_ar || 'غير محدد'} • القسم: {departmentMap.get(position.department_id || '')?.name_ar || 'غير محدد'}</p>
                  {position.business_impact && <p className="text-xs text-slate-600 mt-2 max-w-2xl">{position.business_impact}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setSelectedPosition(position); }} className="px-3 py-2 rounded-xl bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100">التفاصيل</button>
                  <button onClick={() => openCandidateModal(position)} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100">إضافة مرشح</button>
                </div>
              </div>
              <div className="mt-4 grid md:grid-cols-3 gap-2">
                {positionCandidates.length === 0 ? <div className="md:col-span-3 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 font-bold">لا يوجد مرشحون لهذا المنصب بعد</div> : positionCandidates.slice(0, 3).map(candidate => (
                  <div key={candidate.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-sm font-bold text-slate-800">{employeeMap.get(candidate.employee_id)?.full_name_ar || 'موظف'}</p>
                    <p className="text-xs text-blue-700 font-bold mt-1">{readinessLabels[candidate.readiness_level]}</p>
                    <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${candidate.readiness_score || 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showPosition && (
        <Modal title="إضافة منصب حرج" onClose={() => setShowPosition(false)}>
          <FormField label="عنوان المنصب" required><input value={positionForm.title} onChange={e => setPositionForm({ ...positionForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="القسم"><select value={positionForm.department_id} onChange={e => setPositionForm({ ...positionForm, department_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name_ar || d.name}</option>)}</select></FormField>
          <FormField label="الشاغل الحالي"><select value={positionForm.incumbent_employee_id} onChange={e => setPositionForm({ ...positionForm, incumbent_employee_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">غير محدد</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField>
          <FormField label="مستوى الخطر"><select value={positionForm.risk_level} onChange={e => setPositionForm({ ...positionForm, risk_level: e.target.value as CriticalPositionRecord['risk_level'] })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(riskLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="الأثر على العمل"><textarea value={positionForm.business_impact} onChange={e => setPositionForm({ ...positionForm, business_impact: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="المهارات المطلوبة مفصولة بفواصل"><input value={positionForm.required_skills} onChange={e => setPositionForm({ ...positionForm, required_skills: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <ModalActions onClose={() => setShowPosition(false)} onSubmit={handleCreatePosition} submitLabel="حفظ" color="blue" />
        </Modal>
      )}

      {showCandidate && (
        <Modal title="ترشيح خلف لمنصب" onClose={() => setShowCandidate(false)}>
          <FormField label="المنصب" required><select value={candidateForm.critical_position_id} onChange={e => setCandidateForm({ ...candidateForm, critical_position_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">اختر منصب...</option>{positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></FormField>
          <FormField label="المرشح" required><select value={candidateForm.employee_id} onChange={e => setCandidateForm({ ...candidateForm, employee_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg"><option value="">اختر موظف...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></FormField>
          <FormField label="الجاهزية"><select value={candidateForm.readiness_level} onChange={e => setCandidateForm({ ...candidateForm, readiness_level: e.target.value as SuccessionReadinessLevel })} className="w-full px-3 py-2 border border-slate-200 rounded-lg">{Object.entries(readinessLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="درجة الجاهزية"><input type="number" min={0} max={100} value={candidateForm.readiness_score} onChange={e => setCandidateForm({ ...candidateForm, readiness_score: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="نقاط القوة"><textarea value={candidateForm.strengths} onChange={e => setCandidateForm({ ...candidateForm, strengths: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <FormField label="الفجوات"><textarea value={candidateForm.gaps} onChange={e => setCandidateForm({ ...candidateForm, gaps: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <ModalActions onClose={() => setShowCandidate(false)} onSubmit={handleCreateCandidate} submitLabel="ترشيح" color="blue" />
        </Modal>
      )}

      {selectedPosition && (
        <Modal title="تفاصيل المنصب الحرج" onClose={() => setSelectedPosition(null)}>
          <DetailRow label="المنصب" value={selectedPosition.title} />
          <DetailRow label="الخطر" value={riskLabels[selectedPosition.risk_level]} />
          <DetailRow label="الشاغل الحالي" value={employeeMap.get(selectedPosition.incumbent_employee_id || '')?.full_name_ar || '—'} />
          <DetailRow label="الأثر" value={selectedPosition.business_impact || '—'} />
          <DetailRow label="المهارات" value={(selectedPosition.required_skills || []).join('، ') || '—'} />
        </Modal>
      )}
    </div>
  );
}
