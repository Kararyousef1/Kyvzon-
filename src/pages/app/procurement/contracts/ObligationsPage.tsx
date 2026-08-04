import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { contractObligationService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function ObligationsPage() {
  const { addToast } = useUIStore();
  const [obs, setObs] = useState<any[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const data = await contractObligationService.findAll({ orderBy: 'due_date', ascending: true, limit: 100 });
        setObs(data);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  const getStatusColor = (status: string, due: string) => {
    const days = Math.floor((new Date(due).getTime() - Date.now())/86400000);
    if (status==='completed') return 'bg-emerald-100 text-emerald-700';
    if (days <0) return 'bg-red-100 text-red-700';
    if (days <=7) return 'bg-orange-100 text-orange-700';
    if (days <=30) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100';
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">تتبع الالتزامات — Obligation Tracking</h1>
        <p className="text-slate-500 mt-1">أي شيء يجب أن يفعله طرف بموجب العقد — مع تنبيهات 30/7/0 يوم — Unit 06 — عبر SDK فقط</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">الالتزام</th><th className="p-2">المسؤول</th><th className="p-2">الموعد</th><th className="p-2">الحالة</th><th className="p-2">العقد</th></tr></thead>
            <tbody className="divide-y">
              {obs.map((o:any)=>(
                <tr key={o.id}>
                  <td className="p-2 font-bold">{o.description}</td>
                  <td className="p-2"><span className={`text-[10px] px-2 py-1 rounded-full ${o.responsible_party==='supplier'?'bg-blue-100 text-blue-700':o.responsible_party==='buyer'?'bg-emerald-100 text-emerald-700':'bg-purple-100 text-purple-700'}`}>{o.responsible_party}</span></td>
                  <td className="p-2">{o.due_date ? new Date(o.due_date).toLocaleDateString('ar-SA') : '-'} <span className="text-[10px] text-slate-400">({Math.floor((new Date(o.due_date).getTime()-Date.now())/86400000)} يوم)</span></td>
                  <td className="p-2"><span className={`text-[10px] px-2 py-1 rounded-full ${getStatusColor(o.status, o.due_date)}`}>{o.status}</span></td>
                  <td className="p-2 font-mono text-xs">{o.contract_id?.slice(0,6)}</td>
                </tr>
              ))}
              {!obs.length && <tr><td colSpan={5} className="p-10 text-center text-slate-400">لا التزامات — مثال: إرسال ضمان تنفيذ خلال 7 أيام, أول تسليم 1 أغسطس, تجديد تأمين 30 سبتمبر</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid md:grid-cols-3 gap-3 text-[11px]">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">قبل 30 يوم: إشعار للمسؤول</div>
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">قبل 7 أيام: تذكير ثانٍ + إشعار للمدير</div>
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">عند الموعد: تنبيه عاجل + تسجيل إخلال</div>
        </div>
      </Card>
    </div>
  );
}
