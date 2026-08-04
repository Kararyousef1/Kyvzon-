import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import {
  costCenterService,
  departmentService,
  purchaseRequisitionService,
  prApprovalService,
  procurementReorderPointService,
  type ProcurementReorderPointRecord,
  type PurchaseRequisitionRecord,
  supplierService,
  type SupplierRecord,
} from '../../../../services/sdk';
import { useUIStore, useAuthStore } from '../../../../core/stores';
import { AlertTriangle, CheckCircle, Clock, Eye, Plus, XCircle } from 'lucide-react';

type LookupOption = { id: string; name_ar?: string | null; name?: string | null; code?: string | null };
type RequestType = 'raw_material' | 'service' | 'asset' | 'consumable' | 'other';
type BudgetScope = 'cost_center' | 'project' | 'category' | 'capex';
type Priority = 'normal' | 'urgent' | 'emergency';

type PrFormItem = {
  item_code: string;
  description: string;
  quantity: number;
  unit: string;
  estimated_unit_price: number;
  suggested_supplier_id: string;
  unspsc_code: string;
  notes: string;
};

const emptyItem = (): PrFormItem => ({
  item_code: '',
  description: '',
  quantity: 1,
  unit: 'PCS',
  estimated_unit_price: 0,
  suggested_supplier_id: '',
  unspsc_code: '',
  notes: '',
});

