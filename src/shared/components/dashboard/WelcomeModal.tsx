import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../core/stores';
import { ChevronLeft } from 'lucide-react';

const WELCOME_KEY = 'hr_welcome_shown_v3';

const slides = [
  {
    icon: '👋',
    title: 'مرحباً بك في Kyvzon Platform',
    desc: 'نظام إدارة الموارد البشرية المتكامل',
    color: 'from-indigo-600 to-purple-700',
  },
  {
    icon: '📢',
    title: 'التبليغات',
    desc: 'يمكنك الآن مشاهدة التبليغات من أيقونة الجرس في الشريط الجانبي العلوي',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: '👤',
    title: 'الملف الشخصي',
    desc: 'جميع بياناتك محدثة في ملفك الشخصي. يمكنك تعديلها من أي وقت',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    icon: '🛡️',
    title: 'الصلاحيات',
    desc: 'الصفحات التي تراها في الشريط الجانبي هي حسب صلاحياتك الممنوحة من الإدارة',
    color: 'from-emerald-500 to-teal-600',
  },
];

export default function WelcomeModal() {
  const { user, isAuthenticated } = useAuthStore();
  const [show, setShow] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const shown = sessionStorage.getItem(WELCOME_KEY);
    if (!shown) {
      setTimeout(() => setShow(true), 500);
    }
  }, [isAuthenticated, user]);

  const dismiss = () => {
    sessionStorage.setItem(WELCOME_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  const cur = slides[slide];

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className={`bg-gradient-to-br ${cur.color} p-8 text-center`}>
          <div className="text-6xl mb-4">{cur.icon}</div>
          <h2 className="text-2xl font-bold text-white">{cur.title}</h2>
          <p className="text-white/80 mt-2 text-sm">{cur.desc}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {slides.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all ${i === slide ? 'w-8 bg-indigo-500' : 'w-2 bg-slate-200'}`} />
          ))}
        </div>

        {/* Footer */}
        <div className="p-6">
          {slide < slides.length - 1 ? (
            <button onClick={() => setSlide(s => s + 1)}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
              التالي <ChevronLeft size={18} />
            </button>
          ) : (
            <button onClick={dismiss}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
              ✨ ابدأ استخدام النظام
            </button>
          )}
          {slide > 0 && (
            <button onClick={() => setSlide(s => s - 1)}
              className="w-full py-2 mt-2 text-slate-500 hover:text-slate-700 text-sm font-semibold">
              السابق
            </button>
          )}
          <button onClick={dismiss} className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs mt-1">
            تخطي
          </button>
        </div>
      </div>
    </div>
  );
}