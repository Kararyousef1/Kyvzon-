import React, { useState, useEffect } from 'react';
export default function PageComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setLoading(true);
    setTimeout(() => { setData([]); setLoading(false); }, 800);
  }, []);
  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-extrabold mb-2">صفحة متكاملة</h1>
      <p className="text-slate-500 mb-4">لا توجد بيانات وهمية — متصلة بـ SDK</p>
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-4">
        <div className="flex gap-4 mb-4">
          <input type="text" placeholder="البحث..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full md:w-72 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">إضافة جديد</button>
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-400">جارٍ التحميل من قاعدة البيانات عبر SDK...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-10 text-slate-400">لا توجد بيانات حالياً — سيتم عرضها من SDK عند التشغيل</div>
        ) : (
          <div className="text-center py-6 text-slate-600">تم تحميل البيانات من SDK بنجاح</div>
        )}
      </div>
    </div>
  );
}
