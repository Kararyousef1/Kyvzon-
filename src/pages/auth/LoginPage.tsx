/**
 * ════════════════════════════════════════════════════════════════
 *  LoginPage - صفحة تسجيل الدخول (نقطة التجميع)
 *  Kyvzon Platform
 * ════════════════════════════════════════════════════════════════
 *
 *  🔒 الأمان:
 *  1. المصادقة تعتمد على Supabase Session فقط — لا localStorage.setItem('user')
 *  2. نطاق البريد الموحَّد: EMAIL_DOMAIN
 *  3. حماية Brute Force عبر useLoginSecurity (طبقة عميل إضافية)
 *  4. بعد نجاح storeLogin، يضبط AuthService.setSessionContext()
 *     تلقائياً app.current_role / app.current_tenant_id في Postgres —
 *     بدون هذا لا تعمل RLS policies فعلياً (انظر AuthService.ts)
 *
 *  هذا الملف مسؤول فقط عن التجميع وربط استدعاء تسجيل الدخول.
 *  التصميم البصري في LoginBackground، الحقول في LoginForm،
 *  ومنطق الحماية في useLoginSecurity.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect } from 'react';
import { ShieldCheck, ArrowLeft, Lock, Zap } from 'lucide-react';
import { useAuthStore } from '../../core/stores';
import LoginBackground from './LoginBackground';
import LoginForm from './LoginForm';
import DevLoginModal from './DevLoginModal';
import { useLoginSecurity } from './useLoginSecurity';
import './login.css';

const EMAIL_DOMAIN = '@kyvzon.com';

interface LoginPageProps {
  onNavigate?: (page: string) => void;
  onBack?: () => void;
}

export default function LoginPage({ onBack }: LoginPageProps) {
  const { login: storeLogin } = useAuthStore();
  const security = useLoginSecurity();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // مسح رسالة الخطأ تلقائياً بعد 6 ثوانٍ
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setError('');
  }, []);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    setError('');
  }, []);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccess('');

      if (security.checkLockout() > 0) {
        setError(`تم تأمين الحساب مؤقتاً. انتظر ${security.remainingLockout} ثانية.`);
        return;
      }

      const validationError = security.validate(username, password);
      if (validationError) {
        setError(validationError);
        return;
      }

      setLoading(true);

      try {
        const finalEmail = username.includes('@')
          ? username.trim().toLowerCase()
          : `${username.trim().toLowerCase()}${EMAIL_DOMAIN}`;

        // storeLogin يتولى: Supabase Auth → setSessionContext (RLS) →
        // جلب البروفايل → isAuthenticated = true → إشعارات → Realtime
        await storeLogin(finalEmail, password);

        security.clearAttempts();
        setSuccess('تم تسجيل الدخول بنجاح! جاري التحويل...');
      } catch (err: any) {
        security.recordFailedAttempt();

        const message = err?.message || '';

        if (
          message.includes('Invalid login credentials') ||
          message.includes('invalid_credentials')
        ) {
          setError(
            security.attemptsLeft > 0
              ? `اسم المستخدم أو كلمة المرور غير صحيحة. (${security.attemptsLeft} محاولة متبقية)`
              : 'تم تجاوز الحد المسموح به من المحاولات. انتظر 5 دقائق.',
          );
        } else if (message.includes('Email not confirmed')) {
          setError('الحساب غير مفعَّل. يرجى التواصل مع مدير النظام.');
        } else if (message.includes('Too many requests')) {
          setError('محاولات كثيرة جداً — انتظر بضع دقائق ثم حاول مجدداً.');
        } else if (message.includes('User not found')) {
          setError('المستخدم غير موجود في النظام.');
        } else if (
          message.includes('network') ||
          message.includes('fetch') ||
          message.includes('Failed to fetch')
        ) {
          setError('خطأ في الاتصال — تحقق من اتصالك بالإنترنت.');
        } else if (message.includes('تعذّر تحضير الجلسة')) {
          // من setSessionContext في core/stores — رسالة جاهزة للعرض مباشرة
          setError(message);
        } else {
          setError(`خطأ غير متوقع: ${message}`);
        }
      } finally {
        setLoading(false);
      }
    },
    [username, password, storeLogin, security],
  );

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      dir="rtl"
    >
      <LoginBackground />

      {/* البطاقة الزجاجية */}
      <div className="login-glass-card relative w-full max-w-md z-10">
        {onBack && (
          <button
            onClick={onBack}
            className="group absolute -top-14 right-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-sm font-semibold transition-all"
          >
            <ArrowLeft size={16} className="group-hover:translate-x-0.5 transition-transform" />
            العودة للرئيسية
          </button>
        )}

        <div className="relative bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* الرأس */}
          <div className="px-8 pt-10 pb-7 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-[0_10px_30px_-5px_rgba(99,102,241,0.6)] mb-5 ring-1 ring-white/20">
              <ShieldCheck size={40} className="text-white" strokeWidth={1.8} />
            </div>
            <h1 className="text-2xl font-black text-white mb-1">Kyvzon Platform</h1>
            <p className="text-indigo-200/80 text-sm font-medium">منصة إدارة الموارد البشرية</p>
          </div>

          {/* جسم النموذج */}
          <div className="px-8 pb-9">
            <p className="text-white/60 text-center text-sm mb-6">
              سجّل دخولك إلى نظام إدارة الموارد البشرية
            </p>

            <LoginForm
              username={username}
              password={password}
              showPass={showPass}
              loading={loading}
              isLocked={security.isLocked}
              error={error}
              success={success}
              lockoutMinutes={security.lockoutMinutes}
              lockoutSeconds={security.lockoutSeconds}
              onUsernameChange={handleUsernameChange}
              onPasswordChange={handlePasswordChange}
              onToggleShowPass={() => setShowPass((v) => !v)}
              onSubmit={handleLogin}
            />

            {/* Dev Mode Quick Login */}
            <DevLoginModal />
          </div>
        </div>

        {/* شريط الثقة */}
        <div className="flex items-center justify-center gap-5 mt-6 text-white/50 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <Lock size={13} className="text-indigo-300" />
            مشفّر
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5">
            <Zap size={13} className="text-indigo-300" />
            سريع
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-indigo-300" />
            موثوق
          </span>
        </div>
      </div>
    </div>
  );
}
