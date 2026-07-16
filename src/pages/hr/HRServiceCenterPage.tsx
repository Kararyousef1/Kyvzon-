import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Inbox, Loader2, MessageSquare, Search, Send } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeLetterRequestService, employeeService, hrCaseService } from '../../services/sdk';
import type { EmployeeLetterRequestRecord, HRCaseRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { Modal, DetailRow, FormField, ModalActions } from './LoansPage';

const statusLabels: Record<string, string> = {
  open: 'مفتوح',
  in_review: 'قيد المراجعة',
  waiting_employee: 'بانتظار الموظف',
  resolved: 'تم الحل',
  closed: 'مغلق',
  submitted: 'مقدم',
  ready: 'جاهز',
  delivered: 'تم التسليم',
  rejected: 'مرفوض',
};

const caseTypeLabels: Record<string, string> = {
  general_inquiry: 'استفسار عام',
  payroll: 'الرواتب',
  benefits: 'المزايا',
  documents: 'المستندات',
  attendance: 'الحضور',
  attendance_correction: 'تصحيح حضور',
  work_environment: 'بيئة العمل',
};

export default function HRServiceCenterPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<HRCaseRecord[]>([]);
  const [letters, setLetters] = useState<EmployeeLetterRequestRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'cases' | 'letters'>('cases');
  const [selectedCase, setSelectedCase] = useState<HRCaseRecord | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<EmployeeLetterRequestRecord | null>(null);
  const [resolution, setResolution] = useState('');
  const [letterUrl, setLetterUrl] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRows, letterRows, employeeRows] = await Promise.all([
        hrCaseService.findAll({ orderBy: 'created_at', ascending: false }),
        employeeLetterRequestService.findAll({ orderBy: 'created_at', ascending: false }),
        employeeService.findAll({ orderBy: 'full_name_ar' }),
      ]);
      setCases(caseRows || []);
      setLetters(letterRows || []);
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
    open: cases.filter(c => ['open', 'in_review', 'waiting_employee'].includes(c.status)).length,
    urgent: cases.filter(c => c.priority === 'urgent' && !['resolved', 'closed'].includes(c.status)).length,
    resolved: cases.filter(c => ['resolved', 'closed'].includes(c.status)).length,
    lettersPending: letters.filter(l => ['submitted', 'in_review'].includes(l.status)).length,
  }), [cases, letters]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(item => {
      const emp = employeeMap.get(item.employee_id);
      return !q || [item.subject, item.description, item.case_type, emp?.full_name_ar, emp?.employee_code].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [cases, employeeMap, search]);

  const filteredLetters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters.filter(item => {
      const emp = employeeMap.get(item.employee_id);
      return !q || [item.letter_type, item.purpose, emp?.full_name_ar, emp?.employee_code].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [employeeMap, letters, search]);

  const updateCaseStatus = async (item: HRCaseRecord, status: HRCaseRecord['status']) => {
    try {
      await hrCaseService.update(item.id, {
        status,
        assigned_to: item.assigned_to || user?.id,
        resolution_summary: resolution || item.resolution_summary,
        resolved_at: ['resolved', 'closed'].includes(status) ? new Date().toISOString() : item.resolved_at,
      } as Partial<HRCaseRecord>);
      addToast('تم تحديث طلب HR', 'success');
      setSelectedCase(null);
      setResolution('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const updateLetterStatus = async (item: EmployeeLetterRequestRecord, status: EmployeeLetterRequestRecord['status']) => {
    try {
      await employeeLetterRequestService.update(item.id, {
        status,
        document_url: letterUrl || item.document_url,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as Partial<EmployeeLetterRequestRecord>);
      addToast('تم تحديث طلب الخطاب', 'success');
      setSelectedLetter(null);
      setLetterUrl('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white">
        <p className="text-white/70 text-sm font-semibold">HR Service Management</p>
        <h2 className="text-2xl font-extrabold mt-1">مركز خدمات الموارد البشرية</h2>
        <p className="text-white/75 mt-2 text-sm">إدارة طلبات الموظفين، تصحيح الحضور، والخطابات الرسمية من مكان واحد.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'طلبات مفتوحة', value: summary.open, icon: Inbox, color: 'bg-blue-50 text-blue-700' },
          { label: 'طلبات عاجلة', value: summary.urgent, icon: Clock3, color: 'bg-red-50 text-red-700' },
          { label: 'طلبات محلولة', value: summary.resolved, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'خطابات معلقة', value: summary.lettersPending, icon: FileText, color: 'bg-purple-50 text-purple-700' },
        ].map(item => { const Icon = item.icon; return <div key={item.label} className="bg-white border border-slate-100 rounded-2xl p-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div><p className="text-2xl font-extrabold text-slate-900">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></div>; })}
      </div>

      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5">
        <button onClick={() => setActiveTab('cases')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${activeTab === 'cases' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>طلبات HR</button>
        <button onClick={() => setActiveTab('letters')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${activeTab === 'letters' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>الخطابات</button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-3 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو موضوع الطلب..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400" />
      </div>

      {activeTab === 'cases' ? (
        <div className="grid gap-3">
          {filteredCases.length === 0 ? <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد طلبات HR</div> : filteredCases.map(item => {
            const emp = employeeMap.get(item.employee_id);
            return <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-3 flex-wrap"><div><p className="font-bold text-slate-900">{item.subject}</p><p className="text-xs text-slate-500 mt-1">{emp?.full_name_ar || 'موظف'} • {caseTypeLabels[item.case_type] || item.case_type}</p></div><div className="flex items-center gap-2"><span className={`text-xs font-bold px-2 py-1 rounded-full ${item.priority === 'urgent' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>{item.priority}</span><span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700">{statusLabels[item.status] || item.status}</span><button onClick={() => setSelectedCase(item)} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">إدارة</button></div></div></div>;
          })}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredLetters.length === 0 ? <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">لا توجد طلبات خطابات</div> : filteredLetters.map(item => {
            const emp = employeeMap.get(item.employee_id);
            return <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-3 flex-wrap"><div><p className="font-bold text-slate-900">{item.letter_type}</p><p className="text-xs text-slate-500 mt-1">{emp?.full_name_ar || 'موظف'} • {item.language} • {item.delivery_method}</p></div><div className="flex items-center gap-2"><span className="text-xs font-bold px-2 py-1 rounded-full bg-purple-50 text-purple-700">{statusLabels[item.status] || item.status}</span><button onClick={() => setSelectedLetter(item)} className="px-3 py-2 rounded-xl bg-purple-50 text-purple-700 text-xs font-bold">إدارة</button></div></div></div>;
          })}
        </div>
      )}

      {selectedCase && (
        <Modal title="إدارة طلب HR" onClose={() => setSelectedCase(null)}>
          <DetailRow label="الموظف" value={employeeMap.get(selectedCase.employee_id)?.full_name_ar} />
          <DetailRow label="النوع" value={caseTypeLabels[selectedCase.case_type] || selectedCase.case_type} />
          <DetailRow label="الموضوع" value={selectedCase.subject} />
          <DetailRow label="الوصف" value={selectedCase.description} />
          <DetailRow label="الحالة" value={statusLabels[selectedCase.status]} />
          <FormField label="ملخص الحل / الرد"><textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => updateCaseStatus(selectedCase, 'in_review')} className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm">قيد المراجعة</button>
            <button onClick={() => updateCaseStatus(selectedCase, 'waiting_employee')} className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 font-bold text-sm">بانتظار الموظف</button>
            <button onClick={() => updateCaseStatus(selectedCase, 'resolved')} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm">تم الحل</button>
            <button onClick={() => updateCaseStatus(selectedCase, 'closed')} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">إغلاق</button>
          </div>
        </Modal>
      )}

      {selectedLetter && (
        <Modal title="إدارة طلب خطاب" onClose={() => setSelectedLetter(null)}>
          <DetailRow label="الموظف" value={employeeMap.get(selectedLetter.employee_id)?.full_name_ar} />
          <DetailRow label="نوع الخطاب" value={selectedLetter.letter_type} />
          <DetailRow label="الغرض" value={selectedLetter.purpose || '—'} />
          <DetailRow label="الحالة" value={statusLabels[selectedLetter.status]} />
          <FormField label="رابط ملف الخطاب"><input value={letterUrl} onChange={e => setLetterUrl(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg" /></FormField>
          <ModalActions onClose={() => setSelectedLetter(null)} onSubmit={() => updateLetterStatus(selectedLetter, letterUrl ? 'ready' : 'in_review')} submitLabel={letterUrl ? 'تجهيز الخطاب' : 'وضع قيد المراجعة'} color="purple" />
          <button onClick={() => updateLetterStatus(selectedLetter, 'delivered')} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 font-bold"><Send size={14} /> تم التسليم</button>
        </Modal>
      )}
    </div>
  );
}
