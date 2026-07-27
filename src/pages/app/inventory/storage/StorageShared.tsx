import { useEffect, useState } from 'react';
import { InventoryRecordTools } from '../shared/InventoryRecordTools';
import {
  inventoryAbcClassificationService,
  inventoryAffinityRuleService,
  inventoryLocationLabelPrintService,
  inventoryReplenishmentTaskService,
  inventorySeasonalSlottingPlanService,
  inventorySlottingRecommendationService,
  inventorySlowMovingReportSubscriptionService,
  inventoryStorageAnalyticsService,
  inventoryTaskInterleavingSuggestionService,
} from '../../../../services/sdk';

type Row = Record<string, unknown>;
type Config = { title: string; subtitle: string; load: () => Promise<Row[]>; columns: Array<{key:string;label:string}>; action?: () => Promise<string | number | Row> };

const configs: Record<string, Config> = {
  map: { title:'خريطة المستودع الرقمية', subtitle:'كل موقع، نسبة الامتلاء، الحالة، وعدد الأصناف', load:()=>inventoryStorageAnalyticsService.locationMap(), columns:[{key:'warehouse_code',label:'المستودع'},{key:'full_location_code',label:'الموقع'},{key:'location_type',label:'النوع'},{key:'status',label:'الحالة'},{key:'capacity_percent',label:'الامتلاء %'},{key:'item_count',label:'الأصناف'}] },
  heatmap: { title:'Heatmap النشاط', subtitle:'المناطق الحارة والباردة حسب حركات آخر 30 يوم', load:()=>inventoryStorageAnalyticsService.heatmap(), columns:[{key:'location_code',label:'الموقع'},{key:'movement_30d',label:'30 يوم'},{key:'movement_7d',label:'7 أيام'},{key:'heat_level',label:'الحرارة'}] },
  slotting: { title:'محرك Slotting', subtitle:'ABC وتصنيف Golden Zone واقتراحات إعادة الترتيب', load:()=>inventorySlottingRecommendationService.findAll({orderBy:'created_at',ascending:false,limit:100}) as unknown as Promise<Row[]>, action:()=>inventorySlottingRecommendationService.generate(), columns:[{key:'recommendation_type',label:'النوع'},{key:'reason',label:'السبب'},{key:'score',label:'النقاط'},{key:'status',label:'الحالة'}] },
  abc: { title:'ABC Classification', subtitle:'تصنيف الأصناف حسب حركة السحب', load:()=>inventoryAbcClassificationService.findAll({orderBy:'calculated_at',ascending:false,limit:100}) as unknown as Promise<Row[]>, action:()=>inventoryAbcClassificationService.refresh(90), columns:[{key:'item_id',label:'الصنف'},{key:'pick_count',label:'عدد السحوبات'},{key:'movement_percent',label:'النسبة'},{key:'cumulative_percent',label:'التراكمي'},{key:'abc_class',label:'ABC'}] },
  replenishment: { title:'إدارة التجديد', subtitle:'Min/Max + Dynamic Replenishment', load:()=>inventoryReplenishmentTaskService.findAll({orderBy:'created_at',ascending:false,limit:100}) as unknown as Promise<Row[]>, action:()=>inventoryReplenishmentTaskService.generateDynamic(), columns:[{key:'task_number',label:'المهمة'},{key:'quantity',label:'الكمية'},{key:'priority',label:'الأولوية'},{key:'status',label:'الحالة'}] },
  affinity: { title:'Affinity Slotting', subtitle:'حساب الأصناف التي تسحب معاً واقتراح قربها', load:()=>inventoryAffinityRuleService.findAll({orderBy:'affinity_score',ascending:false,limit:100}) as unknown as Promise<Row[]>, action:()=>inventoryAffinityRuleService.refresh(180), columns:[{key:'item_id',label:'الصنف'},{key:'related_item_id',label:'الصنف المرتبط'},{key:'affinity_score',label:'النسبة'}] },
  seasonal: { title:'Seasonal Slotting', subtitle:'خطط التخزين الموسمية وتفعيل توصياتها', load:()=>inventoryStorageAnalyticsService.seasonalStatus(), columns:[{key:'plan_code',label:'الخطة'},{key:'season_name',label:'الموسم'},{key:'starts_on',label:'البداية'},{key:'ends_on',label:'النهاية'},{key:'status',label:'الحالة'},{key:'line_count',label:'البنود'}] },
  interleaving: { title:'Task Interleaving', subtitle:'اقتراح دمج المهام لتقليل الحركة غير المنتجة', load:()=>inventoryStorageAnalyticsService.interleavingQueue(), action:()=>inventoryTaskInterleavingSuggestionService.generate(), columns:[{key:'source_task_table',label:'من مهمة'},{key:'suggested_task_table',label:'إلى مهمة'},{key:'score',label:'النقاط'},{key:'reason',label:'السبب'}] },
  capacity: { title:'تحليل السعة والمساحة', subtitle:'استغلال المساحة وتنبيهات الاكتظاظ', load:()=>inventoryStorageAnalyticsService.capacity(), columns:[{key:'warehouse_code',label:'المستودع'},{key:'location_count',label:'المواقع'},{key:'total_capacity',label:'السعة'},{key:'used_capacity',label:'المستخدم'},{key:'capacity_percent',label:'%'}] },
  slow: { title:'المخزون الراكد', subtitle:'أصناف لم تتحرك منذ 180 يوماً أو أكثر', load:()=>inventoryStorageAnalyticsService.slowMoving(), columns:[{key:'item_code',label:'الكود'},{key:'item_name',label:'الصنف'},{key:'days_without_movement',label:'أيام بلا حركة'},{key:'on_hand_qty',label:'الرصيد'}] },
  labels: { title:'تسمية الخانات', subtitle:'طباعة Barcode/QR للمواقع التخزينية', load:()=>inventoryLocationLabelPrintService.findAll({orderBy:'printed_at',ascending:false,limit:100}) as unknown as Promise<Row[]>, columns:[{key:'location_id',label:'الموقع'},{key:'printer_name',label:'الطابعة'},{key:'printed_at',label:'تاريخ الطباعة'}] },
  slowReports: { title:'اشتراكات تقرير المخزون الراكد', subtitle:'تقرير شهري/أسبوعي تلقائي foundation', load:()=>inventorySlowMovingReportSubscriptionService.findAll({orderBy:'created_at',ascending:false,limit:100}) as unknown as Promise<Row[]>, columns:[{key:'report_name',label:'التقرير'},{key:'recipient_email',label:'المستلم'},{key:'frequency',label:'التكرار'},{key:'threshold_days',label:'الأيام'},{key:'is_active',label:'نشط'}] },
};

