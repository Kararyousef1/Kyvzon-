import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Loader2, Mail, ShieldCheck, Star, Eye, EyeOff, Lock, User, Phone, Building2, KeyRound, Sparkles, Zap, Globe } from 'lucide-react';
import { authService, publicSignupService, type PublicSignupIntentType } from '../../../services/sdk';
import '../landing/styles.css';

const COUNTRIES = ['العراق', 'السعودية', 'الإمارات', 'الكويت', 'قطر', 'البحرين', 'عُمان', 'الأردن', 'تركيا', 'أخرى'];
const IRAQ_GOVERNORATES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'كركوك', 'السليمانية', 'دهوك', 'ديالى', 'الأنبار', 'بابل', 'واسط', 'ميسان', 'ذي قار', 'المثنى', 'القادسية', 'صلاح الدين'];

/** مزايا تُعرض في لوحة العلامة التجارية */
const BRAND_POINTS = [
  { icon: Zap, title: 'إعداد خلال أقل من ٢٤ ساعة', desc: 'ابدأ العمل فوراً مع دعم كامل من فريقنا' },
  { icon: ShieldCheck, title: 'بياناتك مشفّرة وآمنة', desc: 'تشفير كامل ومراقبة على مدار الساعة' },
  { icon: Globe, title: '٣ لغات مدعومة بالكامل', desc: 'العربية والإنجليزية والكردية بواجهة واحدة' },
];

