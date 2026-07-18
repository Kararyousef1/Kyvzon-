import React, { useState } from 'react';
import { FileCheck, Clock, AlertCircle } from 'lucide-react';
export default function ApprovalsPage() {
  const [filter, setFilter] = useState('pending');
  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-extrabold mb-2">سير الموافقات</h1>
      <p className="text-slate-500 mb-6">إدارة موافقات القيود اليومية والفواتير والميزانيات</p>
      <div className="flex gap-2 mb-4">
        {['pending','approved','rejected'].map(s => <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{s === 'pending' ? 'معلقة' : s === 'approved' ? 'موافق' : 'مرفوض'}</button>)}
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h3 className="font-extrabold mb-4">الموافقات المعلقة</h3>
        <p className="text-center text-slate-400">لا توجد موافقات حالياً في هذه الحالة — سيتم عرضها من SDK عند التشغيل</p>
      </div>
    </div>
  );
}
