import React, { useMemo, useState } from 'react';
import { CheckCircle, Loader2, Mail, ShieldCheck, Star, X } from 'lucide-react';
import { authService, publicSignupService, type PublicSignupIntentType } from '../../../services/sdk';
import { useLang } from './LangContext';

export interface LandingSignupIntent {
  type: PublicSignupIntentType;
  label?: string;
  planId?: string;
  serviceId?: string;
}

interface Props {
  intent: LandingSignupIntent | null;
  onClose: () => void;
}

const COUNTRIES = ['العراق', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان', 'الأردن', 'تركيا', 'أخرى'];
const IRAQ_GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'كركوك', 'السليمانية', 'دهوك', 'ديالى', 'الأنبار', 'بابل', 'واسط', 'ميسان', 'ذي قار', 'المثنى', 'القادسية', 'صلاح الدين'];

export function SignupIntentModal({ intent, onClose }: Props) {
  const { lang, isRTL } = useLang();
  const [step, setStep] = useState<'email' | 'otp' | 'details' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    password: '',
    phone: '',
    country: 'العراق',
    governorate: 'بغداد',
    companyName: '',
    rating: 5,
    reviewText: '',
  });

  const copy = useMemo(() => {
    if (lang === 'en') return {
      title: 'Create your KYVZON account', email: 'Email address', send: 'Send OTP', otp: 'Verification code', verify: 'Verify code',
      details: 'Complete your details', finish: 'Create account', done: 'Your request has been received', close: 'Close',
      desc: 'We will verify your email first, then collect your contact details.', password: 'Password', fullName: 'Full name', phone: 'Phone', country: 'Country', governorate: 'Governorate', company: 'Company name', review: 'Your review', rating: 'Rating',
    };
    return {
      title: 'إنشاء حساب في KYVZON', email: 'البريد الإلكتروني', send: 'إرسال رمز OTP', otp: 'رمز التحقق', verify: 'تحقق من الرمز',
      details: 'أكمل بياناتك', finish: 'إنشاء الحساب', done: 'تم استلام طلبك بنجاح', close: 'إغلاق',
      desc: 'سنرسل رمز تحقق إلى بريدك أولاً، ثم تكمل بيانات التواصل.', password: 'كلمة المرور', fullName: 'الاسم الكامل', phone: 'رقم الهاتف', country: 'الدولة', governorate: 'المحافظة', company: 'اسم الشركة', review: 'اكتب تقييمك', rating: 'التقييم',
    };
  }, [lang]);

  if (!intent) return null;

  const update = (key: keyof typeof form, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) { setError('يرجى إدخال بريد إلكتروني صحيح'); return; }
    setLoading(true);
    try {
      await authService.sendEmailOtp(email.trim().toLowerCase());
      setStep('otp');
    } catch (err: any) {
      setError(err?.message || 'تعذر إرسال رمز التحقق');
    } finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.trim().length < 4) { setError('يرجى إدخال رمز صحيح'); return; }
    setLoading(true);
    try {
      await authService.verifyEmailOtp(email.trim().toLowerCase(), otp.trim());
      setStep('details');
    } catch (err: any) {
      setError(err?.message || 'رمز التحقق غير صحيح');
    } finally { setLoading(false); }
  };

  const complete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim() || form.password.length < 6 || !form.phone.trim()) {
      setError('يرجى إدخال الاسم وكلمة مرور من 6 أحرف على الأقل ورقم الهاتف');
      return;
    }
    setLoading(true);
    try {
      await authService.completePublicAccount({
        fullName: form.fullName.trim(),
        password: form.password,
        phone: form.phone.trim(),
        country: form.country,
        governorate: form.governorate,
      });
      await publicSignupService.createRequest({
        email: email.trim().toLowerCase(),
        full_name: form.fullName.trim(),
        phone: form.phone.trim(),
        country: form.country,
        governorate: form.governorate,
        company_name: form.companyName.trim() || undefined,
        intent_type: intent.type,
        selected_plan: intent.type === 'plan' ? (intent.label || intent.planId) : undefined,
        selected_service: intent.type === 'service' ? (intent.label || intent.serviceId) : undefined,
        rating: intent.type === 'review' ? Number(form.rating) : undefined,
        review_text: intent.type === 'review' ? form.reviewText.trim() : undefined,
        metadata: { intent_label: intent.label, plan_id: intent.planId, service_id: intent.serviceId, language: lang },
      });
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'تعذر إكمال التسجيل');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={loading ? undefined : onClose} />
      <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#10142a] shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-200 text-xs font-bold mb-3">
              <ShieldCheck size={14} /> {intent.label || 'KYVZON'}
            </div>
            <h3 className="text-white text-xl font-black">{step === 'done' ? copy.done : copy.title}</h3>
            <p className="text-sm mt-1" style={{ color: 'rgba(200,210,255,.68)' }}>{copy.desc}</p>
          </div>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

          {step === 'email' && (
            <form onSubmit={sendOtp} className="space-y-4">
              <Field label={copy.email}><MailInput value={email} onChange={setEmail} /></Field>
              <SubmitButton loading={loading}>{copy.send}</SubmitButton>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <Field label={copy.otp}><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} className="kv-modal-input text-center tracking-[0.35em]" placeholder="000000" /></Field>
              <SubmitButton loading={loading}>{copy.verify}</SubmitButton>
            </form>
          )}

          {step === 'details' && (
            <form onSubmit={complete} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label={copy.fullName}><input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} className="kv-modal-input" /></Field>
                <Field label={copy.password}><input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="kv-modal-input" /></Field>
                <Field label={copy.phone}><input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="kv-modal-input" dir="ltr" /></Field>
                <Field label={copy.company}><input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} className="kv-modal-input" /></Field>
                <Field label={copy.country}><select value={form.country} onChange={(e) => update('country', e.target.value)} className="kv-modal-input">{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></Field>
                <Field label={copy.governorate}><select value={form.governorate} onChange={(e) => update('governorate', e.target.value)} className="kv-modal-input">{IRAQ_GOVERNORATES.map(g => <option key={g}>{g}</option>)}</select></Field>
              </div>
              {intent.type === 'review' && (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <Field label={copy.rating}>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => update('rating', n)}><Star size={22} fill={n <= form.rating ? '#fbbf24' : 'transparent'} style={{ color: '#fbbf24' }} /></button>)}
                    </div>
                  </Field>
                  <Field label={copy.review}><textarea value={form.reviewText} onChange={(e) => update('reviewText', e.target.value)} className="kv-modal-input min-h-[90px] resize-none" /></Field>
                </div>
              )}
              <SubmitButton loading={loading}>{copy.finish}</SubmitButton>
            </form>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <CheckCircle size={54} className="mx-auto text-emerald-400 mb-4" />
              <p className="text-white font-bold">تم إنشاء حسابك وتسجيل طلبك. سيتواصل معك فريق KYVZON قريبًا.</p>
              <button onClick={onClose} className="btn-primary mt-6">{copy.close}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold mb-1.5 text-white/65">{label}</span>{children}</label>;
}

function MailInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="email" value={value} onChange={(e) => onChange(e.target.value)} className="kv-modal-input" placeholder="name@example.com" dir="ltr" />;
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">{loading && <Loader2 size={16} className="animate-spin" />} {children}</button>;
}
