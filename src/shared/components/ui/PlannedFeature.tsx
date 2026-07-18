import { Construction, Clock, FileText, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PlannedFeatureProps {
  name: string;
  description?: string;
  wave?: number;
  status?: 'planned' | 'in_build' | 'beta';
  expectedDate?: string;
  backTo?: string;
}

const statusMap = {
  planned: { label: 'مخطط له', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  in_build: { label: 'قيد البناء', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  beta: { label: 'تجريبي', color: 'bg-blue-50 text-blue-700 border-blue-300' },
};

export default function PlannedFeature({
  name,
  description,
  wave,
  status = 'planned',
  expectedDate,
  backTo = '/app/finance',
}: PlannedFeatureProps) {
  const st = statusMap[status];
  return (
    <div className="p-8 md:p-12 flex items-center justify-center min-h-[60vh]" dir="rtl">
      <div className="max-w-2xl w-full">
        <div className="bg-white border-2 border-dashed rounded-[24px] p-8 md:p-10 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Construction className="text-amber-600" size={28} />
            </div>
            <span className={`px-3 py-1.5 rounded-full border text-xs font-black ${st.color}`}>{st.label}</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-black text-slate-900">{name}</h1>
          {description && <p className="text-slate-600 mt-3 leading-relaxed">{description}</p>}

          <div className="grid sm:grid-cols-3 gap-3 mt-8">
            {wave && (
              <div className="bg-slate-50 border rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500"><FileText size={14} />الموجة</div>
                <p className="font-black mt-1">Wave {wave}</p>
              </div>
            )}
            {expectedDate && (
              <div className="bg-slate-50 border rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500"><Clock size={14} />متوقع</div>
                <p className="font-black mt-1">{expectedDate}</p>
              </div>
            )}
            <div className="bg-slate-50 border rounded-xl p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500"><Construction size={14} />الحالة</div>
              <p className="font-bold mt-1 text-sm">لا يُعرض للعملاء كمنتج جاهز</p>
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 mt-6">
            <p className="text-sm font-bold text-amber-800">قاعدة ذهبية (من خطة العلاج):</p>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              لا تُعد أي شاشة مالية مكتملة إلا إذا حققت: عقد بيانات، migration/RLS، SDK typed، واجهة CRUD حقيقية، سجل تدقيق،
              اختبارات وحدة/تكامل/E2E، واختبار صلاحيات متعدد الشركات. هذه الصفحة لم تحقق Definition of Done بعد.
            </p>
          </div>

          <div className="flex gap-3 mt-8">
            <Link to={backTo} className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl font-black text-sm hover:bg-slate-800">
              <ArrowRight size={16} /> العودة للمالية
            </Link>
            <Link to="/app/finance/setup" className="px-5 py-3 bg-white border rounded-xl font-bold text-sm">
              إعداد المالية
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Kyvzon Finance — Wave {wave ?? '?'} — لا تفعيل customer-facing قبل اجتياز DoD
        </p>
      </div>
    </div>
  );
}
