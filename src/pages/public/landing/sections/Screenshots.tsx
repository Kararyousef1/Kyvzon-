import React, { useState } from 'react';
import { TrendingUp, Plus, Search, Bell, Clock, CheckCircle2 } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { BrowserFrame, PhoneFrame } from '../ui/DeviceFrame';
import { SCREENSHOT_TABS } from '../data';
import { DAY_LABELS, WEEKLY_ATTENDANCE, KPI_CARDS, HR_EMPLOYEES, ANALYTICS_TREND } from '../mockupData';
import type { ScreenshotId } from '../types';

/** حلقة تقدّم دائرية بسيطة (conic-gradient) لعرض نِسَب — بدون أي مكتبة رسوم بيانية */
function RingProgress({ pct, color, size = 76, label }: { pct: number; color: string; size?: number; label: string }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(${color} ${pct * 3.6}deg, var(--kv-border) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size - 14, height: size - 14, borderRadius: '50%', background: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        }}
      >
        <span className="font-black" style={{ fontSize: '0.85rem', color: 'var(--kv-text-hi)' }}>{pct}%</span>
        <span style={{ fontSize: '0.5rem', color: 'var(--kv-text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}

function TrendLine({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${40 - (v / max) * 36}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 90 }}>
      <defs>
        <linearGradient id="kvTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,40 ${points} 100,40`} fill="url(#kvTrendFill)" stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Screenshots() {
  const { lang, t } = useLang();
  const [active, setActive] = useState<ScreenshotId>('dashboard');

  return (
    <section id="screenshots" className="relative" style={{ backgroundColor: 'var(--kv-bg-alt)', paddingBlock: 'var(--kv-section-y)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-sky-400/[0.06] blur-[130px]" />
      </div>
      <div className="relative max-w-6xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-12">
          <div className="section-label">{t('screens_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black mt-2">{t('screens_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)', maxWidth: '34rem', margin: '16px auto 0' }}>{t('screens_sub')}</p>
        </Reveal>

        {/* Tabs */}
        <Reveal delay={0.05}>
          <div className="flex flex-wrap justify-center gap-2.5 mb-10">
            {SCREENSHOT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActive(tab.id)}
                  className="chip"
                  style={isActive ? { color: tab.color, borderColor: `${tab.color}55`, background: `${tab.color}18` } : undefined}
                  aria-pressed={isActive}
                >
                  <Icon size={14} />
                  {tab.label[lang]}
                </button>
              );
            })}
          </div>
        </Reveal>

        {/* Screen content */}
        <div key={active} className="anim-fade-up">
          {active === 'mobile' ? (
            <PhoneFrame>
              <div style={{ padding: '30px 16px 20px' }}>
                <div className="font-black text-sm mb-0.5" style={{ color: "var(--kv-text-hi)" }}>
                  {lang === 'ar' ? 'مرحباً، سارة' : lang === 'en' ? 'Hi, Sarah' : 'سڵاو، سارا'}
                </div>
                <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.65rem', marginBottom: 14 }}>
                  {lang === 'ar' ? 'الثلاثاء، ٩ صباحاً' : lang === 'en' ? 'Tuesday, 9:00 AM' : 'سێشەممە، ٩ی بەیانی'}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {KPI_CARDS.slice(0, 2).map((k, i) => (
                    <div key={i} className="mockup-kpi">
                      <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.55rem', marginBottom: 4 }}>{k.label[lang]}</div>
                      <div className="font-black" style={{ fontSize: '0.95rem', color: 'var(--kv-text-hi)' }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mockup-kpi">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell size={11} style={{ color: 'var(--kv-accent-1)' }} />
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--kv-text-body)' }}>
                      {lang === 'ar' ? 'إشعارات' : lang === 'en' ? 'Notifications' : 'ئاگادارکردنەوە'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="mockup-row" style={{ padding: '6px 8px' }}>
                        <CheckCircle2 size={12} style={{ color: '#34d399', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.6rem', color: 'var(--kv-text-muted)' }}>
                          {lang === 'ar' ? 'تمت الموافقة على طلبك' : lang === 'en' ? 'Your request was approved' : 'داواکارییەکەت پەسەندکرا'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PhoneFrame>
          ) : (
            <BrowserFrame url={`app.kyvzon.com/${active}`}>
              <div style={{ padding: 22, background: '#fbfcfe', minHeight: 340 }}>
                {active === 'dashboard' && (
                  <div>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {KPI_CARDS.map((k, i) => (
                        <div key={i} className="mockup-kpi">
                          <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.68rem', marginBottom: 6 }}>{k.label[lang]}</div>
                          <div className="font-black" style={{ fontSize: '1.3rem', color: 'var(--kv-text-hi)' }}>{k.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 mockup-kpi" style={{ padding: 16 }}>
                        <div className="flex items-center justify-between mb-3">
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--kv-text-body)' }}>
                            {lang === 'ar' ? 'الحضور الأسبوعي' : lang === 'en' ? 'Weekly Attendance' : 'ئامادەبوونی هەفتانە'}
                          </span>
                          <TrendingUp size={13} style={{ color: 'var(--kv-accent-1)' }} />
                        </div>
                        <div className="flex items-end justify-between gap-2" style={{ height: 90 }}>
                          {WEEKLY_ATTENDANCE.map((h, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                              <div className="mockup-bar w-full" style={{ height: `${h * 0.85}px`, background: i === 3 ? 'linear-gradient(180deg, #0c8de7, #0c8de7)' : 'rgba(12,141,231,0.25)' }} />
                              <span style={{ fontSize: '0.6rem', color: 'var(--kv-text-muted)' }}>{DAY_LABELS[lang][i]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mockup-kpi flex flex-col items-center justify-center gap-2" style={{ padding: 16 }}>
                        <RingProgress pct={72} color="var(--kv-accent-1)" label={lang === 'ar' ? 'الإنجاز' : lang === 'en' ? 'Completion' : 'تەواوبوون'} />
                        <span style={{ fontSize: '0.65rem', color: 'var(--kv-text-muted)', textAlign: 'center' }}>
                          {lang === 'ar' ? 'مهام هذا الأسبوع' : lang === 'en' ? "This week's tasks" : 'ئەرکەکانی ئەم هەفتەیە'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {active === 'hr' && (
                  <div>
                    <div className="flex items-center justify-between mb-4 gap-3">
                      <div className="flex items-center gap-2 mockup-kpi" style={{ padding: '8px 12px', flex: 1 }}>
                        <Search size={12} style={{ color: 'var(--kv-text-muted)' }} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--kv-text-faint)' }}>
                          {lang === 'ar' ? 'ابحث عن موظف...' : lang === 'en' ? 'Search employees...' : 'گەڕان بۆ کارمەند...'}
                        </span>
                      </div>
                      <div className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.72rem' }}>
                        <Plus size={12} />
                        {lang === 'ar' ? 'موظف جديد' : lang === 'en' ? 'New Employee' : 'کارمەندی نوێ'}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {HR_EMPLOYEES.map((e, i) => (
                        <div key={i} className="mockup-row" style={{ background: 'var(--kv-bg-alt)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: 8, background: `${e.color}25`, color: e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>
                            {e.initials}
                          </div>
                          <div className="flex-1">
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--kv-text-hi)' }}>{e.name}</div>
                            <div style={{ fontSize: '0.62rem', color: 'var(--kv-text-muted)' }}>{e.dept[lang]}</div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.6rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                              background: e.status === 'active' ? 'rgba(52,211,153,0.15)' : 'rgba(245,158,11,0.15)',
                              color: e.status === 'active' ? '#34d399' : '#fbbf24',
                            }}
                          >
                            {e.status === 'active'
                              ? (lang === 'ar' ? 'نشط' : lang === 'en' ? 'Active' : 'چالاک')
                              : (lang === 'ar' ? 'إجازة' : lang === 'en' ? 'On leave' : 'مۆڵەت')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {active === 'employee' && (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="mockup-kpi flex flex-col items-center justify-center gap-3 text-center" style={{ padding: 18 }}>
                      <Clock size={20} style={{ color: 'var(--kv-accent-1)' }} />
                      <div>
                        <div className="font-black" style={{ fontSize: '0.95rem', color: 'var(--kv-text-hi)' }}>09:02</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--kv-text-muted)' }}>
                          {lang === 'ar' ? 'وقت الدخول اليوم' : lang === 'en' ? "Today's check-in" : 'کاتی چوونە ژوورەوە'}
                        </div>
                      </div>
                      <div className="btn-primary" style={{ padding: '6px 16px', fontSize: '0.68rem' }}>
                        {lang === 'ar' ? 'تسجيل انصراف' : lang === 'en' ? 'Check Out' : 'دەرچوون'}
                      </div>
                    </div>
                    <div className="mockup-kpi flex flex-col items-center justify-center gap-2" style={{ padding: 18 }}>
                      <RingProgress pct={40} color="#f59e0b" label={lang === 'ar' ? 'إجازة' : lang === 'en' ? 'Leave' : 'مۆڵەت'} />
                      <span style={{ fontSize: '0.65rem', color: 'var(--kv-text-muted)' }}>
                        {lang === 'ar' ? '٨ من ٢٠ يوماً مستخدمة' : lang === 'en' ? '8 of 20 days used' : '٨ لە ٢٠ ڕۆژ بەکارهاتوو'}
                      </span>
                    </div>
                    <div className="mockup-kpi" style={{ padding: 18 }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--kv-text-body)', marginBottom: 10 }}>
                        {lang === 'ar' ? 'كشف الراتب — يونيو' : lang === 'en' ? 'Payslip — June' : 'پسوولە — حوزەیران'}
                      </div>
                      <div className="flex justify-between mb-1.5" style={{ fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--kv-text-muted)' }}>{lang === 'ar' ? 'الأساسي' : lang === 'en' ? 'Base' : 'بنەڕەت'}</span>
                        <span className="font-bold" style={{ color: 'var(--kv-text-hi)' }}>1,450,000</span>
                      </div>
                      <div className="flex justify-between" style={{ fontSize: '0.65rem' }}>
                        <span style={{ color: 'var(--kv-text-muted)' }}>{lang === 'ar' ? 'البدلات' : lang === 'en' ? 'Allowances' : 'زیادکراوەکان'}</span>
                        <span className="font-bold" style={{ color: 'var(--kv-text-hi)' }}>220,000</span>
                      </div>
                    </div>
                  </div>
                )}

                {active === 'analytics' && (
                  <div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { l: { ar: 'الإيرادات', en: 'Revenue', ku: 'داهات' }, v: '+24%' },
                        { l: { ar: 'التكاليف', en: 'Costs', ku: 'تێچوون' }, v: '-8%' },
                        { l: { ar: 'الإنتاجية', en: 'Productivity', ku: 'بەرهەمهێنان' }, v: '+18%' },
                      ].map((k, i) => (
                        <div key={i} className="mockup-kpi">
                          <div style={{ fontSize: '0.65rem', color: 'var(--kv-text-muted)', marginBottom: 4 }}>{k.l[lang]}</div>
                          <div className="font-black" style={{ fontSize: '1.1rem', color: '#34d399' }}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mockup-kpi" style={{ padding: '16px 16px 6px' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--kv-text-body)' }}>
                          {lang === 'ar' ? 'اتجاه الأداء العام — آخر ١٠ أسابيع' : lang === 'en' ? 'Overall Trend — Last 10 Weeks' : 'ئاڕاستەی گشتی — ١٠ هەفتەی ڕابردوو'}
                        </span>
                      </div>
                      <TrendLine data={ANALYTICS_TREND} color="#0c8de7" />
                    </div>
                  </div>
                )}
              </div>
            </BrowserFrame>
          )}
        </div>
      </div>
    </section>
  );
}
