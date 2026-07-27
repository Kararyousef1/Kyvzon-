import { useCallback, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Boxes, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, DollarSign, Factory, FileText, Layers, Package, Radio, RefreshCw, Settings, ShieldAlert, ShieldCheck, ShoppingCart, Target, TrendingUp, Users, Wrench, type LucideIcon } from 'lucide-react';

export type MrpUnitKey = 'main'|'foundation'|'bom'|'forecasting'|'mps'|'planning'|'inventory'|'procurement'|'quality'|'shopfloor'|'maintenance'|'costing'|'analytics';
type LinkItem = { title:string; subtitle:string; to:string; icon?:LucideIcon };
type UnitMeta = { title:string; subtitle:string; icon:LucideIcon; flowTitle:string; links:LinkItem[] };

const cardThemes = [
  { box:'from-orange-600 to-red-700', soft:'bg-orange-50', text:'text-orange-700', border:'border-orange-100', dot:'bg-orange-500' },
  { box:'from-indigo-600 to-blue-700', soft:'bg-indigo-50', text:'text-indigo-700', border:'border-indigo-100', dot:'bg-indigo-500' },
  { box:'from-emerald-600 to-teal-700', soft:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-100', dot:'bg-emerald-500' },
  { box:'from-violet-600 to-purple-700', soft:'bg-violet-50', text:'text-violet-700', border:'border-violet-100', dot:'bg-violet-500' },
  { box:'from-amber-500 to-orange-600', soft:'bg-amber-50', text:'text-amber-700', border:'border-amber-100', dot:'bg-amber-500' },
  { box:'from-cyan-600 to-sky-700', soft:'bg-cyan-50', text:'text-cyan-700', border:'border-cyan-100', dot:'bg-cyan-500' },
];

const unitMeta: Record<MrpUnitKey, UnitMeta> = {
  main:{title:'بوابة التصنيع MRP',subtitle:'رحلة التصنيع كاملة من الأساس وBOM حتى التكلفة والتحليلات.',icon:Factory,flowTitle:'وحدات بوابة التصنيع',links:[
    {title:'الأساس التقني',subtitle:'مصانع/خطوط/مراكز عمل',to:'/app/mrp/foundation',icon:Factory},
    {title:'BOM والتغييرات',subtitle:'تركيبة المنتج وECO',to:'/app/mrp/bom',icon:Layers},
    {title:'التنبؤ بالطلب',subtitle:'Forecasting',to:'/app/mrp/forecasting',icon:TrendingUp},
    {title:'MPS',subtitle:'الجدول الرئيسي',to:'/app/mrp/mps',icon:CalendarClock},
    {title:'تخطيط الإنتاج',subtitle:'MRP وWork Orders',to:'/app/mrp/planning',icon:ClipboardCheck},
    {title:'المخزون التصنيعي',subtitle:'Raw/WIP/FG',to:'/app/mrp/inventory',icon:Package},
    {title:'تكامل المشتريات',subtitle:'PR/PO/GR/Suppliers',to:'/app/mrp/procurement',icon:ShoppingCart},
    {title:'الجودة',subtitle:'IQC/IPQC/OQC',to:'/app/mrp/quality',icon:ShieldCheck},
    {title:'أرضية المصنع',subtitle:'MES/OEE/Andon',to:'/app/mrp/shopfloor',icon:Radio},
    {title:'الصيانة',subtitle:'CMMS/PM/MTBF',to:'/app/mrp/maintenance',icon:Wrench},
    {title:'التكاليف',subtitle:'Standard/Actual/Variance',to:'/app/mrp/costing',icon:DollarSign},
    {title:'التحليلات',subtitle:'KPIs/Alerts/RCA',to:'/app/mrp/analytics',icon:BarChart3},
  ]},
  foundation:{title:'الأساس التقني للتصنيع',subtitle:'مصانع، مناطق، خطوط، مراكز عمل، أصول، طاقة، عمليات، Routing وترقيم.',icon:Factory,flowTitle:'خطوات الأساس التقني',links:[
    {title:'المصانع',subtitle:'Plants',to:'/app/mrp/foundation/plants',icon:Factory},
    {title:'المناطق',subtitle:'Areas',to:'/app/mrp/foundation/areas',icon:Boxes},
    {title:'خطوط الإنتاج',subtitle:'Production Lines',to:'/app/mrp/foundation/lines',icon:Layers},
    {title:'مراكز العمل',subtitle:'Work Centers',to:'/app/mrp/foundation/work-centers',icon:Settings},
    {title:'الموارد',subtitle:'Skills/Tools',to:'/app/mrp/foundation/resources',icon:Users},
    {title:'الأصول',subtitle:'Assets',to:'/app/mrp/foundation/assets',icon:Wrench},
    {title:'التقويمات',subtitle:'Calendars',to:'/app/mrp/foundation/calendars',icon:CalendarClock},
    {title:'الورديات',subtitle:'Shifts',to:'/app/mrp/foundation/shifts',icon:Users},
    {title:'الطاقة',subtitle:'Capacity',to:'/app/mrp/foundation/capacity',icon:BarChart3},
    {title:'العمليات',subtitle:'Operations',to:'/app/mrp/foundation/operations',icon:ClipboardList},
    {title:'Routing',subtitle:'تسلسل العمليات',to:'/app/mrp/foundation/routings',icon:RefreshCw},
    {title:'الترقيم',subtitle:'Codes/Sequences',to:'/app/mrp/foundation/numbering',icon:FileText},
    {title:'التدقيق',subtitle:'Audit',to:'/app/mrp/foundation/audit',icon:ShieldAlert},
    {title:'التكاملات',subtitle:'Integration health',to:'/app/mrp/foundation/integrations',icon:BarChart3},
  ]},
  bom:{title:'BOM والتغييرات الهندسية',subtitle:'BOM Builder، الإصدارات، التفجير، التوفر، ECR/ECO والتقارير.',icon:Layers,flowTitle:'خطوات BOM',links:[
    {title:'منشئ BOM',subtitle:'Builder',to:'/app/mrp/bom/builder'}, {title:'Headers',subtitle:'BOM Master',to:'/app/mrp/bom/headers'}, {title:'Versions',subtitle:'اعتماد/فعالية',to:'/app/mrp/bom/versions'}, {title:'Lines',subtitle:'المكونات',to:'/app/mrp/bom/lines'}, {title:'Explosion',subtitle:'تفجير BOM',to:'/app/mrp/bom/explosion'}, {title:'Availability',subtitle:'توفر المواد',to:'/app/mrp/bom/availability'}, {title:'ECR',subtitle:'طلب تغيير',to:'/app/mrp/bom/ecr'}, {title:'ECO',subtitle:'أمر تغيير',to:'/app/mrp/bom/eco'}, {title:'Import/Export',subtitle:'Excel/CSV',to:'/app/mrp/bom/import-export'}, {title:'Reports',subtitle:'KPIs',to:'/app/mrp/bom/reports'},
  ]},
  forecasting:{title:'التنبؤ بالطلب',subtitle:'Demand History، النماذج، التشغيلات، الدقة وسياسات التخطيط.',icon:TrendingUp,flowTitle:'خطوات التنبؤ',links:[
    {title:'تاريخ الطلب',subtitle:'History',to:'/app/mrp/forecasting/history'}, {title:'النماذج',subtitle:'Models',to:'/app/mrp/forecasting/models'}, {title:'التشغيلات',subtitle:'Runs',to:'/app/mrp/forecasting/runs'}, {title:'الدقة',subtitle:'MAPE',to:'/app/mrp/forecasting/accuracy'}, {title:'السياسات',subtitle:'MTS/MTO',to:'/app/mrp/forecasting/policies'},
  ]},
  mps:{title:'MPS الجدول الرئيسي',subtitle:'Board، الخطط، البنود، RCCP، التنبيهات والتقارير.',icon:CalendarClock,flowTitle:'خطوات MPS',links:[
    {title:'MPS Board',subtitle:'لوحة',to:'/app/mrp/mps/board'}, {title:'Plans',subtitle:'خطط',to:'/app/mrp/mps/plans'}, {title:'Lines',subtitle:'بنود',to:'/app/mrp/mps/lines'}, {title:'RCCP',subtitle:'فحص الطاقة',to:'/app/mrp/mps/rccp'}, {title:'Alerts',subtitle:'تنبيهات',to:'/app/mrp/mps/alerts'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/mps/reports'},
  ]},
  planning:{title:'تخطيط الإنتاج وأوامر العمل',subtitle:'MRP Runs، المقترحات، أوامر العمل، المواد، العمليات، الجدولة والتنبيهات.',icon:ClipboardCheck,flowTitle:'خطوات التخطيط',links:[
    {title:'MRP Runs',subtitle:'تشغيل MRP',to:'/app/mrp/planning/mrp-runs'}, {title:'المقترحات',subtitle:'Planned Orders',to:'/app/mrp/planning/proposals'}, {title:'أوامر العمل',subtitle:'Work Orders',to:'/app/mrp/planning/work-orders'}, {title:'المواد',subtitle:'Reservations/Issues',to:'/app/mrp/planning/materials'}, {title:'العمليات',subtitle:'Operations',to:'/app/mrp/planning/operations'}, {title:'الجدولة',subtitle:'Scheduling',to:'/app/mrp/planning/scheduling'}, {title:'Dispatch',subtitle:'Queue',to:'/app/mrp/planning/dispatch'}, {title:'Alerts',subtitle:'تنبيهات',to:'/app/mrp/planning/alerts'}, {title:'Reports',subtitle:'KPIs',to:'/app/mrp/planning/reports'},
  ]},
  inventory:{title:'المخزون التصنيعي وWIP',subtitle:'Raw Materials، WIP، Finished Goods، valuation، lots، safety stock والمطابقة.',icon:Package,flowTitle:'خطوات مخزون التصنيع',links:[
    {title:'Raw Materials',subtitle:'مواد خام',to:'/app/mrp/inventory/raw-materials'}, {title:'WIP',subtitle:'تحت التشغيل',to:'/app/mrp/inventory/wip'}, {title:'Finished Goods',subtitle:'منتج نهائي',to:'/app/mrp/inventory/finished-goods'}, {title:'Valuation',subtitle:'تقييم',to:'/app/mrp/inventory/valuation'}, {title:'Lots Traceability',subtitle:'تتبع الدفعات',to:'/app/mrp/inventory/lots-traceability'}, {title:'Safety/EOQ',subtitle:'تحسين',to:'/app/mrp/inventory/safety-stock'}, {title:'Material Issues',subtitle:'صرف مواد',to:'/app/mrp/inventory/material-issues'}, {title:'Reconciliation',subtitle:'مطابقة',to:'/app/mrp/inventory/reconciliation'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/inventory/reports'},
  ]},
  procurement:{title:'تكامل المشتريات',subtitle:'توصيات شراء، PR، RFQ/TCO، PO، GR، فواتير، موردين، عقود وتنبيهات.',icon:ShoppingCart,flowTitle:'خطوات المشتريات',links:[
    {title:'Recommendations',subtitle:'توصيات',to:'/app/mrp/procurement/recommendations'}, {title:'PR',subtitle:'طلبات شراء',to:'/app/mrp/procurement/pr'}, {title:'RFQ/TCO',subtitle:'تقييم',to:'/app/mrp/procurement/rfq'}, {title:'PO',subtitle:'أوامر شراء',to:'/app/mrp/procurement/po'}, {title:'GR',subtitle:'استلام',to:'/app/mrp/procurement/gr'}, {title:'Invoices',subtitle:'مطابقة',to:'/app/mrp/procurement/invoices'}, {title:'Suppliers',subtitle:'Scorecard',to:'/app/mrp/procurement/suppliers'}, {title:'Contracts',subtitle:'عقود',to:'/app/mrp/procurement/contracts'}, {title:'Alerts',subtitle:'تنبيهات',to:'/app/mrp/procurement/alerts'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/procurement/reports'},
  ]},
  quality:{title:'إدارة الجودة',subtitle:'Plans، Checklists، Inspections، AQL، NCR، CAPA، Calibration، SPC، Quarantine.',icon:ShieldCheck,flowTitle:'خطوات الجودة',links:[
    {title:'Plans',subtitle:'خطط فحص',to:'/app/mrp/quality/plans'}, {title:'Checklists',subtitle:'قوائم',to:'/app/mrp/quality/checklists'}, {title:'Inspections',subtitle:'فحوصات',to:'/app/mrp/quality/inspections'}, {title:'AQL',subtitle:'عينات',to:'/app/mrp/quality/aql'}, {title:'NCR',subtitle:'عدم مطابقة',to:'/app/mrp/quality/ncr'}, {title:'CAPA',subtitle:'تصحيح/وقاية',to:'/app/mrp/quality/capa'}, {title:'Calibration',subtitle:'معايرة',to:'/app/mrp/quality/calibration'}, {title:'SPC',subtitle:'رقابة إحصائية',to:'/app/mrp/quality/spc'}, {title:'Quarantine',subtitle:'حجر',to:'/app/mrp/quality/quarantine'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/quality/reports'},
  ]},
  shopfloor:{title:'أرضية المصنع MES/SFC',subtitle:'محطات رقمية، تتبع لحظي، OEE، توقفات، Andon، عمالة ولوحات.',icon:Radio,flowTitle:'خطوات التنفيذ',links:[
    {title:'Workstations',subtitle:'محطات',to:'/app/mrp/shopfloor/workstations'}, {title:'Terminals',subtitle:'جلسات',to:'/app/mrp/shopfloor/terminals'}, {title:'Tracking',subtitle:'إنتاج لحظي',to:'/app/mrp/shopfloor/tracking'}, {title:'Consumption',subtitle:'استهلاك فعلي',to:'/app/mrp/shopfloor/consumption'}, {title:'OEE',subtitle:'كفاءة',to:'/app/mrp/shopfloor/oee'}, {title:'Downtime',subtitle:'توقفات',to:'/app/mrp/shopfloor/downtime'}, {title:'Pareto',subtitle:'تحليل أسباب',to:'/app/mrp/shopfloor/pareto'}, {title:'WO Progress',subtitle:'تقدم',to:'/app/mrp/shopfloor/work-order-progress'}, {title:'Labor',subtitle:'عمالة',to:'/app/mrp/shopfloor/labor-shifts'}, {title:'Andon',subtitle:'إشارات',to:'/app/mrp/shopfloor/andon'}, {title:'Supervisor',subtitle:'مشرف',to:'/app/mrp/shopfloor/supervisor'}, {title:'Manager',subtitle:'مدير إنتاج',to:'/app/mrp/shopfloor/manager'}, {title:'Maintenance',subtitle:'جسر صيانة',to:'/app/mrp/shopfloor/maintenance'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/shopfloor/reports'},
  ]},
  maintenance:{title:'الصيانة CMMS',subtitle:'أصول، Criticality، PM، أوامر صيانة، قطع غيار، قراءات حالة وتوقف سنوي.',icon:Wrench,flowTitle:'خطوات الصيانة',links:[
    {title:'Assets',subtitle:'سجل الأصول',to:'/app/mrp/maintenance/assets'}, {title:'Criticality',subtitle:'A/B/C',to:'/app/mrp/maintenance/criticality'}, {title:'PM Plans',subtitle:'خطط وقائية',to:'/app/mrp/maintenance/pm-plans'}, {title:'PM Calendar',subtitle:'تقويم',to:'/app/mrp/maintenance/pm-calendar'}, {title:'Work Orders',subtitle:'أوامر',to:'/app/mrp/maintenance/work-orders'}, {title:'Spare Parts',subtitle:'قطع غيار',to:'/app/mrp/maintenance/spare-parts'}, {title:'Condition',subtitle:'PdM/CBM',to:'/app/mrp/maintenance/condition'}, {title:'Breakdowns',subtitle:'بلاغات',to:'/app/mrp/maintenance/breakdowns'}, {title:'Shutdowns',subtitle:'توقف سنوي',to:'/app/mrp/maintenance/shutdowns'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/maintenance/reports'},
  ]},
  costing:{title:'تكاليف التصنيع',subtitle:'عناصر تكلفة، Profiles، Standard/Actual، Rollup، Variances، WIP/FG وPostings.',icon:DollarSign,flowTitle:'خطوات التكلفة',links:[
    {title:'Cost Elements',subtitle:'عناصر',to:'/app/mrp/costing/cost-elements'}, {title:'Profiles',subtitle:'طرق التكلفة',to:'/app/mrp/costing/profiles'}, {title:'Standard Costs',subtitle:'قياسية',to:'/app/mrp/costing/standard-costs'}, {title:'Rollup',subtitle:'BOM/Routing',to:'/app/mrp/costing/rollup'}, {title:'WO Costs',subtitle:'فعلي',to:'/app/mrp/costing/work-order-costs'}, {title:'Variances',subtitle:'فروقات',to:'/app/mrp/costing/variances'}, {title:'WIP',subtitle:'تحت التشغيل',to:'/app/mrp/costing/wip'}, {title:'Finished Goods',subtitle:'تقييم',to:'/app/mrp/costing/finished-goods'}, {title:'Postings',subtitle:'مسودات مالية',to:'/app/mrp/costing/postings'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/costing/reports'},
  ]},
  analytics:{title:'تحليلات التصنيع',subtitle:'تنفيذي، عمليات، KPI، OEE، Schedule، Bottlenecks، RCA، Reports وExports.',icon:BarChart3,flowTitle:'خطوات التحليل',links:[
    {title:'Executive',subtitle:'تنفيذي',to:'/app/mrp/analytics/executive'}, {title:'Operations',subtitle:'تشغيلي',to:'/app/mrp/analytics/operations'}, {title:'Scorecard',subtitle:'KPI',to:'/app/mrp/analytics/scorecard'}, {title:'OEE',subtitle:'Trends',to:'/app/mrp/analytics/oee'}, {title:'Schedule',subtitle:'Attainment',to:'/app/mrp/analytics/schedule'}, {title:'Bottlenecks',subtitle:'اختناقات',to:'/app/mrp/analytics/bottlenecks'}, {title:'Quality Cost',subtitle:'جودة/تكلفة',to:'/app/mrp/analytics/quality-cost'}, {title:'Cost Variance',subtitle:'فروقات',to:'/app/mrp/analytics/cost-variance'}, {title:'Maintenance',subtitle:'Reliability',to:'/app/mrp/analytics/maintenance'}, {title:'Alerts',subtitle:'تنبيهات',to:'/app/mrp/analytics/alerts'}, {title:'Root Cause',subtitle:'RCA',to:'/app/mrp/analytics/root-cause'}, {title:'Reports',subtitle:'تقارير',to:'/app/mrp/analytics/reports'}, {title:'Exports',subtitle:'تصدير',to:'/app/mrp/analytics/exports'}, {title:'KPI Targets',subtitle:'أهداف',to:'/app/mrp/analytics/kpi-targets'},
  ]},
};

function pickIcon(link: LinkItem): LucideIcon {
  if (link.icon) return link.icon;
  const text = `${link.title} ${link.subtitle} ${link.to}`.toLowerCase();
  if (text.includes('cost') || text.includes('تكلفة') || text.includes('post')) return DollarSign;
  if (text.includes('quality') || text.includes('جودة') || text.includes('ncr') || text.includes('capa')) return ShieldCheck;
  if (text.includes('alert') || text.includes('risk') || text.includes('root') || text.includes('variance')) return ShieldAlert;
  if (text.includes('oee') || text.includes('kpi') || text.includes('report') || text.includes('analytics')) return BarChart3;
  if (text.includes('calendar') || text.includes('schedule') || text.includes('mps')) return CalendarClock;
  if (text.includes('maintenance') || text.includes('asset') || text.includes('صيانة')) return Wrench;
  if (text.includes('material') || text.includes('inventory') || text.includes('wip') || text.includes('fg')) return Package;
  if (text.includes('bom') || text.includes('routing') || text.includes('line')) return Layers;
  if (text.includes('purchase') || text.includes('supplier') || text.includes('po') || text.includes('pr')) return ShoppingCart;
  return ClipboardList;
}

export function MrpUnitNav({ unit }: { unit: MrpUnitKey }) {
  const meta = unitMeta[unit];
  const UnitIcon = meta.icon;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasDragged = useRef(false);
  const scrollTo = useCallback((dir:'left'|'right')=>{scrollRef.current?.scrollBy({left:dir==='left'?-220:220,behavior:'smooth'});},[]);
  const onMouseDown = useCallback((e:MouseEvent<HTMLDivElement>)=>{const el=scrollRef.current;if(!el)return;isDragging.current=true;hasDragged.current=false;startX.current=e.pageX-el.offsetLeft;scrollLeft.current=el.scrollLeft;el.style.cursor='grabbing';el.style.userSelect='none';},[]);
  const onMouseMove = useCallback((e:MouseEvent<HTMLDivElement>)=>{if(!isDragging.current)return;const el=scrollRef.current;if(!el)return;const walk=(e.pageX-el.offsetLeft-startX.current)*1.2;if(Math.abs(walk)>4)hasDragged.current=true;el.scrollLeft=scrollLeft.current-walk;},[]);
  const stopDragging = useCallback(()=>{isDragging.current=false;const el=scrollRef.current;if(!el)return;el.style.cursor='grab';el.style.userSelect='';},[]);
  return <section dir="rtl" className="mb-6 rounded-2xl bg-white border border-slate-200/70 overflow-hidden" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'}}>
    <div className="px-5 pt-5 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
      <div className="flex items-center gap-3.5 min-w-0"><div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0"><UnitIcon size={20} strokeWidth={1.75}/></div><div className="min-w-0"><h2 className="text-base font-bold text-slate-900 leading-tight truncate">{meta.title}</h2><p className="text-xs text-slate-400 mt-0.5 truncate leading-snug">{meta.subtitle}</p></div></div>
      <div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-semibold tracking-wide text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">{meta.flowTitle}</span><button type="button" onClick={()=>scrollTo('right')} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><ChevronRight size={16}/></button><button type="button" onClick={()=>scrollTo('left')} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"><ChevronLeft size={16}/></button></div>
    </div>
    <div ref={scrollRef} className="overflow-x-auto px-5 py-4" style={{scrollbarWidth:'none',cursor:'grab',WebkitOverflowScrolling:'touch'}} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={stopDragging} onMouseLeave={stopDragging}>
      <div className="min-w-max flex flex-row-reverse items-stretch gap-2.5">{meta.links.map((link,index)=>{const theme=cardThemes[index%cardThemes.length];const Icon=pickIcon(link);const step=String(index+1).padStart(2,'0');return <div key={link.to} className="flex flex-row-reverse items-center gap-2.5"><Link to={link.to} draggable={false} onClick={e=>{if(hasDragged.current)e.preventDefault();}} className={`group relative flex flex-col w-44 rounded-xl border ${theme.border} ${theme.soft} p-3.5 gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 select-none`}><div className="flex items-center justify-between"><div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${theme.box} text-white flex items-center justify-center shadow-sm`}><Icon size={16} strokeWidth={2}/></div><span className={`text-[10px] font-bold tabular-nums ${theme.text} opacity-60`}>{step}</span></div><div><h3 className="font-bold text-[13px] text-slate-800 leading-tight truncate">{link.title}</h3><p className="text-[11px] text-slate-400 mt-0.5 truncate leading-snug">{link.subtitle}</p></div><div className={`absolute bottom-0 right-0 left-0 h-[3px] rounded-b-xl ${theme.dot} opacity-0 group-hover:opacity-100 transition-opacity duration-150`}/></Link>{index<meta.links.length-1&&<div className="flex items-center text-slate-200 gap-0.5 shrink-0"><ArrowLeft size={13}/><ArrowRight size={13}/></div>}</div>})}</div>
    </div>
  </section>;
}
