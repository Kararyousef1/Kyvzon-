import { useEffect, useState } from 'react';
import Card from '../../../shared/components/ui/Card';
import { supplierService, purchaseRequisitionService } from '../../../services/sdk';
import { Package, FileText, Users, TrendingUp } from 'lucide-react';

export default function ProcurementDashboard() {
  const [stats, setStats] = useState({ suppliers: 0, prs: 0, pending: 0, approved: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [suppliers, prs] = await Promise.all([
          supplierService.findAll({ limit: 1 }).catch(() => []),
          purchaseRequisitionService.findAll({ limit: 100 }).catch(() => []),
        ]);
        // للحصول على العدد الحقيقي نحتاج count — نستخدم طول المصفوفة مؤقتاً
        const pending = prs.filter((r: any) => r.status === 'pending_approval').length;
        const approved = prs.filter((r: any) => r.status === 'approved').length;
        setStats({ suppliers: suppliers.length, prs: prs.length, pending, approved });
      } catch {}
    })();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">بوابة المشتريات</h1>
        <p className="text-slate-500 mt-2">P2P — من طلب الشراء حتى التحليل — Wave1: الموردون + طلبات الشراء</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3"><div className="p-3 bg-amber-100 rounded-xl"><Users className="text-amber-600" /></div><div><div className="text-2xl font-bold">{stats.suppliers}</div><div className="text-sm text-slate-500">موردون</div></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="p-3 bg-blue-100 rounded-xl"><FileText className="text-blue-600" /></div><div><div className="text-2xl font-bold">{stats.prs}</div><div className="text-sm text-slate-500">طلبات شراء</div></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="p-3 bg-orange-100 rounded-xl"><Package className="text-orange-600" /></div><div><div className="text-2xl font-bold">{stats.pending}</div><div className="text-sm text-slate-500">معلقة موافقة</div></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="p-3 bg-emerald-100 rounded-xl"><TrendingUp className="text-emerald-600" /></div><div><div className="text-2xl font-bold">{stats.approved}</div><div className="text-sm text-slate-500">معتمدة</div></div></div></Card>
      </div>

      <Card>
        <h3 className="font-bold mb-3">خارطة طريق بوابة المشتريات</h3>
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200"><div className="font-bold text-amber-800">Wave1 ✅ الأساس</div><ul className="list-disc pr-4 mt-2 space-y-1 text-amber-900"><li>الموردون + Kraljic</li><li>طلبات الشراء PR + سير موافقات 3 مستويات</li><li>فحص ميزانية فوري</li></ul></div>
          <div className="p-3 bg-slate-50 rounded-xl border"><div className="font-bold">Wave2 — الطلبات والأوامر</div><ul className="list-disc pr-4 mt-2 space-y-1"><li>RFx (RFI/RFQ/RFP) + تقييم</li><li>PO بأنواعه + GR جزئي + RTV</li><li>مزاد عكسي Realtime</li></ul></div>
          <div className="p-3 bg-slate-50 rounded-xl border"><div className="font-bold">Wave3 — الفواتير والعقود</div><ul className="list-disc pr-4 mt-2 space-y-1"><li>3-Way Matching RPC</li><li>CLM + obligations + توقيع</li><li>ربط مع المالية AP</li></ul></div>
          <div className="p-3 bg-slate-50 rounded-xl border"><div className="font-bold">Wave3 — التحليلات</div><ul className="list-disc pr-4 mt-2 space-y-1"><li>Pareto 80/20</li><li>Maverick/Tail Spend</li><li>Price Trend + تنبؤ</li></ul></div>
        </div>
      </Card>
    </div>
  );
}
