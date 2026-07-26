import { useEffect, useState } from 'react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { procurementApprovalRuleService } from '../../services/sdk';
import { useUIStore } from '../../core/stores';
import { departmentService } from '../../services/sdk/DepartmentService';

interface Rule {
  id: string;
  rule_name: string;
  min_amount: number;
  max_amount: number;
  department_id: string | null;
  level: number;
  required_role: string;
  is_active: boolean;
}

export default function ProcurementApprovalRulesPage() {
  const { addToast } = useUIStore();
  const [rules, setRules] = useState<Rule[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ rule_name: '', min_amount: 0, max_amount: 100000, department_id: '', level: 1, required_role: 'supervisor' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await procurementApprovalRuleService.findAll({ orderBy: 'level', ascending: true, limit: 200 });
      setRules((data as any) || []);
      const d = await departmentService.findActive();
      setDepts(d || []);
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await procurementApprovalRuleService.create({
        rule_name: form.rule_name,
        min_amount: Number(form.min_amount),
        max_amount: Number(form.max_amount),
        department_id: form.department_id || null,
        level: Number(form.level),
        required_role: form.required_role,
        is_active: true,
      } as any);
      addToast('تم إنشاء قاعدة الموافقة', 'success');
      setShowCreate(false);
      setForm({ rule_name: '', min_amount: 0, max_amount: 100000, department_id: '', level: 1, required_role: 'supervisor' });
      await load();
    } catch (err:any) { addToast(err.message,'error'); }
  };

  const toggleActive = async (r: Rule) => {
    try {
      await procurementApprovalRuleService.update(r.id, { is_active: !r.is_active } as any);
      await load();
    } catch (e:any){ addToast(e.message,'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذه القاعدة؟')) return;
    try {
      await procurementApprovalRuleService.delete(id);
      await load();
    } catch (e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black">قواعد موافقات المشتريات</h1>
          <p className="text-slate-500 mt-1">قابلة للتخصيص من الهيكل التنظيمي — حسب المبلغ والقسم — تطبق في resolve_procurement_approval_chain — عبر SDK فقط</p>
        </div>
        <Button onClick={()=>setShowCreate(true)}>قاعدة جديدة</Button>
      </div>

      <Card>
        <div className="text-[11px] text-slate-500 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <strong>المنطق:</strong> &lt;5K supervisor فقط, 5K-50K +manager, &gt;50K +procurement+finance, &gt;500K +admin — يُورث من الأب حتى 20 مستوى
        </div>
        {loading ? <div className="py-10 text-center">جاري التحميل...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="p-2 text-right">الاسم</th><th className="p-2">القسم</th><th className="p-2">المبلغ من-إلى</th><th className="p-2">المستوى</th><th className="p-2">الدور المطلوب</th><th className="p-2">نشط</th><th className="p-2">إجراءات</th></tr></thead>
              <tbody className="divide-y">
                {rules.map(r=>(
                  <tr key={r.id}>
                    <td className="p-2 font-bold">{r.rule_name}</td>
                    <td className="p-2">{r.department_id ? depts.find(d=>d.id===r.department_id)?.name_ar || r.department_id.slice(0,6) : 'كل الأقسام'}</td>
                    <td className="p-2 font-mono text-xs">{Number(r.min_amount).toLocaleString()} — {Number(r.max_amount).toLocaleString()}</td>
                    <td className="p-2">L{r.level}</td>
                    <td className="p-2"><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{r.required_role}</span></td>
                    <td className="p-2"><button onClick={()=>toggleActive(r)} className={`text-[10px] px-2 py-1 rounded-full ${r.is_active?'bg-emerald-100 text-emerald-700':'bg-slate-100'}`}>{r.is_active?'نشط':'معطل'}</button></td>
                    <td className="p-2"><button onClick={()=>handleDelete(r.id)} className="text-red-500 text-xs">حذف</button></td>
                  </tr>
                ))}
                {!rules.length && <tr><td colSpan={7} className="p-10 text-center text-slate-400">لا قواعد — سيتم استخدام القواعد الافتراضية حسب المبلغ</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="font-bold text-lg mb-4">قاعدة موافقة جديدة</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input required placeholder="اسم القاعدة" value={form.rule_name} onChange={e=>setForm({...form, rule_name:e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" required placeholder="من مبلغ" value={form.min_amount} onChange={e=>setForm({...form, min_amount:Number(e.target.value)})} />
                <Input type="number" required placeholder="إلى مبلغ" value={form.max_amount} onChange={e=>setForm({...form, max_amount:Number(e.target.value)})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={form.department_id} onChange={e=>setForm({...form, department_id:e.target.value})} className="border rounded-xl p-2.5 text-sm">
                  <option value="">كل الأقسام</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.name_ar}</option>)}
                </select>
                <select value={form.required_role} onChange={e=>setForm({...form, required_role:e.target.value})} className="border rounded-xl p-2.5 text-sm">
                  <option value="supervisor">مشرف القسم</option>
                  <option value="manager">مدير القسم</option>
                  <option value="direct_manager">المدير المباشر</option>
                  <option value="procurement">مسؤول مشتريات</option>
                  <option value="finance">مالية</option>
                  <option value="admin">إدارة عليا</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" min={1} max={5} required placeholder="المستوى 1-5" value={form.level} onChange={e=>setForm({...form, level:Number(e.target.value)})} />
                <div className="text-[11px] text-slate-400 p-2">المستوى 1 = أول موافق</div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">حفظ</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
