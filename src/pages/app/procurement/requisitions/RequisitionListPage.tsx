import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { purchaseRequisitionService, prLineItemService, prApprovalService, type PurchaseRequisitionRecord } from '../../../../services/sdk';
import { useUIStore, useAuthStore } from '../../../../core/stores';
import { Plus, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function RequisitionsPage() {
  const { addToast } = useUIStore();
  const { user } = useAuthStore();
  const [prs, setPrs] = useState<PurchaseRequisitionRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'my' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ justification: '', priority: 'normal' as const, items: [{ description: '', quantity: 1, estimated_unit_price: 0 }] });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.items[0]?.description) {
      addToast('أدخل وصف البند على الأقل', 'error');
      return;
    }
    try {
      const prId = await purchaseRequisitionService.createWithItems({
        justification: form.justification,
        priority: form.priority,
        request_type: 'raw_material',
        items: form.items.filter(i=>i.description).map(i=>({ description: i.description, quantity: Number(i.quantity), unit: 'PCS', estimated_unit_price: Number(i.estimated_unit_price) })),
      });
      addToast(`تم إنشاء طلب الشراء ${prId.slice(0,8)} — بانتظار الموافقة`, 'success');
      setShowCreate(false);
      setForm({ justification: '', priority: 'normal', items: [{ description: '', quantity: 1, estimated_unit_price: 0 }] });
      await load();
    } catch (err: any) {
      addToast('فشل الإنشاء: ' + err.message, 'error');
    }
  };

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    pending_approval: 'bg-amber-100 text-amber-700',
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
          <p className="text-slate-500 mt-1">Wave1 — نقطة دخول إلزامية لكل إنفاق — يمنع Rogue Spending</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={filter} onChange={e=>setFilter(e.target.value as any)} className="border rounded-xl px-3 py-2 text-sm">
            <option value="all">الكل</option>
            <option value="my">طلباتي</option>
            <option value="pending">معلقة موافقة</option>
          </select>
          <Button onClick={()=>setShowCreate(true)}><Plus size={16} className="inline ml-1" />طلب جديد</Button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="space-y-3">
          {prs.map(pr => (
            <Card key={pr.id} className="flex justify-between items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm">{pr.pr_number}</span>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${statusColor[pr.status] || 'bg-slate-100'}`}>{pr.status}</span>
                  <span className={`text-[10px] px-2 py-1 rounded-full ${pr.priority === 'emergency' ? 'bg-red-100 text-red-700' : pr.priority === 'urgent' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100'}`}>{pr.priority}</span>
                </div>
                <div className="text-sm mt-1 text-slate-600">{pr.justification || 'بدون مبرر'}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Clock size={12} />{new Date(pr.created_at).toLocaleDateString('ar-SA')}</span>
                  <span>{pr.total_estimated?.toLocaleString()} {pr.currency_code}</span>
                  <span>Level {pr.current_approval_level}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={async()=>{ try { const lines = await prLineItemService.findByPr(pr.id); alert(lines.map(l=>`${l.description} × ${l.quantity} = ${l.estimated_total}`).join('\n')||'لا بنود'); } catch(e:any){ addToast(e.message,'error'); }}}>بنود</Button>
                <Button variant="secondary" size="sm" onClick={async()=>{ try { const approvals = await prApprovalService.findByPr(pr.id); alert(approvals.map(a=>`L${a.approval_level} ${a.approver_id.slice(0,6)}: ${a.decision}`).join('\n')||'لا موافقات'); } catch(e:any){ addToast(e.message,'error'); }}}>سير الموافقة</Button>
                {pr.status === 'pending_approval' && (
                  <>
                    <Button size="sm" className="bg-emerald-600" onClick={async()=>{ try { await prApprovalService.approve(pr.id, 'approved', 'موافق'); addToast('تمت الموافقة','success'); await load(); } catch(e:any){ addToast(e.message,'error'); } }}><CheckCircle size={14} className="inline ml-1" />موافقة</Button>
                    <Button size="sm" variant="secondary" className="!bg-red-50 !text-red-700" onClick={async()=>{ try { await prApprovalService.approve(pr.id, 'rejected', 'مرفوض'); addToast('تم الرفض','info'); await load(); } catch(e:any){ addToast(e.message,'error'); } }}><XCircle size={14} className="inline ml-1" />رفض</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
          {!prs.length && <Card className="py-16 text-center text-slate-500"><AlertTriangle className="mx-auto mb-2" />لا توجد طلبات</Card>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto">
            <h3 className="font-bold text-lg mb-4">طلب شراء جديد — PR</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <textarea required placeholder="مبرر الطلب — لماذا نحتاج هذا؟ (أمر إنتاج رقم...)" value={form.justification} onChange={e=>setForm({...form, justification: e.target.value})} className="w-full border rounded-xl p-3 text-sm min-h-[80px]" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.priority} onChange={e=>setForm({...form, priority: e.target.value as any})} className="border rounded-xl p-2.5 text-sm">
                  <option value="normal">عادي</option>
                  <option value="urgent">عاجل</option>
                  <option value="emergency">طارئ</option>
                </select>
                <div className="text-[11px] text-slate-400 p-2">سيُنشأ سير موافقة حسب القيمة: مدير قسم → مشتريات → مالية إذا &gt;50K</div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-sm">البنود</div>
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input required placeholder="الوصف" value={it.description} onChange={e=>{ const v=[...form.items]; v[idx].description=e.target.value; setForm({...form, items:v}); }} className="col-span-6 border rounded-xl p-2.5 text-sm" />
                    <input type="number" min={0.001} step={0.001} placeholder="كمية" value={it.quantity} onChange={e=>{ const v=[...form.items]; v[idx].quantity=Number(e.target.value); setForm({...form, items:v}); }} className="col-span-2 border rounded-xl p-2.5 text-sm" />
                    <input type="number" min={0} step={0.01} placeholder="سعر" value={it.estimated_unit_price} onChange={e=>{ const v=[...form.items]; v[idx].estimated_unit_price=Number(e.target.value); setForm({...form, items:v}); }} className="col-span-3 border rounded-xl p-2.5 text-sm" />
                    <button type="button" onClick={()=>{ setForm({...form, items: form.items.filter((_,i)=>i!==idx)}); }} className="col-span-1 text-red-500">✕</button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" onClick={()=>setForm({...form, items: [...form.items, { description:'', quantity:1, estimated_unit_price:0 }]})}>+ بند</Button>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">إنشاء وطلب موافقة</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">يُفحص الميزانية فورياً + ينشئ سير موافقة تلقائي حسب HOW_TO_ADD_A_PORTAL موافقة PR</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
