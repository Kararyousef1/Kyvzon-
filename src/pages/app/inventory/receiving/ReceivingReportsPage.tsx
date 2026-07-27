import { useEffect, useState } from 'react';
import { inventoryReceivingAnalyticsService } from '../../../../services/sdk';

export default function ReceivingReportsPage() {
  const [osd, setOsd] = useState<Record<string, unknown>[]>([]);
  const [productivity, setProductivity] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    inventoryReceivingAnalyticsService.osdReport().then(setOsd).catch(() => setOsd([]));
    inventoryReceivingAnalyticsService.productivity().then(setProductivity).catch(() => setProductivity([]));
  }, []);
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">تقارير الاستلام</h1>
        <p className="text-slate-500 mt-1">Dock-to-Stock، OS&D، وإنتاجية موظفي الاستلام.</p>
      </div>
      <section className="bg-white border rounded-2xl overflow-hidden">
        <h2 className="font-bold p-4 border-b">تقرير OS&D</h2>
        <table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">النوع</th><th className="p-3">الخطورة</th><th className="p-3">الحالة</th><th className="p-3">العدد</th></tr></thead><tbody>{osd.map((r,i)=><tr className="border-t" key={i}><td className="p-3">{String(r.osd_type ?? '—')}</td><td className="p-3 text-center">{String(r.severity ?? '—')}</td><td className="p-3 text-center">{String(r.status ?? '—')}</td><td className="p-3 text-center">{String(r.case_count ?? 0)}</td></tr>)}{!osd.length&&<tr><td colSpan={4} className="p-8 text-center text-slate-400">لا توجد حالات</td></tr>}</tbody></table>
      </section>
      <section className="bg-white border rounded-2xl overflow-hidden">
        <h2 className="font-bold p-4 border-b">إنتاجية الاستلام</h2>
        <table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">الموظف</th><th className="p-3">عدد البنود</th><th className="p-3">الكمية المقبولة</th><th className="p-3">أول عملية</th><th className="p-3">آخر عملية</th></tr></thead><tbody>{productivity.map((r,i)=><tr className="border-t" key={i}><td className="p-3 font-mono text-xs">{String(r.employee_id ?? '—')}</td><td className="p-3 text-center">{String(r.lines_count ?? 0)}</td><td className="p-3 text-center">{String(r.accepted_qty ?? 0)}</td><td className="p-3 text-center">{r.first_scan_at ? new Date(String(r.first_scan_at)).toLocaleString('ar-SA') : '—'}</td><td className="p-3 text-center">{r.last_scan_at ? new Date(String(r.last_scan_at)).toLocaleString('ar-SA') : '—'}</td></tr>)}{!productivity.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد إنتاجية مسجلة</td></tr>}</tbody></table>
      </section>
    </div>
  );
}
