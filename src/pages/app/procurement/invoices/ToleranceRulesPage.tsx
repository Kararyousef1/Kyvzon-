import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { toleranceRuleService, getCurrentTenantId } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function ToleranceRulesPage() {
  const { addToast } = useUIStore();
  const [rules, setRules] = useState<any[]>([]);

  const load = async () => {
    try {
      const data = await toleranceRuleService.findAll({ orderBy: 'min_percent', limit: 100 });
      setRules(data as any);
    } catch(e:any){ addToast(e.message,'error'); }
  };

  useEffect(()=>{ load(); }, []);

  const seed = async () => {
    try {
      const tenantId = getCurrentTenantId() || (localStorage.getItem('tenant_id') || '');
      if (!tenantId) { addToast('لا يوجد tenant_id في localStorage','error'); return; }
      await toleranceRuleService.seed(tenantId);
      addToast('تم بذر القواعد الافتراضية','success');
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black">حدود التسامح — Tolerance Thresholds</h1>
          <p className="text-sm text-slate-500 mt-1">ليس كل فرق صغير يستحق تأخير الدفع — من التقرير 05 — عبر SDK</p>
        </div>
        <Button onClick={seed} variant="secondary">بذر القواعد الافتراضية</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-right">النوع</th><th className="p-2">من %</th><th className="p-2">إلى %</th><th className="p-2">موافقة تلقائية</th><th className="p-2">دور المعتمد</th></tr></thead>
            <tbody className="divide-y">
              {rules.map((r:any)=>(
                <tr key={r.id}>
                  <td className="p-2"><span className={`text-[10px] px-2 py-1 rounded-full ${r.rule_type==='price'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{r.rule_type}</span></td>
                  <td className="p-2 font-mono">{r.min_percent}%</td>
                  <td className="p-2 font-mono">{r.max_percent}%</td>
                  <td className="p-2">{r.auto_approve ? '✅ نعم' : '❌ لا'}</td>
                  <td className="p-2">{r.approver_role || '—'}</td>
                </tr>
              ))}
              {!rules.length && <tr><td colSpan={5} className="p-10 text-center text-slate-400">لا قواعد — اضغط بذر القواعد: 0-0.5% auto, 0.5-2% ap_clerk, 2-5% procurement, 5-100% finance</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