const STEPS = [
  { id: 'email', label: 'البريد' },
  { id: 'otp', label: 'التحقق' },
  { id: 'details', label: 'البيانات' },
  { id: 'done', label: 'تم' },
] as const;

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
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: '', password: '', phone: '', country: 'العراق', governorate: 'بغداد', companyName: '', rating: 5, reviewText: '',
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

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
    <div className="kv-root min-h-screen flex" dir="rtl">
      {/* ════ لوحة العلامة التجارية (تختفي على الموبايل) ════ */}
      <aside className="hidden lg:flex lg:w-[44%] relative overflow-hidden flex-col justify-between p-12" style={{ background: 'var(--kv-bg-deep)' }}>
        {/* أورورا متحركة */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="anim-aurora absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[110px]" />
          <div className="anim-aurora absolute -bottom-40 -right-20 w-[450px] h-[450px] rounded-full bg-violet-600/15 blur-[100px]" style={{ animationDelay: '-6s' }} />
          <div className="anim-aurora absolute top-1/2 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-[90px]" style={{ animationDelay: '-3s' }} />
          <div className="absolute inset-0 hero-grid opacity-25" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 rounded-2xl blur-md opacity-60" style={{ background: 'linear-gradient(135deg, #6366f1, #22d3ee)' }} aria-hidden="true" />
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/40">K</div>
          </div>
          <span className="text-2xl font-black text-white">KYVZON<span className="kv-gradient-text">.</span></span>
        </div>

        {/* Copy */}
        <div className="relative max-w-md">
          <h2 className="text-3xl xl:text-4xl font-black text-white leading-snug mb-4">
            انضم إلى منصة
            <span className="kv-gradient-text"> ERP </span>
            الأحدث في العراق
          </h2>
          <p style={{ color: 'var(--kv-text-body)', lineHeight: 1.85, fontSize: '1rem' }}>
            حساب واحد يفتح لك كل بوابات KYVZON — إدارة الموظفين، الموارد البشرية، الحركة، والتحليلات.
          </p>

          <div className="mt-10 space-y-4">
            {BRAND_POINTS.map((p, i) => (
              <div key={i} className="flex items-start gap-3.5 rounded-2xl p-4 anim-fade-up" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(148,163,255,0.12)', backdropFilter: 'blur(10px)', animationDelay: `${0.15 + i * 0.12}s` }}>
                <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(34,211,238,0.12))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}>
                  <p.icon size={17} style={{ color: '#a5b4fc' }} />
                </div>
                <div>
                  <div className="text-sm font-black text-white">{p.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(180,195,255,0.55)', marginTop: 3 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trust row */}
        <div className="relative flex items-center gap-2 text-xs font-bold" style={{ color: 'rgba(180,195,255,0.45)' }}>
          <ShieldCheck size={14} style={{ color: '#22d3ee' }} />
          بياناتك محمية بالتشفير الكامل · 🇮🇶 صُنع بفخر في العراق
        </div>
      </aside>

      {/* ════ لوحة النموذج ════ */}
      <main className="flex-1 relative flex items-center justify-center p-4 sm:p-8 hero-grid">
        <button onClick={() => navigate('/')} className="absolute top-5 right-5 z-20 btn-outline py-2 px-4 text-sm">
          <ArrowRight size={15} /> العودة للرئيسية
        </button>

        <div className="w-full max-w-lg">
          {/* مؤشر الخطوات */}
          {step !== 'done' && (
            <div className="flex items-center justify-center gap-0 mb-8 anim-fade-up">
              {STEPS.slice(0, 3).map((s, i) => (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all duration-500"
                      style={{
                        background: i < stepIndex ? 'linear-gradient(135deg, #10b981, #059669)' : i === stepIndex ? 'var(--kv-accent-grad)' : 'rgba(255,255,255,0.06)',
                        color: i <= stepIndex ? '#fff' : 'rgba(255,255,255,0.35)',
                        boxShadow: i === stepIndex ? '0 0 22px rgba(99,102,241,0.55)' : 'none',
                        border: i <= stepIndex ? '1px solid transparent' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      {i < stepIndex ? <CheckCircle size={16} /> : i + 1}
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: i === stepIndex ? '#a5b4fc' : 'rgba(255,255,255,0.35)' }}>{s.label}</span>
                  </div>
                  {i < 2 && (
                    <div className="w-14 sm:w-20 h-0.5 mx-1 mb-5 rounded-full transition-all duration-500" style={{ background: i < stepIndex ? 'linear-gradient(90deg, #10b981, #6366f1)' : 'rgba(255,255,255,0.08)' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* البطاقة */}
          <div
            className="rounded-[28px] p-6 sm:p-9 anim-fade-up-1"
            style={{
              background: 'linear-gradient(rgba(13,16,36,0.88), rgba(13,16,36,0.88)) padding-box, linear-gradient(160deg, rgba(129,140,248,0.45), rgba(148,163,255,0.08) 45%, rgba(34,211,238,0.25)) border-box',
              border: '1px solid transparent',
              boxShadow: '0 40px 100px -30px rgba(0,0,0,0.8), 0 0 60px -20px rgba(99,102,241,0.25)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="text-center mb-7">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold mb-4" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(34,211,238,0.1))', border: '1px solid rgba(129,140,248,0.4)', color: '#c7d2fe' }}>
                <Sparkles size={13} /> {label}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-snug">{step === 'done' ? 'تم إنشاء حسابك 🎉' : title}</h1>
              <p className="text-white/55 mt-2.5 text-sm leading-relaxed">
                {step === 'email' && 'أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق فوري'}
                {step === 'otp' && <>أدخل الرمز المرسل إلى <span className="font-bold text-indigo-300" dir="ltr">{email}</span></>}
                {step === 'details' && 'خطوة أخيرة — أكمل بياناتك ليتواصل معك فريق KYVZON'}
                {step === 'done' && 'يمكنك الآن الدخول إلى بروفايلك ومتابعة طلبك'}
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> {error}
              </div>
            )}

            {step === 'email' && (
              <form onSubmit={sendOtp} className="space-y-5">
                <Field label="البريد الإلكتروني" icon={<Mail size={15} />}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="kv-modal-input pr-11" dir="ltr" placeholder="name@example.com" autoFocus />
                </Field>
                <Submit loading={loading}><Mail size={16} /> إرسال رمز التحقق</Submit>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={verifyOtp} className="space-y-5">
                <Field label="رمز التحقق" icon={<KeyRound size={15} />}>
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} className="kv-modal-input text-center tracking-[0.45em] text-lg font-black pr-11" placeholder="000000" inputMode="numeric" autoFocus />
                </Field>
                <Submit loading={loading}>تحقق من الرمز</Submit>
                <button type="button" onClick={() => setStep('email')} className="w-full text-center text-xs font-bold text-white/40 hover:text-indigo-300 transition-colors">
                  تغيير البريد الإلكتروني
                </button>
              </form>
            )}

            {step === 'details' && (
              <form onSubmit={complete} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-3.5">
                  <Field label="الاسم الكامل" icon={<User size={15} />}>
                    <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} className="kv-modal-input pr-11" autoFocus />
                  </Field>
                  <Field label="كلمة المرور" icon={<Lock size={15} />}>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update('password', e.target.value)} className="kv-modal-input pr-11 pl-11" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors" aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="رقم الهاتف" icon={<Phone size={15} />}>
                    <input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="kv-modal-input pr-11" dir="ltr" placeholder="+964 7xx xxx xxxx" />
                  </Field>
                  <Field label="اسم الشركة (اختياري)" icon={<Building2 size={15} />}>
                    <input value={form.companyName} onChange={(e) => update('companyName', e.target.value)} className="kv-modal-input pr-11" />
                  </Field>
                  <Field label="الدولة">
                    <select value={form.country} onChange={(e) => update('country', e.target.value)} className="kv-modal-input">{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>
                  </Field>
                  <Field label="المحافظة">
                    <select value={form.governorate} onChange={(e) => update('governorate', e.target.value)} className="kv-modal-input">{IRAQ_GOVERNORATES.map(g => <option key={g}>{g}</option>)}</select>
                  </Field>
                </div>

                {intent === 'review' && (
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <Field label="التقييم">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} type="button" onClick={() => update('rating', n)} className="transition-transform hover:scale-125">
                            <Star size={24} fill={n <= form.rating ? '#fbbf24' : 'transparent'} style={{ color: '#fbbf24', filter: n <= form.rating ? 'drop-shadow(0 0 6px rgba(251,191,36,0.5))' : 'none' }} />
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="نص التقييم">
                      <textarea value={form.reviewText} onChange={(e) => update('reviewText', e.target.value)} className="kv-modal-input min-h-[90px] resize-none" />
                    </Field>
                  </div>
                )}
                <Submit loading={loading}>إنشاء الحساب وحفظ الطلب</Submit>
              </form>
            )}

            {step === 'done' && (
              <div className="text-center py-6">
                <div className="relative inline-block mb-5">
                  <div className="absolute -inset-3 rounded-full bg-emerald-500/25 blur-xl anim-pulse2" aria-hidden="true" />
                  <CheckCircle size={62} className="relative text-emerald-400" />
                </div>
                <p className="text-white font-bold leading-relaxed">تم تسجيل طلبك بنجاح. يمكنك الآن الدخول إلى بروفايلك ومتابعة بياناتك.</p>
                <button onClick={() => navigate('/account', { replace: true })} className="btn-primary mt-7 mx-auto">الذهاب إلى حسابي</button>
              </div>
            )}
          </div>

          {/* شريط ثقة أسفل البطاقة */}
          {step !== 'done' && (
            <p className="text-center mt-5 text-[11px] font-bold anim-fade-up-2" style={{ color: 'rgba(180,195,255,0.35)' }}>
              🔒 اتصال مشفّر — لن نشارك بياناتك مع أي طرف ثالث
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold mb-1.5 text-white/65">{label}</span>
      <span className="relative block">
        {icon && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-300/60 pointer-events-none z-10">{icon}</span>}
        {children}
      </span>
    </label>
  );
}

function Submit({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
      {loading && <Loader2 size={16} className="animate-spin" />}{children}
    </button>
  );
}
