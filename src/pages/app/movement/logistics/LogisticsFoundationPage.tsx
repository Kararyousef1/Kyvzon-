import { Settings, Sliders } from 'lucide-react';
import Card from '../../../../shared/components/ui/Card';

export default function LogisticsFoundationPage() {
  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Settings /> إعدادات البنية اللوجستية</h2>
          <p className="text-white/75 mt-2 text-sm">تكوين المعلمات الأساسية للأسطول، وحدات القياس، وسياسات التتبع والوقود.</p>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sliders size={18} /> إعدادات النظام اللوجستي الافتراضية</h3>
          <p className="text-sm text-slate-600">هذه الوحدة تدير الثوابت والسياسات الخاصة بجميع وحدات النقل واللوجستيات (L01 إلى L11).</p>
        </div>
      </Card>
    </div>
  );
}
