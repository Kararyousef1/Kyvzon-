import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, ClipboardList, Loader2, StickyNote, Users } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeBreakService, operationalChecklistService, shiftNoteService, teamTaskService, userService } from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import { getErrorMessage } from '../../services/errors';
import HrApprovalInbox from '../../shared/components/dashboard/HrApprovalInbox';

export default function SupervisorDashboard() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [users, taskRows, noteRows, checklistRows, breakRows] = await Promise.all([
        userService.findAllUsers(user.department ? { department: user.department } : undefined),
        teamTaskService.findBySupervisor(user.id).catch(() => []),
        shiftNoteService.findBySupervisor(user.id).catch(() => []),
        operationalChecklistService.findBySupervisor(user.id).catch(() => []),
        employeeBreakService.findAll({ filters: { supervisor_id: user.id }, orderBy: 'created_at', ascending: false }).catch(() => []),
      ]);
      setTeam((users || []).filter((u: any) => u.id !== user.id && ['employee', 'gatekeeper'].includes(u.role || 'employee')));
      setTasks(taskRows || []);
      setNotes(noteRows || []);
      setChecklists(checklistRows || []);
      setBreaks(breakRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, user?.department, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const summary = useMemo(() => ({
    team: team.length,
    openTasks: tasks.filter(t => ['open', 'in_progress'].includes(t.status)).length,
    criticalNotes: notes.filter(n => n.severity === 'critical').length,
    todayChecklists: checklists.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length,
    activeBreaks: breaks.filter(b => ['approved', 'out', 'active'].includes(b.status)).length,
  }), [breaks, checklists, notes, tasks, team.length]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={36} /></div>;

  return <div className="space-y-6 animate-fade-in" dir="rtl">
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white">
      <p className="text-white/70 text-sm font-semibold">Supervisor Operations</p>
      <h2 className="text-2xl font-extrabold mt-1">لوحة المشرف التشغيلية</h2>
      <p className="text-white/75 mt-2 text-sm">متابعة الفريق، مهام الوردية، الملاحظات، الاستراحات وقوائم الفحص.</p>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[
        { label: 'أفراد الفريق', value: summary.team, icon: Users, color: 'bg-blue-50 text-blue-700' },
        { label: 'مهام مفتوحة', value: summary.openTasks, icon: ClipboardList, color: 'bg-amber-50 text-amber-700' },
        { label: 'ملاحظات حرجة', value: summary.criticalNotes, icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
        { label: 'فحوصات اليوم', value: summary.todayChecklists, icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'استراحات نشطة', value: summary.activeBreaks, icon: ArrowRightLeft, color: 'bg-indigo-50 text-indigo-700' },
      ].map(item => { const Icon = item.icon; return <Card key={item.label}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18}/></div><p className="text-2xl font-extrabold text-slate-900">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></Card>; })}
    </div>

    {/* سلسلة موافقات الإجازات/الأذونات (مرحلة المشرف) */}
    <HrApprovalInbox />

    <div className="grid lg:grid-cols-2 gap-6">
      <Card><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ClipboardList size={18}/> آخر مهام الفريق</h3><div className="space-y-2">{tasks.slice(0,5).map(t => <div key={t.id} className="p-3 rounded-xl bg-slate-50 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-800">{t.title}</p><p className="text-xs text-slate-500">{t.priority} • {t.status}</p></div></div>)}{tasks.length===0 && <p className="text-center text-slate-400 py-6">لا توجد مهام</p>}</div></Card>
      <Card><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><StickyNote size={18}/> ملاحظات الوردية</h3><div className="space-y-2">{notes.slice(0,5).map(n => <div key={n.id} className="p-3 rounded-xl bg-slate-50"><p className="text-sm font-bold text-slate-800">{n.title}</p><p className="text-xs text-slate-500">{n.note_type} • {n.severity}</p></div>)}{notes.length===0 && <p className="text-center text-slate-400 py-6">لا توجد ملاحظات</p>}</div></Card>
    </div>
  </div>;
}