export default function RequisitionsPage() {
  const { addToast } = useUIStore();
  const { user } = useAuthStore();
  const [prs, setPrs] = useState<PurchaseRequisitionRecord[]>([]);
  const [departments, setDepartments] = useState<LookupOption[]>([]);
  const [costCenters, setCostCenters] = useState<LookupOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [reorderPoints, setReorderPoints] = useState<ProcurementReorderPointRecord[]>([]);
  const [showReorder, setShowReorder] = useState(false);
  const [filter, setFilter] = useState<'all' | 'my' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    department_id: '',
    cost_center_id: '',
    needed_by_date: '',
    justification: '',
    priority: 'normal' as 'normal' | 'urgent' | 'emergency',
    emergency_reason: '',
    request_type: 'raw_material' as 'raw_material' | 'service' | 'asset' | 'consumable' | 'other',
    budget_scope: 'cost_center' as 'cost_center' | 'project' | 'category' | 'capex',
    budget_category_code: '',
    currency_code: 'SAR',
    items: [emptyItem()],
  });

  const loadLookups = async () => {
    const [deptRows, costRows, supplierRows, reorderRows] = await Promise.all([
      departmentService.findActive().catch(() => []),
      costCenterService.findActive().catch(() => []),
      supplierService.findApproved().catch(() => []),
      procurementReorderPointService.findTriggered().catch(() => []),
    ]);
    setDepartments(deptRows as LookupOption[]);
    setCostCenters(costRows as LookupOption[]);
    setSuppliers(supplierRows);
    setReorderPoints(reorderRows);
  };

  const load = async () => {
    setLoading(true);
    try {
      let data: PurchaseRequisitionRecord[] = [];
      if (filter === 'my') {
        data = await purchaseRequisitionService.findAll({ filters: { requester_id: user?.id }, orderBy: 'created_at', ascending: false, limit: 100 });
      } else if (filter === 'pending') {
        data = await purchaseRequisitionService.findAll({ filters: { status: 'pending_approval' }, orderBy: 'created_at', ascending: false, limit: 100 });
      } else {
        data = await purchaseRequisitionService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 });
      }
      setPrs(data);
    } catch (e: any) {
      addToast('فشل التحميل: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { loadLookups(); }, []);

  const estimatedTotal = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.estimated_unit_price || 0), 0), [form.items]);

  const updateItem = (idx: number, patch: Partial<PrFormItem>) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], ...patch };
    setForm({ ...form, items });
  };

  const resetForm = () => {
    setForm({
      department_id: '',
      cost_center_id: '',
      needed_by_date: '',
      justification: '',
      priority: 'normal',
      emergency_reason: '',
      request_type: 'raw_material',
      budget_scope: 'cost_center',
      budget_category_code: '',
      currency_code: 'SAR',
      items: [emptyItem()],
    });
  };

  const generateFromReorderPoints = async () => {
    try {
      const count = await purchaseRequisitionService.generateFromReorderPoints();
      addToast(`تم توليد ${count} طلبات من نقاط إعادة الطلب`, 'success');
      await Promise.all([load(), loadLookups()]);
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = form.items.filter(i => i.description.trim());
    if (!items.length) { addToast('أدخل بنداً واحداً على الأقل', 'error'); return; }
    if (!form.justification.trim()) { addToast('مبرر الطلب مطلوب', 'error'); return; }
    if (form.priority === 'emergency' && form.emergency_reason.trim().length < 10) {
      addToast('سبب الطوارئ يجب أن يكون 10 أحرف على الأقل', 'error');
      return;
    }

    setSaving(true);
    try {
      const prId = await purchaseRequisitionService.createWithItems({
        department_id: form.department_id || undefined,
        cost_center_id: form.cost_center_id || undefined,
        needed_by_date: form.needed_by_date || undefined,
        justification: form.justification,
        emergency_reason: form.priority === 'emergency' ? form.emergency_reason : undefined,
        priority: form.priority,
        request_type: form.request_type,
        budget_scope: form.request_type === 'asset' ? 'capex' : form.budget_scope,
        budget_category_code: form.budget_category_code || undefined,
        currency_code: form.currency_code,
        items: items.map(i => ({
          item_code: i.item_code || undefined,
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit || 'PCS',
          estimated_unit_price: Number(i.estimated_unit_price),
          suggested_supplier_id: i.suggested_supplier_id || undefined,
          unspsc_code: i.unspsc_code || undefined,
          notes: i.notes || undefined,
        })),
      });
      addToast(`تم إنشاء طلب الشراء ${prId.slice(0,8)} — بانتظار الموافقة`, 'success');
      setShowCreate(false);
      resetForm();
      await load();
    } catch (err: any) {
      addToast('فشل الإنشاء: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (pr: PurchaseRequisitionRecord, decision: 'approved' | 'rejected') => {
    try {
      await prApprovalService.approve(pr.id, decision, decision === 'approved' ? 'موافق' : 'مرفوض');
      addToast(decision === 'approved' ? 'تمت الموافقة' : 'تم الرفض', decision === 'approved' ? 'success' : 'info');
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-indigo-100 text-indigo-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    revision_required: 'bg-orange-100 text-orange-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    converted_to_po: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black">طلبات الشراء PR</h1>
          <p className="text-slate-500 mt-1">نقطة الدخول الإلزامية لكل إنفاق — مع فحص ميزانية وسير موافقات</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={filter} onChange={e=>setFilter(e.target.value as 'all' | 'my' | 'pending')} className="border rounded-xl px-3 py-2 text-sm">
            <option value="all">الكل</option>
            <option value="my">طلباتي</option>
            <option value="pending">معلقة موافقة</option>
          </select>
          <Button variant="secondary" onClick={()=>setShowReorder(true)}>نقاط ROP ({reorderPoints.length})</Button>
          <Button variant="secondary" onClick={generateFromReorderPoints}>توليد من ROP/MRP</Button>
          <Button onClick={()=>setShowCreate(true)}><Plus size={16} className="inline ml-1" />طلب جديد</Button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="space-y-3">
          {prs.map(pr => (
            <Card key={pr.id} className="flex justify-between items-center gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{pr.pr_number}</span>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${statusColor[pr.status] || 'bg-slate-100'}`}>{pr.status}</span>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${pr.priority === 'emergency' ? 'bg-red-100 text-red-700' : pr.priority === 'urgent' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{pr.priority}</span>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${pr.budget_status === 'exceeded' ? 'bg-red-100 text-red-700' : pr.budget_status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>ميزانية: {pr.budget_status || '—'}</span>
                </div>
                <div className="text-sm mt-1 text-slate-600 truncate max-w-3xl">{pr.justification || 'بدون مبرر'}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1"><Clock size={12} />{new Date(pr.created_at).toLocaleDateString('ar-SA')}</span>
                  <span>{Number(pr.total_estimated || 0).toLocaleString()} {pr.currency_code}</span>
                  <span>{pr.request_type}</span>
                  <span>Level {pr.current_approval_level}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link to={`/app/procurement/requisitions/${pr.id}`}>
                  <Button variant="secondary" size="sm"><Eye size={14} className="inline ml-1" />تفاصيل</Button>
                </Link>
                {pr.status === 'pending_approval' && (
                  <>
                    <Button size="sm" className="bg-emerald-600" onClick={()=>decide(pr, 'approved')}><CheckCircle size={14} className="inline ml-1" />موافقة</Button>
                    <Button size="sm" variant="secondary" className="!bg-red-50 !text-red-700" onClick={()=>decide(pr, 'rejected')}><XCircle size={14} className="inline ml-1" />رفض</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
          {!prs.length && <Card className="py-16 text-center text-slate-500"><AlertTriangle className="mx-auto mb-2" />لا توجد طلبات</Card>}
        </div>
      )}

      {showReorder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-lg">نقاط إعادة الطلب ROP/MRP</h3>
                <p className="text-sm text-slate-500 mt-1">هذه الأصناف وصلت أو نزلت تحت نقطة إعادة الطلب، ويمكن توليد PR تلقائياً لها.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={()=>setShowReorder(false)}>إغلاق</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2">الوصف</th>
                    <th className="p-2">المخزون</th>
                    <th className="p-2">نقطة الطلب</th>
                    <th className="p-2">كمية الطلب</th>
                    <th className="p-2">الأولوية</th>
                    <th className="p-2">آخر توليد</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reorderPoints.map(rp => (
                    <tr key={rp.id}>
                      <td className="p-2 font-mono">{rp.item_code}</td>
                      <td className="p-2">{rp.description}</td>
                      <td className="p-2 text-center text-red-700 font-bold">{rp.current_stock} {rp.unit}</td>
                      <td className="p-2 text-center">{rp.reorder_point}</td>
                      <td className="p-2 text-center">{rp.reorder_qty}</td>
                      <td className="p-2 text-center">{rp.priority || 'normal'}</td>
                      <td className="p-2 text-center text-xs">{rp.last_generated_at ? new Date(rp.last_generated_at).toLocaleString('ar-SA') : '—'}</td>
                    </tr>
                  ))}
                  {!reorderPoints.length && <tr><td colSpan={7} className="p-10 text-center text-slate-400">لا توجد نقاط إعادة طلب متجاوزة حالياً</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={generateFromReorderPoints}>توليد PR للأصناف المتجاوزة</Button>
              <Button variant="secondary" onClick={loadLookups}>تحديث القائمة</Button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-5xl max-h-[92vh] overflow-auto">
            <h3 className="font-bold text-lg mb-4">طلب شراء جديد — PR</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <select value={form.department_id} onChange={e=>setForm({...form, department_id:e.target.value})} className="border rounded-xl p-2.5 text-sm">
                  <option value="">القسم — اختياري</option>
                  {departments.map((d:any)=><option key={d.id} value={d.id}>{d.name_ar || d.name_en}</option>)}
                </select>
                <select value={form.cost_center_id} onChange={e=>setForm({...form, cost_center_id:e.target.value})} className="border rounded-xl p-2.5 text-sm">
                  <option value="">مركز التكلفة — اختياري</option>
                  {costCenters.map((cc:any)=><option key={cc.id} value={cc.id}>{cc.code} — {cc.name_ar}</option>)}
                </select>
                <input type="date" value={form.needed_by_date} onChange={e=>setForm({...form, needed_by_date:e.target.value})} className="border rounded-xl p-2.5 text-sm" />
                <select value={form.currency_code} onChange={e=>setForm({...form, currency_code:e.target.value})} className="border rounded-xl p-2.5 text-sm">
                  <option value="SAR">SAR</option>
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div className="grid md:grid-cols-5 gap-3">
                <select value={form.request_type} onChange={e=>setForm({...form, request_type:e.target.value as RequestType, budget_scope: e.target.value === 'asset' ? 'capex' : form.budget_scope})} className="border rounded-xl p-2.5 text-sm">
                  <option value="raw_material">خامة إنتاج</option>
                  <option value="service">خدمة</option>
                  <option value="asset">أصل ثابت CAPEX</option>
                  <option value="consumable">مستهلكات</option>
                  <option value="other">أخرى</option>
                </select>
                <select value={form.budget_scope} onChange={e=>setForm({...form, budget_scope:e.target.value as BudgetScope})} className="border rounded-xl p-2.5 text-sm" disabled={form.request_type === 'asset'}>
                  <option value="cost_center">ميزانية مركز تكلفة</option>
                  <option value="project">ميزانية مشروع</option>
                  <option value="category">ميزانية فئة</option>
                  <option value="capex">CAPEX</option>
                </select>
                <input placeholder="كود فئة الميزانية" value={form.budget_category_code} onChange={e=>setForm({...form, budget_category_code:e.target.value})} className="border rounded-xl p-2.5 text-sm" />
                <select value={form.priority} onChange={e=>setForm({...form, priority:e.target.value as Priority})} className="border rounded-xl p-2.5 text-sm">
                  <option value="normal">عادي</option>
                  <option value="urgent">عاجل</option>
                  <option value="emergency">طارئ</option>
                </select>
                <div className="text-sm font-bold bg-slate-50 border rounded-xl p-2.5">الإجمالي: {estimatedTotal.toLocaleString()} {form.currency_code}</div>
              </div>

              {form.priority === 'emergency' && (
                <textarea required placeholder="سبب الطوارئ — مطلوب للطلبات الطارئة" value={form.emergency_reason} onChange={e=>setForm({...form, emergency_reason:e.target.value})} className="w-full border rounded-xl p-3 text-sm min-h-[70px]" />
              )}

              <textarea required placeholder="مبرر الطلب — لماذا نحتاج هذا؟ (أمر إنتاج رقم، مشروع، احتياج تشغيلي...)" value={form.justification} onChange={e=>setForm({...form, justification:e.target.value})} className="w-full border rounded-xl p-3 text-sm min-h-[90px]" />

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="font-bold text-sm">البنود</div>
                  <Button type="button" variant="secondary" size="sm" onClick={()=>setForm({...form, items:[...form.items, emptyItem()]})}>+ بند</Button>
                </div>
                {form.items.map((it, idx) => (
                  <div key={idx} className="p-3 border rounded-2xl bg-slate-50/60 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input placeholder="كود الصنف" value={it.item_code} onChange={e=>updateItem(idx,{item_code:e.target.value})} className="col-span-2 border rounded-xl p-2.5 text-sm" />
                      <input required placeholder="الوصف" value={it.description} onChange={e=>updateItem(idx,{description:e.target.value})} className="col-span-4 border rounded-xl p-2.5 text-sm" />
                      <input type="number" min={0.001} step={0.001} placeholder="كمية" value={it.quantity} onChange={e=>updateItem(idx,{quantity:Number(e.target.value)})} className="col-span-2 border rounded-xl p-2.5 text-sm" />
                      <input placeholder="وحدة" value={it.unit} onChange={e=>updateItem(idx,{unit:e.target.value})} className="col-span-1 border rounded-xl p-2.5 text-sm" />
                      <input type="number" min={0} step={0.01} placeholder="سعر" value={it.estimated_unit_price} onChange={e=>updateItem(idx,{estimated_unit_price:Number(e.target.value)})} className="col-span-2 border rounded-xl p-2.5 text-sm" />
                      <button type="button" onClick={()=>setForm({...form, items: form.items.filter((_,i)=>i!==idx) || [emptyItem()]})} className="col-span-1 text-red-500 font-bold">✕</button>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2">
                      <select value={it.suggested_supplier_id} onChange={e=>updateItem(idx,{suggested_supplier_id:e.target.value})} className="border rounded-xl p-2.5 text-sm bg-white">
                        <option value="">مورد مقترح — اختياري</option>
                        {suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name}</option>)}
                      </select>
                      <input placeholder="UNSPSC" value={it.unspsc_code} onChange={e=>updateItem(idx,{unspsc_code:e.target.value})} className="border rounded-xl p-2.5 text-sm" />
                      <input placeholder="ملاحظات البند" value={it.notes} onChange={e=>updateItem(idx,{notes:e.target.value})} className="border rounded-xl p-2.5 text-sm" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button disabled={saving} type="submit" className="flex-1">إنشاء وطلب موافقة</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">سيتم فحص الميزانية وإنشاء سلسلة الموافقة عبر RPC محمية بدور وtenant.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
