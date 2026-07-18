import React, { useState } from 'react';
import { FileText, Plus, ArrowUpDown, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
export default function JournalEntriesPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  return (
    <div className="p-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div><h1 className="text-2xl font-extrabold flex items-center gap-3"><FileText className="text-blue-600" size={28}/>قيود اليومية</h1><p className="text-slate-500">إضافة وتعديل وعكس القيود المحاسبية وفق مبدأ القيد المزدوج</p></div>
        <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/25"><Plus size={18}/> إضافة قيد جديد</button>
      </div>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="relative"><input type="text" placeholder="البحث برقم القيد..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full md:w-80 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" /><ArrowUpDown className="absolute left-3 top-2.5 text-slate-400" size={16}/></div>
          <div className="flex gap-2">
            {['all','draft','posted','reversed'].map(s => <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filterStatus === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{s === 'all' ? 'الكل' : s === 'draft' ? 'مسودة' : s === 'posted' ? 'منشور' : 'عكسي'}</button>)}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200"><tr><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">رقم القيد</th><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">التاريخ</th><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">الوصف</th><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">مدين</th><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">دائن</th><th className="text-right px-5 py-3.5 font-extrabold text-slate-700">الحالة</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-blue-50/30"><td className="px-5 py-4 font-mono text-blue-600 font-bold">JE-001</td><td className="px-5 py-4 text-slate-600">2026-07-01</td><td className="px-5 py-4 text-slate-800 font-medium">راتب شهر 7</td><td className="px-5 py-4 font-extrabold text-emerald-700">12,500 SAR</td><td className="px-5 py-4 font-extrabold text-rose-700">12,500 SAR</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle size={12}/>منشور</span></td></tr>
          </tbody>
        </table>
        <div className="bg-gradient-to-r from-amber-50 to-amber-100/30 border-t border-amber-200 p-5 text-sm text-amber-800">
          <strong>مبدأ عدم التعديل (Immutability):</strong> لا يمكن تعديل أو حذف أي قيد بعد نشره. إذا احتجت تصحيحاً، أضف قيداً عكسياً جديداً.
        </div>
      </div>
    </div>
  );
}
