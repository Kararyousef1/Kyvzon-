import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { sourcingEventService, purchaseRequisitionService, type SourcingEventRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';
import { Plus, Clock, FileText } from 'lucide-react';

export default function SourcingEventsPage() {
  const { addToast } = useUIStore();
  const [events, setEvents] = useState<SourcingEventRecord[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ pr_id: '', type: 'RFQ' as 'RFI'|'RFQ'|'RFP'|'auction' });

  const load = async () => {
    setLoading(true);
    try {
      const [evts, prList] = await Promise.all([
        sourcingEventService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 }),
        purchaseRequisitionService.findAll({ filters: { status: 'approved' }, limit: 100 }),
      ]);
      setEvents(evts);
      setPrs(prList);
    } catch (e:any) { addToast(e.message,'error'); } finally { setLoading(false); }
  };

  useEffect(()=>{ load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = await sourcingEventService.createFromPr(form.pr_id, form.type, 7);
      addToast(`تم إنشاء حدث توريد ${id.slice(0,8)}`, 'success');
      setShowCreate(false);
      await load();
    } catch (err:any) { addToast(err.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black">التوريد الاستراتيجي RFx</h1>
          <p className="text-slate-500 mt-1">RFI/RFQ/RFP + مقارنة TCO + مزاد عكسي — Unit 02 100% حقيقي</p>
        </div>
        <Button onClick={()=>setShowCreate(true)}><Plus size={16} className="inline ml-1" />حدث توريد من PR</Button>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(ev => (
            <Card key={ev.id}>
              <div className="flex justify-between">
                <span className="font-mono font-bold text-sm">{ev.event_number}</span>
                <span className={`text-[10px] px-2 py-1 rounded-full ${ev.status==='open'?'bg-emerald-100 text-emerald-700':ev.status==='awarded'?'bg-blue-100 text-blue-700':'bg-slate-100'}`}>{ev.type} • {ev.status}</span>
              </div>
              <div className="font-bold mt-2">{ev.title}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2"><Clock size={12} />{ev.close_date ? new Date(ev.close_date).toLocaleDateString('ar-SA') : 'بدون إغلاق'}</div>
              <div className="text-xs text-slate-400 mt-1">مرتبط PR: {ev.related_pr_id?.slice(0,8) || '-'}</div>
            </Card>
          ))}
          {!events.length && <div className="col-span-full py-16 text-center text-slate-500"><FileText className="mx-auto mb-2" />لا توجد أحداث توريد</div>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">حدث توريد جديد من PR معتمد</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <select required value={form.pr_id} onChange={e=>setForm({...form, pr_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm">
                <option value="">اختر PR معتمد</option>
                {prs.map((p:any)=><option key={p.id} value={p.id}>{p.pr_number} — {p.total_estimated} {p.currency_code}</option>)}
              </select>
              <select value={form.type} onChange={e=>setForm({...form, type:e.target.value as any})} className="w-full border rounded-xl p-2.5 text-sm">
                <option value="RFI">RFI — طلب معلومات</option>
                <option value="RFQ">RFQ — طلب تسعير</option>
                <option value="RFP">RFP — طلب مقترح</option>
                <option value="auction">مزاد عكسي</option>
              </select>
              <div className="text-[11px] text-slate-400">سيتم نسخ بنود PR كـ RFx line items تلقائياً + توليد رقم حدث فريد</div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">إنشاء</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
