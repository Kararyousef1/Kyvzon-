import { BarChart3, ShieldCheck, Users, Zap } from 'lucide-react';
import Card from '../../../../shared/components/ui/Card';

export default function LogisticsDashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Zap /> لوحة القيادة اللوجستية المركزية</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة الأسطول، الشحنات، السائقين، والعمليات اللوجستية في الوقت الفعلي.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Zap size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">0</p><p className="text-xs text-slate-500">الرحلات النشطة</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">100%</p><p className="text-xs text-slate-500">جاهزية الأسطول</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold"><Users size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">0</p><p className="text-xs text-slate-500">السائقون على الطريق</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><BarChart3 size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">0 د.ع</p><p className="text-xs text-slate-500">تكاليف التشغيل اليومية</p></div></div></Card>
      </div>

      <Card>
        <div className="py-12 text-center text-slate-400">
          <p className="font-bold text-slate-600 mb-1">لوحة القيادة اللوجستية جاهزة للربط مع وحدات الأسطول والشحنات (L01 – L11)</p>
          <p className="text-xs">تم إرساء البنية التحتية بنجاح وتطبيق قواعد RLS والـ SDK.</p>
        </div>
      </Card>
    </div>
  );
}
