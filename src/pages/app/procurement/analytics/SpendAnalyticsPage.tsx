import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { procurementExecutiveKpiService, spendAlertService, spendCategoryReportService, spendParetoService, spendTransactionService, priceTrendService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';
import { exportToCsv, type ExportColumn } from '../../../../utils/dataExport';

type SpendCategoryRow = {
  category_code?: string | null;
  category_name?: string | null;
  total_spend?: number | null;
  transaction_count?: number | null;
  supplier_count?: number | null;
  maverick_spend?: number | null;
};

const SPEND_EXPORT_COLUMNS: ExportColumn<SpendCategoryRow>[] = [
  { header: 'رمز الفئة', value: r => r.category_code },
  { header: 'اسم الفئة', value: r => r.category_name },
  { header: 'إجمالي الإنفاق', value: r => r.total_spend ?? 0 },
  { header: 'عدد المعاملات', value: r => r.transaction_count ?? 0 },
  { header: 'عدد الموردين', value: r => r.supplier_count ?? 0 },
  { header: 'الإنفاق خارج العقود', value: r => r.maverick_spend ?? 0 },
];

export default function SpendAnalyticsPage() {
  const { addToast } = useUIStore();
  const [kpi, setKpi] = useState<any>(null);
  const [pareto, setPareto] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [priceTrend, setPriceTrend] = useState<any[]>([]);
  const [maverick, setMaverick] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  const load = async () => {
    try {
      const [k, p, c, pt, m, a] = await Promise.all([
        procurementExecutiveKpiService.get().catch(()=>null),
        spendParetoService.findPareto(15),
        spendCategoryReportService.findAll(20).catch(()=>[]),
        priceTrendService.findByItem('STEEL-316L', 50).catch(()=>[]),
        spendTransactionService.findMaverick(20),
        spendAlertService.findOpen().catch(()=>[]),
      ]);
      setKpi(k); setPareto(p); setCategories(c); setPriceTrend(pt); setMaverick(m); setAlerts(a);
    } catch(e:any){ addToast(e.message,'error'); }
  };
  useEffect(()=>{ load(); }, []);

  const refreshPipeline = async () => {
    try {
      const aliases = await spendTransactionService.cleanseAliases();
      const collected = await spendTransactionService.collect();
      const classified = await spendTransactionService.autoClassify();
      const summary = await spendTransactionService.refreshSupplierSummary();
      const alertsCount = await spendAlertService.generate();
      addToast(`تم التحديث: aliases ${aliases}, collected ${collected}, classified ${classified}, summary ${summary}, alerts ${alertsCount}`, 'success');
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  /*
    التصدير السابق كان ينشئ Blob بلا BOM (العربية تظهر مشوّهة في Excel
    على ويندوز) وبلا تحييد للصيغ (CSV injection من أسماء موردين يدخلها
    الموردون أنفسهم عبر البوابة الخارجية). exportToCsv يعالج الأمرين.
  */
  const exportCsv = () => {
    if (categories.length === 0) {
      addToast('لا توجد بيانات فئات للتصدير', 'info');
      return;
    }
    exportToCsv('تقرير_تحليل_الإنفاق', SPEND_EXPORT_COLUMNS, categories as SpendCategoryRow[]);
    addToast(`تم تصدير ${categories.length} فئة`, 'success');
  };

  const totalSpend = Number(kpi?.total_spend_ytd || 0);
  const maverickSpend = Number(kpi?.maverick_spend || 0);
  const maverickPct = totalSpend ? (maverickSpend / totalSpend * 100) : 0;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div><h1 className="text-3xl font-black">تحليل الإنفاق وذكاء المشتريات</h1><p className="text-slate-500 mt-1">Data Collector + Cleansing + UNSPSC Classification + Pareto/Maverick/Tail/Forecast/KPIs.</p></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={exportCsv}>تصدير CSV</Button><Button onClick={refreshPipeline}>تحديث بيانات الإنفاق</Button></div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-sm">
        <Card><div className="text-xs text-slate-500">إجمالي الإنفاق YTD</div><div className="text-xl font-black">{totalSpend.toLocaleString()} ريال</div></Card>
        <Card><div className="text-xs text-red-700">Maverick Spend</div><div className="text-xl font-black text-red-700">{maverickSpend.toLocaleString()}</div><div className="text-[10px]">{maverickPct.toFixed(1)}%</div></Card>
        <Card><div className="text-xs text-blue-700">موردون نشطون</div><div className="text-xl font-black">{Number(kpi?.active_suppliers || 0)}</div></Card>
        <Card><div className="text-xs text-amber-700">عقود تنتهي 90 يوم</div><div className="text-xl font-black">{Number(kpi?.contracts_expiring_90 || 0)}</div><div className="text-[10px] text-emerald-700">مزاد وفر: {Number(kpi?.auction_savings||0).toLocaleString()}</div></Card>
      </div>

      {!!alerts.length && <Card className="border-amber-200 bg-amber-50"><h3 className="font-bold mb-2 text-amber-800">تنبيهات فورية</h3><div className="grid md:grid-cols-3 gap-2 text-xs">{alerts.map((a:any)=><div key={a.id} className="p-2 bg-white border rounded-xl"><b>{a.title}</b><div>{a.alert_type} • {a.severity}</div></div>)}</div></Card>}

      <div className="grid md:grid-cols-3 gap-4">
        <Card><h3 className="font-bold mb-3">Pareto 80/20 — تركيز الموردين</h3><div className="space-y-1 max-h-[40vh] overflow-auto text-xs">{pareto.map((r:any, i:number)=><div key={i} className="flex justify-between p-2 border-b"><span>{r.supplier_id?.slice(0,6)} • {Number(r.total_spend).toLocaleString()}</span><span className={`px-2 py-0.5 rounded-full text-[10px] ${Number(r.cumulative_percent) <=80 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}>{Number(r.cumulative_percent).toFixed(1)}%</span></div>)}{!pareto.length && <div className="py-10 text-center text-slate-400">لا بيانات — شغل تحديث بيانات الإنفاق</div>}</div></Card>
        <Card><h3 className="font-bold mb-3">Maverick Spend — خارج العقود</h3><div className="space-y-2 max-h-[40vh] overflow-auto">{maverick.map((r:any)=><div key={r.id} className="p-2 border rounded-xl text-xs"><div className="flex justify-between"><span>{r.supplier_id?.slice(0,6) || 'بدون مورد'}</span><span>{Number(r.amount).toLocaleString()} {r.currency_code}</span></div><div className="text-[10px] text-slate-400">{r.source} • {r.category_code || 'غير مصنف'}</div></div>)}{!maverick.length && <div className="py-10 text-center text-slate-400">لا Maverick</div>}</div></Card>
        <Card><h3 className="font-bold mb-3">Price Trend — اتجاه الأسعار</h3><div className="space-y-1 max-h-[40vh] overflow-auto text-xs">{priceTrend.map((r:any,i:number)=><div key={i} className="flex justify-between p-2 border-b"><span>{r.item_code} • {new Date(r.valid_from).toLocaleDateString('ar-SA')}</span><span className={Number(r.change_percent)>0 ? 'text-red-600' : 'text-emerald-600'}>{r.price} ({Number(r.change_percent)>0?'+':''}{Number(r.change_percent).toFixed(1)}%)</span></div>)}{!priceTrend.length && <div className="py-10 text-center text-slate-400">لا تاريخ أسعار</div>}</div></Card>
      </div>

      <Card><h3 className="font-bold mb-3">تقارير الفئات Category Reports</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-right">الفئة</th><th className="p-2">الإنفاق</th><th className="p-2">المعاملات</th><th className="p-2">الموردون</th><th className="p-2">Maverick</th></tr></thead><tbody className="divide-y">{categories.map((c:any)=><tr key={c.category_code}><td className="p-2 font-bold">{c.category_name} <span className="font-mono text-xs text-slate-400">{c.category_code}</span></td><td className="p-2">{Number(c.total_spend).toLocaleString()}</td><td className="p-2">{c.transaction_count}</td><td className="p-2">{c.supplier_count}</td><td className="p-2 text-red-700">{Number(c.maverick_spend||0).toLocaleString()}</td></tr>)}{!categories.length&&<tr><td colSpan={5} className="p-10 text-center text-slate-400">لا تقارير فئات</td></tr>}</tbody></table></div></Card>
    </div>
  );
}
