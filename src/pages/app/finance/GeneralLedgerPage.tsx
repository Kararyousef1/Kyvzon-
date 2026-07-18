import React, { useState, useEffect } from 'react';
import { BookOpen, Search, Filter, Plus, ArrowUpDown, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { generalLedgerService } from '../../../services/sdk/GeneralLedgerService';

export default function GeneralLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    setLoading(true);
    generalLedgerService.findByStatus('posted').then(data => {
      setEntries(data);
      setLoading(false);
    }).catch(err => {
      console.error('خطأ في تحميل الدفتر العام:', err);
      setLoading(false);
    });
  }, []);

  const filtered = entries.filter(e => {
    const matchStatus = filterStatus === 'all' ? true : e.status === filterStatus;
    const matchSearch = search === '' ? true : (e.entry_number?.includes(search) || e.description?.includes(search) || e.reference?.includes(search));
    return matchStatus && matchSearch;
  });

  const totalDebit = filtered.reduce((s, e) => s + Number(e.total_debit || 0), 0);
  const totalCredit = filtered.reduce((s, e) => s + Number(e.total_credit || 0), 0);

  return (
    <div className="p-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-3">
            <BookOpen className="text-blue-600" size={28} />
            الدفتر العام
          </h1>
          <p className="text-slate-500">سجل مركزي لكل المعاملات المالية — نظام القيد المزدوج الصارم</p>
        </div>
        <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/25">
          <Plus size={18} /> إضافة قيد جديد
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider mb-1">إجمالي المدين</h3>
          <p className="text-3xl font-extrabold text-slate-900">{totalDebit.toLocaleString('en-US')} SAR</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 border border-rose-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold text-rose-600 uppercase tracking-wider mb-1">إجمالي الدائن</h3>
          <p className="text-3xl font-extrabold text-slate-900">{totalCredit.toLocaleString('en-US')} SAR</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-extrabold text-amber-600 uppercase tracking-wider mb-1">عدد القيود</h3>
          <p className="text-3xl font-extrabold text-slate-900">{filtered.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex gap-3">
            <div className="relative">
              <input type="text" placeholder="البحث برقم القيد أو الوصف..." value={search} onChange={e => setSearch(e.target.value)} className="w-full md:w-80 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilterStatus('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filterStatus === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>الكل</button>
            <button onClick={() => setFilterStatus('draft')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filterStatus === 'draft' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}>مسودة</button>
            <button onClick={() => setFilterStatus('posted')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filterStatus === 'posted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'}`}>منشور</button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200">
            <tr>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">رقم القيد</th>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">التاريخ</th>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">الوصف</th>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">مدين</th>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">دائن</th>
              <th className="text-right px-5 py-3.5 font-extrabold text-slate-700">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">جارٍ تحميل البيانات من قاعدة البيانات...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا توجد قيود مطابقة — البيانات تأتي من SDK</td></tr>
            ) : (
              filtered.map((entry: any) => (
                <tr key={entry.id} className="hover:bg-blue-50/30 transition group">
                  <td className="px-5 py-4 font-mono text-blue-700 font-bold">{entry.entry_number || '—'}</td>
                  <td className="px-5 py-4 text-slate-600">{entry.entry_date || '—'}</td>
                  <td className="px-5 py-4 text-slate-800 font-medium max-w-xs truncate">{entry.description || '—'}</td>
                  <td className="px-5 py-4 font-extrabold text-emerald-700">{Number(entry.total_debit || 0).toLocaleString('en-US')}</td>
                  <td className="px-5 py-4 font-extrabold text-rose-700">{Number(entry.total_credit || 0).toLocaleString('en-US')}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold border ${entry.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : entry.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {entry.status === 'posted' ? <CheckCircle size={12}/> : entry.status === 'draft' ? <Clock size={12}/> : <AlertTriangle size={12}/>}
                      {entry.status === 'posted' ? 'منشور' : entry.status === 'draft' ? 'مسودة' : entry.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
