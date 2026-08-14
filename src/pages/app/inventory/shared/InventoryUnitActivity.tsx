import { useEffect, useState } from 'react';
import {
  inventoryRecordService,
  type InventoryUnitKey,
} from '../../../../services/sdk';
type Activity = Record<string, unknown>;

const actionLabel: Record<string,string> = {
  edit:'تعديل', status_change:'تغيير حالة', create:'إنشاء', close:'إغلاق', cancel:'إلغاء', approve:'اعتماد'
};

export function InventoryUnitActivity({unit}:{unit:InventoryUnitKey}){
  const [rows,setRows]=useState<Activity[]>([]);
  useEffect(()=>{
    let active=true;
    inventoryRecordService.findUnitActivity(unit,8)
      .then(data=>{if(active)setRows(data)})
      .catch(()=>{if(active)setRows([])});
    return()=>{active=false};
  },[unit]);
  return <section dir="rtl" className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-5"><div className="flex items-center justify-between mb-3"><h3 className="font-black text-slate-900">آخر التعديلات والإغلاقات</h3><span className="text-xs text-slate-400">Audit Trail</span></div>{rows.length? <div className="space-y-2">{rows.map((r,i)=><div key={String(r.entity_id)+String(r.created_at)+i} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><div className="text-sm font-bold text-slate-800">{actionLabel[String(r.action)]||String(r.action)} — {String(r.entity_table)}</div><div className="text-xs text-slate-500 mt-1">{String(r.comments||'بدون سبب مسجل')}</div><div className="text-[11px] text-slate-400 mt-1">{String(r.actor_name||r.actor_id||'—')}</div></div><div className="text-[11px] text-slate-400 whitespace-nowrap">{r.created_at?new Date(String(r.created_at)).toLocaleString('ar-SA'):'—'}</div></div>)}</div> : <div className="text-sm text-slate-400 p-4 text-center">لا توجد تعديلات أو إغلاقات مسجلة لهذه الوحدة بعد</div>}</section>;
}
