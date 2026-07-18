import React, { useState, useEffect } from 'react';
import { FileCheck, Plus } from 'lucide-react';
import { revenueRecognitionService } from '../../../services/sdk/RevenueRecognitionService';
export default function RevenueRecognitionPage() {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  useEffect(() => { revenueRecognitionService.findActive().then(c => { setContracts(c); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-extrabold">الاعتراف بالإيرادات</h1><p className="text-slate-500">إدارة العقود وفق ASC 606 / IFRS 15</p></div>
        <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold hover:bg-blue-700"><Plus size={16}/> عقد جديد</button>
      </div>
      {loading ? <div className="text-center py-10 text-slate-400">جارٍ التحميل من قاعدة البيانات عبر SDK...</div> : contracts.length === 0 ? <div className="text-center py-10 text-slate-400">لا توجد عقود حالياً — سيتم عرضها عند التشغيل</div> : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm"><thead className="bg-slate-50 border-b"><tr><th className="text-right px-5 py-3 font-extrabold">رقم العقد</th><th className="text-right px-5 py-3 font-extrabold">العميل</th><th className="text-right px-5 py-3 font-extrabold">المبلغ</th><th className="text-right px-5 py-3 font-extrabold">الطريقة</th><th className="text-right px-5 py-3 font-extrabold">الحالة</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map(c => <tr key={c.id} className="hover:bg-blue-50/30"><td className="px-5 py-4 font-mono text-blue-600 font-bold">{c.contract_number || '—'}</td><td className="px-5 py-4 font-medium">{c.customer_name || '—'}</td><td className="px-5 py-4 font-extrabold">{Number(c.total_amount || 0).toLocaleString('en-US')} SAR</td><td className="px-5 py-4 text-xs font-bold bg-amber-50 text-amber-700 rounded-full px-2">{c.recognition_method || '—'}</td><td className="px-5 py-4"><span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-extrabold border border-emerald-200">نشط</span></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
