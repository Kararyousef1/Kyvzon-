import Card from '../../../../shared/components/ui/Card';

export default function CategoryPage() {
  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">إدارة فئات الشراء — Category Management</h1>
        <p className="text-slate-500 mt-1">مدير فئة يتعمق في فئة 3-5 سنوات + استراتيجية توريد — Unit 07</p>
      </div>

      <Card>
        <h3 className="font-bold mb-3">مثال — فئة الصفائح المعدنية</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="font-bold">الوضع الحالي</div>
            <ul className="list-disc pr-4 mt-2 space-y-1 text-slate-600">
              <li>الإنفاق السنوي: 4.8M ريال</li>
              <li>عدد الموردين: 3 (1 رئيسي + 2 ثانويان)</li>
              <li>متوسط التوفير السنوي: 2.1%</li>
            </ul>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="font-bold text-blue-800">تحليل السوق</div>
            <ul className="list-disc pr-4 mt-2 space-y-1 text-blue-900">
              <li>الطاقة الإنتاجية السوقية كافية (لا نقص)</li>
              <li>5 موردين محليون مؤهلون</li>
              <li>أسعار السوق في اتجاه تصاعدي 6% خلال سنة</li>
            </ul>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 md:col-span-2">
            <div className="font-bold text-emerald-800">الأهداف الاستراتيجية (3 سنوات)</div>
            <ul className="list-disc pr-4 mt-2 space-y-1 text-emerald-900">
              <li>رفع التوفير لـ 5% سنوياً عبر تنافس أوسع</li>
              <li>تطوير مورد ثالث استراتيجي</li>
              <li>إبرام عقود إطار لـ 70% من الحجم (تثبيت السعر)</li>
              <li>استكشاف الاستيراد المباشر (تجاوز الوسيط)</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">مصفوفة Kraljic — تقسيم استراتيجي</h3>
        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl"><div className="font-bold text-purple-800">استراتيجي (تأثير مرتفع/مخاطر مرتفعة)</div><div className="text-xs mt-1">شراكة طويلة الأمد، تكامل عميق، لقاءات ربعية</div></div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl"><div className="font-bold text-blue-800">رافعة (تأثير مرتفع/مخاطر منخفضة)</div><div className="text-xs mt-1">تنافس بين الموردين، مفاوضة صارمة على السعر</div></div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl"><div className="font-bold text-amber-800">عنق زجاجة (تأثير منخفض/مخاطر مرتفعة)</div><div className="text-xs mt-1">بناء مخزون أمان، تطوير موردين بديلين</div></div>
          <div className="p-4 bg-slate-50 border rounded-xl"><div className="font-bold">روتيني (تأثير منخفض/مخاطر منخفضة)</div><div className="text-xs mt-1">أتمتة الشراء، تقليل الوقت الإداري</div></div>
        </div>
      </Card>
    </div>
  );
}
