import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { procurementContractService, type ProcurementContractRecord, type ContractRenewalRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function ContractsPage() {
  const { addToast } = useUIStore();
  const [contracts, setContracts] = useState<ProcurementContractRecord[]>([]);
  const [renewals, setRenewals] = useState<ContractRenewalRecord[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const data = await procurementContractService.findAll({ orderBy: 'end_date', ascending: true, limit: 100 });
        setContracts(data as any);
        const ren = await procurementContractService.findRenewalsUpcoming(20);
        setRenewals(ren);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">إدارة دورة حياة العقود CLM</h1>
        <p className="text-slate-500 mt-1">قوالب 6 أنواع + مكتبة بنود مع Red Flags + Redlining تعاوني + إصدارات v0.1→v1.0 + توقيع إلكتروني + Obligations + تجديد 90-120 يوم — Unit 06 — عبر SDK فقط</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-bold mb-3">عقود ({contracts.length})</h3>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {contracts.map(c=>(
              <div key={c.id} className="p-3 border rounded-xl text-sm flex justify-between">
                <div><div className="font-bold">{c.contract_number} — {c.title}</div><div className="text-xs text-slate-500">{c.type} • {c.status} • {c.total_value?.toLocaleString()} {c.currency_code}</div></div>
                <div className="text-xs text-slate-400">ينتهي: {c.end_date ? new Date(c.end_date).toLocaleDateString('ar-SA') : '-'}</div>
              </div>
            ))}
            {!contracts.length && <div className="py-10 text-center text-slate-400 text-sm">لا عقود — أنشئ من قوالب MSA/SLA/SOW/NDA</div>}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold mb-3 text-amber-800">تجديدات قادمة 90 يوم (تنبيه)</h3>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {renewals.map((r:any)=>(
              <div key={r.id} className={`p-3 border rounded-xl text-sm ${r.renewal_status==='critical_30'?'bg-red-50 border-red-200':r.renewal_status==='warning_90'?'bg-amber-50 border-amber-200':'bg-white'}`}>
                <div className="flex justify-between"><span className="font-bold">{r.contract_number}</span><span className="text-xs">{r.days_until_expiry} يوم</span></div>
                <div className="text-xs text-slate-500">{r.title} — {r.total_value?.toLocaleString()} — {r.renewal_status}</div>
              </div>
            ))}
            {!renewals.length && <div className="py-10 text-center text-slate-400 text-sm">لا تجديدات قادمة</div>}
          </div>
          <div className="mt-3 p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500">يُنصح بضبط تنبيهات 90-120 يوم قبل التجديد — CLM يوفرها تلقائياً — يمنع خسارة 9% من الإيرادات حسب WorldCC</div>
        </Card>
      </div>

      <Card>
        <h3 className="font-bold">Obligations — تتبع الالتزامات</h3>
        <p className="text-xs text-slate-500 mt-1">كل عقد له التزامات: إرسال ضمان تنفيذ خلال 7 أيام، أول تسليم 1 أغسطس، تجديد تأمين 30 سبتمبر، مراجعة ربعية 1 أكتوبر... مع تنبيهات 30/7/0 يوم — صفحة ObligationsPage كاملة مع Edge Function cron يومي</p>
      </Card>
    </div>
  );
}
