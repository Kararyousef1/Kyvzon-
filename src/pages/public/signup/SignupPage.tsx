import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Loader2, Mail, ShieldCheck, Star } from 'lucide-react';
import { authService, publicSignupService, type PublicSignupIntentType } from '../../../services/sdk';
import '../landing/styles.css';

const COUNTRIES = ['العراق', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان', 'الأردن', 'تركيا', 'أخرى'];
const IRAQ_GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'كركوك', 'السليمانية', 'دهوك', 'ديالى', 'الأنبار', 'بابل', 'واسط', 'ميسان', 'ذي قار', 'المثنى', 'القادسية', 'صلاح الدين'];

export default function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent = (params.get('intent') || 'general') as PublicSignupIntentType;
  const plan = params.get('plan') || undefined;
  const service = params.get('service') || undefined;
  const label = params.get('label') || plan || service || 'KYVZON';

  const [step, setStep] = useState<'email' | 'otp' | 'details' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [form, setForm] = useState({
    fullName: '', password: '', phone: '', country: 'العراق', governorate: 'بغداد', companyName: '', rating: 5, reviewText: '',
  });

  const title = useMemo(() => {
    if (intent === 'plan') return `إنشاء حساب لطلب خطة ${label}`;
    if (intent === 'service') return `إنشاء حساب لطلب خدمة ${label}`;
    if (intent === 'review') return 'إنشاء حساب لإضافة تقييمك';
    return 'إنشاء حساب في KYVZON';
  }, [intent, label]);

  const update = (key: keyof typeof form, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email.includes('@')) { setError('يرجى إدخال بريد إلكتروني صحيح'); return; }
    setLoading(true);
    try { await authService.sendEmailOtp(email.trim().toLowerCase()); setStep('otp'); }
    catch (err: any) { setError(err?.message || 'تعذر إرسال رمز التحقق'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (otp.trim().length < 4) { setError('يرجى إدخال رمز صحيح'); return; }
    setLoading(true);
    try { await authService.verifyEmailOtp(email.trim().toLowerCase(), otp.trim()); setStep('details'); }
    catch (err: any) { setError(err?.message || 'رمز التحقق غير صحيح'); }
    finally { setLoading(false); }
  };

  const complete = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.fullName.trim() || form.password.length < 6 || !form.phone.trim()) {
      setError('يرجى إدخال الاسم وكلمة مرور من 6 أحرف على الأقل ورقم الهاتف'); return;
    }
    setLoading(true);
    try {
      await authService.completePublicAccount({ fullName: form.fullName.trim(), password: form.password, phone: form.phone.trim(), country: form.country, governorate: form.governorate });
      await publicSignupService.createRequest({
        email: email.trim().toLowerCase(), full_name: form.fullName.trim(), phone: form.phone.trim(), country: form.country, governorate: form.governorate,
        company_name: form.companyName.trim() || undefined, intent_type: intent, selected_plan: intent === 'plan' ? (label || plan) : undefined,
        selected_service: intent === 'service' ? (label || service) : undefined, rating: intent === 'review' ? Number(form.rating) : undefined,
        review_text: intent === 'review' ? form.reviewText.trim() : undefined, metadata: { plan, service, label, signup_page: true },
      });
      setStep('done');
    } catch (err: any) { setError(err?.message || 'تعذر إكمال التسجيل'); }
    finally { setLoading(false); }
  };

  return (
    <div className="kv-root min-h-screen flex items-center justify-center p-4 hero-grid" dir="rtl">
      <button onClick={() => navigate('/')} className="fixed top-5 right-5 z-20 btn-outline py-2 px-4"><ArrowRight size={16} /> العودة للصفحة الرئيسية</button>
      <div className="w-full max-w-2xl glass-dark rounded-3xl p-6 md:p-8 border border-white/10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-200 text-xs font-bold mb-4"><ShieldCheck size={14} /> {label}</div>
          <h1 className="text-2xl md:text-3xl font-black text-white">{step === 'done' ? 'تم إنشاء حسابك' : title}</h1>
          <p className="text-white/60 mt-2 text-sm">تحقق من بريدك بالـ OTP ثم أكمل بياناتك ليتم التواصل معك من فريق KYVZON.</p>
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        {step === 'email' && <form onSubmit={sendOtp} className="space-y-4"><Field label="البريد الإلكتروني"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="kv-modal-input" dir="ltr" placeholder="name@example.com" /></Field><Submit loading={loading}><Mail size={16}/> إرسال رمز OTP</Submit></form>}
        {step === 'otp' && <form onSubmit={verifyOtp} className="space-y-4"><Field label="رمز التحقق"><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} className="kv-modal-input text-center tracking-[0.35em]" placeholder="000000" /></Field><Submit loading={loading}>تحقق من الرمز</Submit></form>}
        {step === 'details' && <form onSubmit={complete} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="الاسم الكامل"><input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} className="kv-modal-input" /></Field>
            <Field label="كلمة المرور"><input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="kv-modal-input" /></Field>
            <Field label="رقم الهاتف"><input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="kv-modal-input" dir="ltr" /></Field>
            <Field label="اسم الشركة"><input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} className="kv-modal-input" /></Field>
            <Field label="الدولة"><select value={form.country} onChange={(e) => update('country', e.target.value)} className="kv-modal-input">{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="المحافظة"><select value={form.governorate} onChange={(e) => update('governorate', e.target.value)} className="kv-modal-input">{IRAQ_GOVERNORATES.map(g => <option key={g}>{g}</option>)}</select></Field>
          </div>
          {intent === 'review' && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"><Field label="التقييم"><div className="flex gap-1">{[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => update('rating', n)}><Star size={22} fill={n <= form.rating ? '#fbbf24' : 'transparent'} style={{ color: '#fbbf24' }} /></button>)}</div></Field><Field label="نص التقييم"><textarea value={form.reviewText} onChange={(e) => update('reviewText', e.target.value)} className="kv-modal-input min-h-[90px] resize-none" /></Field></div>}
          <Submit loading={loading}>إنشاء الحساب وحفظ الطلب</Submit>
        </form>}
        {step === 'done' && <div className="text-center py-8"><CheckCircle size={58} className="mx-auto text-emerald-400 mb-4"/><p className="text-white font-bold">تم تسجيل طلبك بنجاح. يمكنك الآن الدخول إلى بروفايلك ومتابعة بياناتك.</p><button onClick={() => navigate('/account', { replace: true })} className="btn-primary mt-6">الذهاب إلى حسابي</button></div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="block text-xs font-bold mb-1.5 text-white/65">{label}</span>{children}</label>; }
function Submit({ loading, children }: { loading: boolean; children: React.ReactNode }) { return <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">{loading && <Loader2 size={16} className="animate-spin"/>}{children}</button>; }
