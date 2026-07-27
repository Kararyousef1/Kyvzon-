import { useCallback, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Award,
  BarChart2,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  FileText,
  Layers,
  Map as MapIcon,
  Package,
  PackageCheck,
  Printer,
  QrCode,
  Radio,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Target,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

type UnitKey = 'foundation'|'receiving'|'storage'|'picking'|'shipping'|'counting'|'returns'|'labor'|'analytics';
type LinkItem = { title:string; subtitle:string; to:string };
type UnitMeta = { title:string; subtitle:string; icon:LucideIcon; flowTitle:string; links:LinkItem[] };

const cardThemes = [
  { box:'from-indigo-600 to-blue-700', soft:'bg-indigo-50', text:'text-indigo-700', border:'border-indigo-100', dot:'bg-indigo-500' },
  { box:'from-emerald-600 to-teal-700', soft:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-100', dot:'bg-emerald-500' },
  { box:'from-amber-500 to-orange-600', soft:'bg-amber-50', text:'text-amber-700', border:'border-amber-100', dot:'bg-amber-500' },
  { box:'from-rose-600 to-pink-700', soft:'bg-rose-50', text:'text-rose-700', border:'border-rose-100', dot:'bg-rose-500' },
  { box:'from-violet-600 to-purple-700', soft:'bg-violet-50', text:'text-violet-700', border:'border-violet-100', dot:'bg-violet-500' },
  { box:'from-cyan-600 to-sky-700', soft:'bg-cyan-50', text:'text-cyan-700', border:'border-cyan-100', dot:'bg-cyan-500' },
];

const unitMeta: Record<UnitKey,UnitMeta> = {
  foundation:{title:'الأساس التقني للمخزون',subtitle:'Master data، المستودعات، المواقع، الأرصدة والحركات.',icon:Boxes,flowTitle:'خطوات الأساس التقني',links:[
    {title:'الأصناف والمواد',subtitle:'Items / UOM',to:'/app/inventory/items'},
    {title:'المستودعات',subtitle:'Warehouses',to:'/app/inventory/warehouses'},
    {title:'المواقع',subtitle:'Locations',to:'/app/inventory/locations'},
    {title:'الأرصدة',subtitle:'Stock balances',to:'/app/inventory/stock'},
    {title:'الحركات',subtitle:'Stock ledger',to:'/app/inventory/movements'},
    {title:'الترميز والباركود',subtitle:'Code & Barcode rules',to:'/app/inventory/numbering'},
  ]},
  receiving:{title:'الاستلام والعمليات الواردة',subtitle:'ASN، الأرصفة، جلسات الاستلام، OS&D، الحجر وLPN.',icon:ClipboardCheck,flowTitle:'خطوات الاستلام',links:[
    {title:'ASN',subtitle:'إشعار مسبق',to:'/app/inventory/receiving/asn'},
    {title:'جدولة الأرصفة',subtitle:'Dock Schedule',to:'/app/inventory/receiving/dock-schedule'},
    {title:'جلسة الاستلام',subtitle:'Receiving Session',to:'/app/inventory/receiving/sessions'},
    {title:'المسح والعد',subtitle:'Scan & Count',to:'/app/inventory/receiving/mobile-scan'},
    {title:'OS&D / الحجر',subtitle:'Exceptions',to:'/app/inventory/receiving/osd'},
    {title:'LPN / Put-away',subtitle:'Label & Store',to:'/app/inventory/receiving/putaway'},
    {title:'التقارير',subtitle:'Reports',to:'/app/inventory/receiving/reports'},
  ]},
  storage:{title:'التخزين و Slotting',subtitle:'خريطة المستودع، heatmap، ABC، replenishment، السعة وslow moving.',icon:Layers,flowTitle:'خطوات التخزين والتحسين',links:[
    {title:'خريطة المواقع',subtitle:'Map',to:'/app/inventory/storage/map'},
    {title:'Heatmap',subtitle:'Activity',to:'/app/inventory/storage/heatmap'},
    {title:'ABC',subtitle:'Classification',to:'/app/inventory/storage/abc'},
    {title:'Slotting',subtitle:'Recommendations',to:'/app/inventory/storage/slotting'},
    {title:'Replenishment',subtitle:'Min/Max',to:'/app/inventory/storage/replenishment'},
    {title:'السعة',subtitle:'Capacity',to:'/app/inventory/storage/capacity'},
    {title:'المخزون الراكد',subtitle:'Slow Moving',to:'/app/inventory/storage/slow-moving'},
  ]},
  picking:{title:'السحب والتنفيذ',subtitle:'أوامر السحب، المهام، الموجات، الاستثناءات وتقنيات التنفيذ.',icon:PackageCheck,flowTitle:'خطوات السحب والتنفيذ',links:[
    {title:'أوامر السحب',subtitle:'Orders',to:'/app/inventory/picking/orders'},
    {title:'المهام',subtitle:'Tasks',to:'/app/inventory/picking/tasks'},
    {title:'الموجات',subtitle:'Waves',to:'/app/inventory/picking/waves'},
    {title:'المسار',subtitle:'Route',to:'/app/inventory/picking/route-map'},
    {title:'Scan-to-Confirm',subtitle:'Barcode',to:'/app/inventory/picking/scans'},
    {title:'الاستثناءات',subtitle:'Exceptions',to:'/app/inventory/picking/exceptions'},
    {title:'الفرز والتسليم',subtitle:'Sorting',to:'/app/inventory/picking/sorting'},
  ]},
  shipping:{title:'الشحن والعمليات الصادرة',subtitle:'Packing، الوثائق، Rate Shopping، Manifest، التتبع والتحميل.',icon:Truck,flowTitle:'خطوات الشحن',links:[
    {title:'التعبئة',subtitle:'Packing',to:'/app/inventory/shipping/packages'},
    {title:'الشحنات',subtitle:'Shipments',to:'/app/inventory/shipping/shipments'},
    {title:'Rate Shopping',subtitle:'Quotes',to:'/app/inventory/shipping/rate-quotes'},
    {title:'الوثائق',subtitle:'Documents',to:'/app/inventory/shipping/documents'},
    {title:'Staging / Manifest',subtitle:'Loading',to:'/app/inventory/shipping/manifests'},
    {title:'التتبع',subtitle:'Tracking',to:'/app/inventory/shipping/tracking'},
    {title:'KPIs',subtitle:'Performance',to:'/app/inventory/shipping/kpis'},
  ]},
  counting:{title:'الجرد ودقة المخزون',subtitle:'خطط الجرد، العد المحمول، الفروق، الاعتمادات، التجميد والجرد السنوي.',icon:ShieldCheck,flowTitle:'خطوات الجرد',links:[
    {title:'خطة الجرد',subtitle:'Schedule',to:'/app/inventory/counting/plans'},
    {title:'العد المحمول',subtitle:'Blind Count',to:'/app/inventory/counting/mobile'},
    {title:'الفروق',subtitle:'Variance',to:'/app/inventory/counting/variances'},
    {title:'إعادة العد',subtitle:'2nd / 3rd',to:'/app/inventory/counting/recount'},
    {title:'الاعتماد',subtitle:'Approval',to:'/app/inventory/counting/approvals'},
    {title:'الترحيل',subtitle:'Post',to:'/app/inventory/counting/completion'},
    {title:'الجرد السنوي',subtitle:'Annual',to:'/app/inventory/counting/annual'},
  ]},
  returns:{title:'المرتجعات واللوجستيات العكسية',subtitle:'RMA، الاستلام، التقييم، المسارات، RTV والجودة.',icon:RefreshCw,flowTitle:'خطوات المرتجع',links:[
    {title:'RMA',subtitle:'Authorization',to:'/app/inventory/returns/rma'},
    {title:'استلام المرتجع',subtitle:'Receiving',to:'/app/inventory/returns/receiving'},
    {title:'التقييم A/B/C/D',subtitle:'Grading',to:'/app/inventory/returns/grading'},
    {title:'التوجيه',subtitle:'Disposition',to:'/app/inventory/returns/disposition'},
    {title:'RTV / إصلاح / خردة',subtitle:'Routing',to:'/app/inventory/returns/rtv'},
    {title:'NCR / CAPA',subtitle:'Quality',to:'/app/inventory/returns/quality'},
    {title:'التحليلات',subtitle:'Analytics',to:'/app/inventory/returns/analytics'},
  ]},
  labor:{title:'العمالة والإنتاجية',subtitle:'معايير العمل، التخطيط، التوزيع، الوقت، الحوافز، المهارات وKPIs.',icon:Users,flowTitle:'خطوات إدارة العمالة',links:[
    {title:'المعايير',subtitle:'Standards',to:'/app/inventory/labor/standards'},
    {title:'التخطيط',subtitle:'Planning',to:'/app/inventory/labor/planning'},
    {title:'التوفر',subtitle:'Availability',to:'/app/inventory/labor/availability'},
    {title:'التوزيع',subtitle:'Dispatch',to:'/app/inventory/labor/dispatch'},
    {title:'تتبع الوقت',subtitle:'Time',to:'/app/inventory/labor/time-tracking'},
    {title:'المهارات',subtitle:'Skills',to:'/app/inventory/labor/skills-training'},
    {title:'الحوافز وKPIs',subtitle:'Incentives',to:'/app/inventory/labor/incentives'},
  ]},
  analytics:{title:'تحليلات المستودع ولوحة المؤشرات',subtitle:'لوحات تنفيذية وتشغيلية، KPI scorecards، trends، alerts، reports and costs.',icon:BarChart3,flowTitle:'خطوات التحليل والتحسين',links:[
    {title:'تنفيذي',subtitle:'Executive',to:'/app/inventory/analytics/executive'},
    {title:'العمليات',subtitle:'Operations',to:'/app/inventory/analytics/operations'},
    {title:'Scorecard',subtitle:'Targets',to:'/app/inventory/analytics/scorecard'},
    {title:'Trends',subtitle:'History',to:'/app/inventory/analytics/trends'},
    {title:'Heatmap',subtitle:'Movement',to:'/app/inventory/analytics/heatmap'},
    {title:'Root Cause',subtitle:'RCA',to:'/app/inventory/analytics/root-cause'},
    {title:'Alerts / Reports',subtitle:'Proactive',to:'/app/inventory/analytics/alerts'},
  ]},
};

function pickLinkIcon(link: LinkItem): LucideIcon {
  const text = `${link.title} ${link.subtitle} ${link.to}`.toLowerCase();
  if(text.includes('asn') || text.includes('وثائق') || text.includes('report') || text.includes('تقرير')) return FileText;
  if(text.includes('dock') || text.includes('جدولة') || text.includes('خطة') || text.includes('annual')) return CalendarClock;
  if(text.includes('scan') || text.includes('مسح') || text.includes('barcode')) return QrCode;
  if(text.includes('os&d') || text.includes('استثناء') || text.includes('alert') || text.includes('root')) return AlertTriangle;
  if(text.includes('حجر') || text.includes('quality') || text.includes('ncr') || text.includes('capa')) return ShieldAlert;
  if(text.includes('lpn') || text.includes('label')) return Printer;
  if(text.includes('map') || text.includes('heatmap') || text.includes('خريطة')) return MapIcon;
  if(text.includes('slot') || text.includes('abc')) return Target;
  if(text.includes('replenishment') || text.includes('return') || text.includes('مرتجع')) return RefreshCw;
  if(text.includes('rate') || text.includes('cost') || text.includes('تكاليف')) return DollarSign;
  if(text.includes('voice') || text.includes('rfid') || text.includes('ptl')) return Radio;
  if(text.includes('route') || text.includes('handoff') || text.includes('interleaving')) return Route;
  if(text.includes('kpi') || text.includes('analytics') || text.includes('تحليل')) return BarChart2;
  if(text.includes('إشعار') || text.includes('notification')) return Bell;
  if(text.includes('worker') || text.includes('عمال') || text.includes('مهارات')) return Award;
  if(text.includes('download') || text.includes('تصدير')) return Download;
  if(text.includes('movement') || text.includes('حركة')) return ArrowRightLeft;
  if(text.includes('time') || text.includes('وقت')) return Clock;
  if(text.includes('ship') || text.includes('شحن')) return Truck;
  if(text.includes('package') || text.includes('تعبئة') || text.includes('طرود')) return Package;
  return ClipboardList;
}

export function InventoryUnitNav({ unit }: { unit: UnitKey }) {
  const meta = unitMeta[unit];
  const UnitIcon = meta.icon;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const hasDragged = useRef(false);
  const SCROLL_STEP = 200;

  const scrollTo = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -SCROLL_STEP : SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const onMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    hasDragged.current = false;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    if (Math.abs(walk) > 4) hasDragged.current = true;
    el.scrollLeft = scrollLeft.current - walk;
  }, []);

  const stopDragging = useCallback(() => {
    isDragging.current = false;
    const el = scrollRef.current;
    if (!el) return;
    el.style.cursor = 'grab';
    el.style.userSelect = '';
  }, []);

  return (
    <section
      dir="rtl"
      className="mb-6 rounded-2xl bg-white border border-slate-200/70 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div className="px-5 pt-5 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <UnitIcon size={20} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
              {meta.title}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate leading-snug">
              {meta.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold tracking-wide text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
            {meta.flowTitle}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollTo('right')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="تمرير يميناً"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => scrollTo('left')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="تمرير يساراً"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto px-5 py-4"
        style={{
          scrollbarWidth: 'none',
          cursor: 'grab',
          WebkitOverflowScrolling: 'touch',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
      >
        <div className="min-w-max flex flex-row-reverse items-stretch gap-2.5">
          {meta.links.map((link, index) => {
            const theme = cardThemes[index % cardThemes.length];
            const Icon = pickLinkIcon(link);
            const stepNum = String(index + 1).padStart(2, '0');
            return (
              <div key={link.to} className="flex flex-row-reverse items-center gap-2.5">
                <Link
                  to={link.to}
                  draggable={false}
                  onClick={(e) => {
                    if (hasDragged.current) e.preventDefault();
                  }}
                  className={`
                    group relative flex flex-col w-44 rounded-xl
                    border ${theme.border} ${theme.soft}
                    p-3.5 gap-3
                    transition-all duration-150
                    hover:-translate-y-0.5
                    hover:shadow-md hover:shadow-slate-200/80
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400
                    select-none
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${theme.box} text-white flex items-center justify-center shadow-sm`}>
                      <Icon size={16} strokeWidth={2} />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums ${theme.text} opacity-60`}>
                      {stepNum}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-[13px] text-slate-800 leading-tight truncate">
                      {link.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate leading-snug">
                      {link.subtitle}
                    </p>
                  </div>

                  <div className={`absolute bottom-0 right-0 left-0 h-[3px] rounded-b-xl ${theme.dot} opacity-0 group-hover:opacity-100 transition-opacity duration-150`} />
                </Link>

                {index < meta.links.length - 1 && (
                  <div className="flex items-center text-slate-200 gap-0.5 shrink-0">
                    <ArrowLeft size={13} strokeWidth={2} />
                    <ArrowRight size={13} strokeWidth={2} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
