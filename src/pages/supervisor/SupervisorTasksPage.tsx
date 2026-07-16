import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Search, ClipboardList } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { teamTaskService, userService } from '../../services/sdk';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { getErrorMessage } from '../../services/errors';

export default function SupervisorTasksPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employee_id: '', title: '', description: '', priority: 'medium', due_at: '' });

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [taskRows, users] = await Promise.all([
        teamTaskService.findBySupervisor(user.id),
        userService.findAllUsers(user.department ? { department: user.department } : undefined),
      ]);
      setTasks(taskRows || []);
      setTeam((users || []).filter((u:any) => u.id !== user.id));
    } catch (err) { addToast(getErrorMessage(err), 'error'); }
    finally { setLoading(false); }
  }, [addToast, user?.department, user?.id]);
  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => tasks.filter(t => !search || [t.title,t.description,t.priority,t.status].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())), [search,tasks]);
  const createTask = async () => { if(!form.title.trim()) return addToast('يرجى إدخال عنوان المهمة','warning'); try { await teamTaskService.createTask({ supervisor_id: user?.id, employee_id: form.employee_id || undefined, title: form.title, description: form.description || undefined, priority: form.priority as any, due_at: form.due_at || undefined }); addToast('تم إنشاء المهمة','success'); setShowCreate(false); setForm({ employee_id:'', title:'', description:'', priority:'medium', due_at:'' }); await loadData(); } catch(err){ addToast(getErrorMessage(err),'error'); }};
  const complete = async (id:string) => { try { await teamTaskService.completeTask(id); addToast('تم إكمال المهمة','success'); await loadData(); } catch(err){ addToast(getErrorMessage(err),'error'); }};
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={36}/></div>;
  return <div className="space-y-6 animate-fade-in" dir="rtl"><div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap"><div><p className="text-white/70 text-sm">Team Tasks</p><h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><ClipboardList/> مهام الفريق</h2></div><Button onClick={()=>setShowCreate(true)} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<Plus size={16}/>} iconPosition="left">مهمة جديدة</Button></div><div className="relative"><Search size={16} className="absolute right-3 top-3 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في المهام..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"/></div><div className="grid gap-3">{filtered.length===0?<Card><p className="text-center py-8 text-slate-400">لا توجد مهام</p></Card>:filtered.map(t=><Card key={t.id}><div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{t.title}</p><p className="text-xs text-slate-500 mt-1">{t.priority} • {t.status}</p>{t.description&&<p className="text-sm text-slate-600 mt-2">{t.description}</p>}</div>{t.status!=='completed'?<Button size="sm" variant="success" onClick={()=>complete(t.id)} icon={<CheckCircle2 size={14}/>} iconPosition="left">إكمال</Button>:<span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">مكتملة</span>}</div></Card>)}</div>{showCreate&&<TaskModal form={form} setForm={setForm} team={team} onClose={()=>setShowCreate(false)} onSubmit={createTask}/>}</div>;
}
function TaskModal({form,setForm,team,onClose,onSubmit}:any){return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}><h3 className="font-bold text-lg mb-4">مهمة جديدة</h3><div className="space-y-3"><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"><option value="">للفريق / غير مخصصة</option>{team.map((e:any)=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="عنوان المهمة" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="الوصف" rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">عالٍ</option><option value="critical">حرج</option></select><input type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"/><div className="flex gap-2"><Button variant="secondary" fullWidth onClick={onClose}>إلغاء</Button><Button fullWidth onClick={onSubmit}>حفظ</Button></div></div></div></div>}