export function StorageTablePage({type}:{type:keyof typeof configs}){
  const cfg=configs[type]; const [rows,setRows]=useState<Row[]>([]); const [msg,setMsg]=useState('');
  const load=()=>cfg.load().then(setRows).catch(e=>setMsg(e instanceof Error?e.message:String(e)));
  useEffect(()=>{load();},[type]);
  const run=async()=>{ if(!cfg.action)return; try{const r=await cfg.action(); setMsg('تم التنفيذ: '+String(typeof r==='object'?JSON.stringify(r):r)); await load();}catch(e){setMsg(e instanceof Error?e.message:String(e));}};
  return <div className="space-y-5" dir="rtl"><div className="flex justify-between gap-3 flex-wrap"><div><h1 className="text-3xl font-black">{cfg.title}</h1><p className="text-slate-500 mt-1">{cfg.subtitle}</p></div>{cfg.action&&<button onClick={run} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm">تشغيل المحرك</button>}</div>{msg&&<div className="bg-slate-100 p-3 rounded-xl text-sm">{msg}</div>}<div className="bg-white border rounded-2xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50"><tr>{cfg.columns.map(c=><th key={c.key} className="p-3 text-right">{c.label}</th>)}<th className="p-3 text-right">إجراءات</th></tr></thead><tbody>{rows.map((r,i)=><tr key={String(r.id??i)} className="border-t">{cfg.columns.map(c=><td key={c.key} className="p-3">{String(r[c.key]??'—')}</td>)}<td className="p-3"><InventoryRecordTools row={r}/></td></tr>)}{!rows.length&&<tr><td colSpan={cfg.columns.length+1} className="p-10 text-center text-slate-400">لا توجد بيانات</td></tr>}</tbody></table></div></div>;
}

export function StorageDashboard(){
  const [kpis,setKpis]=useState<Row>({});
  useEffect(()=>{inventoryStorageAnalyticsService.kpis().then(d=>setKpis(d[0]||{})).catch(()=>setKpis({}));},[]);
  const cards: Array<[string, string | number]> = [
    ['استغلال المساحة', Number(kpis.avg_space_utilization ?? 0)],
    ['تنبيهات حرجة', Number(kpis.critical_capacity_locations ?? 0)],
    ['اقتراحات Slotting', Number(kpis.open_slotting_recommendations ?? 0)],
    ['مهام تجديد', Number(kpis.open_replenishment_tasks ?? 0)],
    ['مخزون راكد', Number(kpis.slow_moving_items ?? 0)],
  ];
  return <div className="space-y-6" dir="rtl"><div><h1 className="text-3xl font-black">إدارة التخزين وتحسين المواقع</h1><p className="text-slate-500 mt-1">Warehouse Map، ABC، Slotting، Replenishment، Capacity وSlow Stock.</p></div><div className="grid md:grid-cols-5 gap-4">{cards.map(([l,v])=><div key={String(l)} className="bg-white border rounded-2xl p-5"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-black mt-2">{String(v)}</div></div>)}</div></div>;
}
