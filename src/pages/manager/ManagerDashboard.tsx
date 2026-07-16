import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, TrendingUp, Users, Wallet } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { approvalRequestService, managerWorkloadItemService, userService } from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import { getErrorMessage } from '../../services/errors';

export default function ManagerDashboard() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [workload, setWorkload] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [users, approvalRows, workloadRows] = await Promise.all([
        userService.findAllUsers(user.department ? { department: user.department } : undefined),
        approvalRequestService.findForApprover(user.id).catch(() => []),
        managerWorkloadItemService.findByManager(user.id).catch(() => []),
      ]);
      setTeam((users || []).filter((u:any) => u.id !== user.id && (u.manager_id === user.id || u.department === user.department)));
      setApprovals(approvalRows || []);
      setWorkload(workloadRows || []);
    } catch (err) { addToast(getErrorMessage(err), 'error'); }
    finally { setLoading(false); }
  }, [addToast, user?.department, user?.id]);
  useEffect(() => { loadData(); }, [loadData]);

  const summary = useMemo(() => ({
    team: team.length,
    pendingApprovals: approvals.filter(a => a.status === 'pending').length,
    urgentApprovals: approvals.filter(a => a.priority === 'urgent' && a.status === 'pending').length,
    openWorkload: workload.filter(w => ['open','in_progress'].includes(w.status)).length,
    completedWorkload: workload.filter(w => w.status === 'completed').length,
  }), [approvals, team.length, workload]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-amber-600" size={36}/></div>;
  return <div className="space-y-6 animate-fade-in" dir="rtl"><div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white"><p className="text-white/75 text-sm">Manager Portal</p><h2 className="text-2xl font-extrabold mt-1">لوحة المدير</h2><p className="text-white/80 mt-2 text-sm">نظرة تنفيذية على الفريق، الموافقات، وعبء العمل.</p></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[{l:'الفريق',v:summary.team,i:Users,c:'bg-amber-50 text-amber-700'},{l:'موافقات معلقة',v:summary.pendingApprovals,i:ClipboardCheck,c:'bg-blue-50 text-blue-700'},{l:'عاجلة',v:summary.urgentApprovals,i:Wallet,c:'bg-red-50 text-red-700'},{l:'عمل مفتوح',v:summary.openWorkload,i:TrendingUp,c:'bg-purple-50 text-purple-700'},{l:'منجز',v:summary.completedWorkload,i:CheckCircle2,c:'bg-emerald-50 text-emerald-700'}].map(x=>{const I=x.i;return <Card key={x.l}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${x.c}`}><I size={18}/></div><p className="text-2xl font-extrabold text-slate-900">{x.v}</p><p className="text-xs text-slate-500">{x.l}</p></Card>})}</div><div className="grid lg:grid-cols-2 gap-6"><Card><h3 className="font-bold text-slate-800 mb-4">آخر الموافقات</h3>{approvals.slice(0,5).map(a=><div key={a.id} className="p-3 bg-slate-50 rounded-xl mb-2"><p className="font-bold text-sm text-slate-800">{a.title}</p><p className="text-xs text-slate-500">{a.request_type} • {a.status}</p></div>)}{approvals.length===0&&<p className="text-center text-slate-400 py-6">لا توجد موافقات</p>}</Card><Card><h3 className="font-bold text-slate-800 mb-4">عبء العمل</h3>{workload.slice(0,5).map(w=><div key={w.id} className="p-3 bg-slate-50 rounded-xl mb-2"><p className="font-bold text-sm text-slate-800">{w.title}</p><p className="text-xs text-slate-500">{w.priority} • {w.status}</p></div>)}{workload.length===0&&<p className="text-center text-slate-400 py-6">لا توجد عناصر عمل</p>}</Card></div></div>;
}
