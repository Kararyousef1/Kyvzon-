import { useEffect, useState } from 'react';
import { mrpManufacturingAnalyticsService } from '../../../services/sdk';
import { MrpUnitNav } from './shared/MrpUnitNav';

type Row = Record<string, unknown>;

export default function MrpDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { mrpManufacturingAnalyticsService.executive().then(setRows).catch(() => setRows([])); }, []);
  const cols = [
    ['active_work_orders','أوامر نشطة'], ['completed_today','مكتمل اليوم'], ['avg_oee_24h','OEE 24h'],
    ['avg_cost_variance','فرق تكلفة'], ['open_ncr','NCR مفتوحة'], ['open_maintenance_wo','صيانة مفتوحة'], ['open_analytics_alerts','تنبيهات']
  ];
  return <div dir="rtl" className="space-y-5">
    <div><h1 className="text-3xl font-black">بوابة التصنيع MRP</h1><p className="text-slate-500">لوحة التصنيع الرئيسية: انتقل بين وحدات التصنيع من الأساس حتى التحليلات.</p></div>
    <MrpUnitNav unit="main" />
    <div className="bg-white border rounded-2xl overflow-hidden">
      <table className="w-full text-sm"><thead className="bg-slate-50"><tr>{cols.map(([_,label])=><th key={label} className="p-3 text-right">{label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??i)} className="border-t">{cols.map(([key])=><td key={key} className="p-3">{String(row[key]??'—')}</td>)}</tr>)}{!rows.length&&<tr><td colSpan={cols.length} className="p-10 text-center text-slate-400">لا توجد مؤشرات تنفيذية بعد — ستظهر بعد تطبيق migrations وإدخال بيانات تشغيلية.</td></tr>}</tbody></table>
    </div>
  </div>;
}
