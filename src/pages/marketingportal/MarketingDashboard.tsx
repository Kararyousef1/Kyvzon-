/**
 * ═════════════════════════════════════════════════════════════════════════
 *  MarketingDashboard — لوحة بوابة التسويق الرئيسية
 *
 *  نقطة الدخول للبوابة: تعرض الوحدات السبع كبطاقات، مع تمييز الجاهز عن
 *  القادم (قريباً). الوحدات تُبنى تدريجياً حسب ترتيب التقارير.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import { Megaphone, ArrowLeft } from 'lucide-react';
import { MARKETING_MODULES } from './marketingCatalog';

export default function MarketingDashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6" dir="rtl">
      {/* البانر */}
      <div className="bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
              <Megaphone size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">بوابة التسويق</h1>
              <p className="text-white/75 text-sm">أدِر كل قنوات تسويقك من مكان واحد</p>
            </div>
          </div>
          <p className="text-white/80 text-sm max-w-2xl mt-3 leading-relaxed">
            منظومة تسويق متكاملة: أتمتة، بريد، وسائل تواصل، رسائل، فعاليات، استبيانات،
            ونظام مناعة علائقية يحمي علاقتك بعملائك. يتم إطلاق الوحدات تباعاً.
          </p>
        </div>
      </div>

      {/* شبكة الوحدات */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MARKETING_MODULES.map((m) => {
          const Icon = m.icon;
          const disabled = m.status === 'coming_soon';
          return (
            <button
              key={m.id}
              onClick={() => !disabled && navigate(m.path)}
              disabled={disabled}
              className={`
                text-right rounded-2xl border p-5 transition-all relative overflow-hidden
                ${disabled
                  ? 'border-slate-200 bg-slate-50/50 cursor-not-allowed'
                  : 'border-slate-200 bg-white hover:border-fuchsia-300 hover:shadow-md cursor-pointer'}
              `}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-fuchsia-50 text-fuchsia-600'}`}>
                  <Icon size={20} />
                </div>
                {disabled ? (
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">قريباً</span>
                ) : (
                  <ArrowLeft size={16} className="text-fuchsia-400 mt-1" />
                )}
              </div>
              <h3 className={`font-black mt-3 text-sm sm:text-base ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>{m.label}</h3>
              <p className={`text-xs mt-1 leading-relaxed ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>{m.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
