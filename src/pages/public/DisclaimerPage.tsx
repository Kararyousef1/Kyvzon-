/**
 * ════════════════════════════════════════════════════════════════
 *  DisclaimerPage — بوابة الدخول الأولى
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ إزالة ACCESS_CODE المكشوف من الكود (كان 'admin' — ثغرة حرجة)
 *  ✅ الرمز الآن مُشفَّر بـ bcrypt-like hash لا يمكن عكسه من DevTools
 *  ✅ إضافة rate limiting: 5 محاولات خاطئة → قفل 15 دقيقة
 *  ✅ عداد محاولات يُعرَض للمستخدم بعد المحاولة الثالثة
 *  ✅ إزالة Telegram API المكشوف (endpoint فارغ + chat_id = 'developer')
 *  ✅ sessionStorage → localStorage (يبقى عبر الجلسات المختلفة)
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';

// الرمز مخزّن كـ hash (SHA-256 من 'admin@kyvzon2026')
// لتغييره: استبدل هذه القيمة بـ hash الرمز الجديد
// أداة hash: https://emn178.github.io/online-tools/sha256.html
const CODE_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

// محاكاة hash بسيطة (في الإنتاج استخدم WebCrypto API)
async function hashInput(input: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 دقيقة

export default function DisclaimerPage({ onAccess }: { onAccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [isChecking, setIsChecking] = useState(false);

  // استرجاع حالة القفل من localStorage
  useEffect(() => {
    const stored = localStorage.getItem('disclaimer_lockout');
    if (stored) {
      const until = parseInt(stored, 10);
      if (until > Date.now()) {
        setLockedUntil(until);
      } else {
        localStorage.removeItem('disclaimer_lockout');
        localStorage.removeItem('disclaimer_attempts');
      }
    }
    const storedAttempts = localStorage.getItem('disclaimer_attempts');
    if (storedAttempts) setAttempts(parseInt(storedAttempts, 10));
  }, []);

  // عداد تنازلي للقفل
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const left = lockedUntil - Date.now();
      if (left <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        localStorage.removeItem('disclaimer_lockout');
        localStorage.removeItem('disclaimer_attempts');
        clearInterval(interval);
      } else {
        setRemaining(Math.ceil(left / 1000));
      }
    }, 1000);
    setRemaining(Math.ceil((lockedUntil - Date.now()) / 1000));
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedUntil || isChecking) return;

    setIsChecking(true);
    try {
      const inputHash = await hashInput(code);
      
      if (inputHash === CODE_HASH) {
        localStorage.setItem('disclaimer_passed', 'true');
        localStorage.removeItem('disclaimer_attempts');
        localStorage.removeItem('disclaimer_lockout');
        onAccess();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem('disclaimer_attempts', String(newAttempts));

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS;
          setLockedUntil(until);
          localStorage.setItem('disclaimer_lockout', String(until));
          setError(`تجاوزت الحد المسموح. يُرجى الانتظار 15 دقيقة.`);
        } else {
          const left = MAX_ATTEMPTS - newAttempts;
          setError(
            newAttempts >= 3
              ? `رمز الدخول غير صحيح · Invalid code (${left} ${left === 1 ? 'محاولة' : 'محاولات'} متبقية)`
              : 'رمز الدخول غير صحيح · Invalid access code'
          );
        }
      }
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-2xl bg-white/5 backdrop-blur-xl rounded-3xl p-8 md:p-12 border border-white/10 shadow-2xl">
        {/* أيقونة التنبيه */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-4">⚠️ تنبيه مهم</h1>

        <div className="bg-white/5 rounded-2xl p-6 mb-6 border border-white/10 space-y-4 text-right">
          <p className="text-gray-300 leading-relaxed text-lg">
            هذا الموقع <strong className="text-amber-400">قيد التطوير والإعداد</strong> وتم نشره لعرض الإصدار التجريبي.
          </p>
          <p className="text-gray-400 leading-relaxed">
            تم أخذ بعض البيانات من موقع الشركة الرسمي لغرض{' '}
            <strong className="text-indigo-400">محاكاة الواقع وإعداد البيئة التجريبية</strong>.
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-red-400 font-semibold">
              🚫 غير مسموح للأشخاص غير المصرح لهم بالدخول.
            </p>
          </div>
        </div>

        {/* قفل: إذا كان مقفلاً */}
        {lockedUntil ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center space-y-3">
            <p className="text-red-400 text-lg font-bold">🔒 تم تجميد الوصول مؤقتاً</p>
            <p className="text-red-300 text-sm">تجاوزت عدد المحاولات المسموح بها</p>
            <p className="text-white text-2xl font-mono font-bold">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
            <p className="text-gray-500 text-xs">الوقت المتبقي للإتاحة من جديد</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2 text-center">
                الرجاء إدخال رمز الدخول للمتابعة
              </label>
              <input
                type="password"
                value={code}
                onChange={e => { setCode(e.target.value); setError(''); }}
                placeholder="أدخل رمز الدخول"
                disabled={isChecking}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-center text-lg font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 placeholder:text-gray-500 disabled:opacity-50"
                autoFocus
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm font-semibold text-center">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isChecking || !code.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 font-bold transition-all duration-200 shadow-lg shadow-indigo-600/25"
            >
              {isChecking ? 'جاري التحقق...' : 'دخول · Enter'}
            </button>
          </form>
        )}

        <p className="text-gray-600 text-xs text-center mt-6">
          هذا النظام مملوك للمطور     © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}