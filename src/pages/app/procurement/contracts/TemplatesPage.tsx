import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { contractTemplateService, contractClauseService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function TemplatesPage() {
  const { addToast } = useUIStore();
  const [templates, setTemplates] = useState<any[]>([]);
  const [clauses, setClauses] = useState<any[]>([]);

  useEffect(()=>{
    (async()=>{
      try {
        const t = await contractTemplateService.findAll({ limit: 50 });
        setTemplates(t || []);
        const c = await contractClauseService.findAll({ limit: 100 });
        setClauses(c || []);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">قوالب العقود ومكتبة البنود</h1>
        <p className="text-sm text-slate-500 mt-1">6 أنواع قوالب (MSA/SLA/SOW/PO_TC/NDA/IP) + مكتبة بنود مع Red Flags — Unit 06 — عبر SDK فقط</p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-bold mb-3">قوالب العقود ({templates.length})</h3>
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {templates.map((t:any)=>(
              <div key={t.id} className="p-3 border rounded-xl text-sm">
                <div className="font-bold">{t.name} <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 ml-2">{t.type}</span></div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{t.content?.slice(0,120)}...</div>
              </div>
            ))}
            {!templates.length && <div className="py-10 text-center text-slate-400 text-sm">لا قوالب — أنشئ قوالب MSA للعلاقات طويلة الأمد, SLA للخدمات المستمرة, SOW لمشاريع محددة, NDA للمعلومات السرية</div>}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold mb-3">مكتبة البنود — مع Red Flags</h3>
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {clauses.map((c:any)=>(
              <div key={c.id} className={`p-3 border rounded-xl text-sm ${c.is_red_flag ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <div className="flex justify-between"><span className="font-bold">{c.title}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${c.is_red_flag ? 'bg-red-100 text-red-700' : c.is_standard ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>{c.clause_type} {c.is_red_flag ? '🔴 Red Flag' : c.is_standard ? 'معياري' : 'مخصص'}</span></div>
                <div className="text-xs text-slate-600 mt-1">{c.content?.slice(0,150)}...</div>
              </div>
            ))}
            {!clauses.length && <div className="py-10 text-center text-slate-400 text-sm">لا بنود — أضف بنود دفع Net30/Net45 مع خصم 2/10, تسليم DDP/FOB/CIF, ضمان 12 شهر</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
