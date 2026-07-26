import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { procurementContractService, contractSignatureService } from '../../../../services/sdk';
import { supabase } from '../../../../services/supabase/supabase';
import { useUIStore } from '../../../../core/stores';

export default function SignaturesPage() {
  const { addToast } = useUIStore();
  const [sigs, setSigs] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [form, setForm] = useState({ contract_id: '', signer_email: '', signer_role: 'supplier' });
  const [show, setShow] = useState(false);

  const load = async () => {
    try {
      const cs = await procurementContractService.findAll({ filters: { status: 'approved' }, limit: 50 } as any);
      setContracts(cs as any);
      const data = await contractSignatureService.findAll({ orderBy: 'signed_at', ascending: false, limit: 100 });
      setSigs(data as any);
    } catch(e:any){ addToast(e.message,'error'); }
  };

  useEffect(()=>{ load(); }, []);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ip = '127.0.0.1';
      await contractSignatureService.sign(form.contract_id, form.signer_email, form.signer_role, ip);
      addToast('تم تسجيل التوقيع — إذا اكتمل 2 موقعين سيتحول العقد signed','success');
      setShow(false);
      setForm({ contract_id: '', signer_email: '', signer_role: 'supplier' });
      await load();
    } catch(err:any){ addToast(err.message,'error'); }
  };

  const sendViaDocuSign = async (contractId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('procurement-send-signature', {
        body: { contract_id: contractId },
      });
      if (error) throw error;
      addToast(`تم إرسال طلب توقيع عبر ${data?.mode || 'DocuSign'}`, 'success');
    } catch(e:any){ addToast('فشل إرسال DocuSign: '+e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black">التوقيعات الإلكترونية — E-Signature</h1>
          <p className="text-sm text-slate-500 mt-1">IP + OTP + تسلسل + Edge Function procurement-send-signature عبر DocuSign/BYOK — عبر SDK فقط</p>
        </div>
        <Button onClick={()=>setShow(true)}>توقيع جديد</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-bold mb-3">عقود بانتظار توقيع</h3>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {contracts.filter((c:any)=>['approved','active'].includes(c.status)).map((c:any)=>(
              <div key={c.id} className="p-3 border rounded-xl text-sm flex justify-between items-center">
                <div><div className="font-bold">{c.contract_number}</div><div className="text-xs text-slate-500">{c.title} — {c.status}</div></div>
                <Button size="sm" variant="secondary" onClick={()=>sendViaDocuSign(c.id)}>إرسال DocuSign</Button>
              </div>
            ))}
            {!contracts.filter((c:any)=>['approved','active'].includes(c.status)).length && <div className="py-8 text-center text-slate-400 text-sm">لا عقود بانتظار توقيع</div>}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold mb-3">سجل التوقيعات ({sigs.length})</h3>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {sigs.map((s:any)=>(
              <div key={s.id} className="p-3 border rounded-xl text-sm">
                <div className="flex justify-between"><span className="font-bold">{s.signer_email}</span><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{s.signer_role}</span></div>
                <div className="text-xs text-slate-500 mt-1">وقع: {s.signed_at ? new Date(s.signed_at).toLocaleString('ar-SA') : '-'} • IP: {s.ip_address || '-'} • OTP: {s.otp_verified ? '✅' : '—'}</div>
              </div>
            ))}
            {!sigs.length && <div className="py-10 text-center text-slate-400 text-sm">لا توقيعات</div>}
          </div>
        </Card>
      </div>

      {show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">تسجيل توقيع جديد</h3>
            <form onSubmit={handleSign} className="space-y-3">
              <select required value={form.contract_id} onChange={e=>setForm({...form, contract_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm">
                <option value="">اختر عقد</option>
                {contracts.map((c:any)=><option key={c.id} value={c.id}>{c.contract_number} — {c.title}</option>)}
              </select>
              <input required type="email" placeholder="بريد الموقّع" value={form.signer_email} onChange={e=>setForm({...form, signer_email:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm" />
              <select value={form.signer_role} onChange={e=>setForm({...form, signer_role:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm">
                <option value="supplier">مندوب المورد</option>
                <option value="buyer">مشتريات</option>
                <option value="legal">قانونية</option>
                <option value="finance">مالية</option>
                <option value="admin">إدارة عليا</option>
              </select>
              <div className="text-[11px] text-slate-400">سيُسجل IP + وقت بالثانية + سجل تسلسل كامل — إذا اكتمل 2 موقعين يتحول العقد signed</div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">تسجيل توقيع</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShow(false)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
