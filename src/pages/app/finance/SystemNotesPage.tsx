import React from 'react';
export default function SystemNotesPage() {
  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-extrabold mb-2">ملاحظات النظام</h1>
      <p className="text-slate-500 mb-6">سجل غير قابل للتعديل — كل ملاحظة تُسجل وتبقى للأبد وفق مبدأ Square Books</p>
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-4">
          <strong>مبدأ عدم التعديل (Immutability):</strong> لا يمكن تعديل أو حذف أي ملاحظة. إذا احتجت تصحيحاً، أضف ملاحظة جديدة تشير إلى الملاحظة السابقة.
        </div>
        <p className="text-center text-slate-400 py-8">لا توجد ملاحظات حالياً — سيتم عرضها من SDK عند التشغيل</p>
      </div>
    </div>
  );
}
