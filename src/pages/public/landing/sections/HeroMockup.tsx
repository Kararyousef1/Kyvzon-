import React from 'react';
import { TrendingUp, Bell, Search, Users, Clock, CheckCircle2, BarChart3 } from 'lucide-react';
import { useLang } from '../LangContext';

/**
 * HeroMockup — لوحة تحكم توضيحية بثيم فاتح داخل إطار جهاز أنيق.
 * مبنية بالكامل بـ CSS لضمان الاتساق مع هوية KYVZON. (الصور الحقيقية تُدار
 * لاحقاً من بوابة المطوّر — صفحة إدارة الزوّار.)
 */
export function HeroMockup() {
  const { lang } = useLang();

  const kpis = [
    { icon: Users, label: { ar: 'الموظفون', en: 'Employees', ku: 'کارمەند' }, value: '248', delta: '+3.2%', color: '#1466d8' },
    { icon: CheckCircle2, label: { ar: 'الحضور اليوم', en: 'Attendance', ku: 'ئامادەبوون' }, value: '96%', delta: '+1.1%', color: '#16a34a' },
    { icon: Clock, label: { ar: 'طلبات معلّقة', en: 'Pending', ku: 'چاوەڕوان' }, value: '12', delta: '-4', color: '#ea580c' },
  ];
  const bars = [42, 58, 50, 74, 63, 80, 55];

  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      {/* هالة خلفية ناعمة */}
      <div className="kv-glow-orb" style={{ inset: '-8% -6% auto auto', width: '55%', height: '55%', background: 'rgba(56,166,240,0.25)' }} aria-hidden="true" />

      <div className="kv-device relative anim-float">
        {/* شريط المتصفح */}
        <div className="kv-device-bar">
          <span className="kv-device-dot" style={{ background: '#ef4444' }} />
          <span className="kv-device-dot" style={{ background: '#f59e0b' }} />
          <span className="kv-device-dot" style={{ background: '#22c55e' }} />
          <div className="flex-1 mx-3">
            <div style={{ background: '#fff', border: '1px solid var(--kv-border)', borderRadius: 8, padding: '4px 10px', fontSize: '0.65rem', color: 'var(--kv-text-muted)', textAlign: 'center', direction: 'ltr' }}>
              app.kyvzon.com/dashboard
            </div>
          </div>
        </div>

        {/* جسم اللوحة (فاتح) */}
        <div style={{ padding: 18, background: '#fbfcfe' }}>
          {/* رأس */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div style={{ color: 'var(--kv-text-hi)', fontWeight: 800, fontSize: '0.9rem' }}>
                {lang === 'ar' ? 'مرحباً، عمر 👋' : lang === 'en' ? 'Welcome, Omar 👋' : 'بەخێربێیت 👋'}
              </div>
              <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.7rem', marginTop: 2 }}>
                {lang === 'ar' ? 'إليك ملخص اليوم' : lang === 'en' ? "Today's summary" : 'کورتەی ئەمڕۆ'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: 'var(--kv-accent-soft)', color: 'var(--kv-accent-2)', fontSize: '0.62rem', fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: '#16a34a' }} />
                {lang === 'ar' ? 'مباشر' : lang === 'en' ? 'Live' : 'ڕاستەوخۆ'}
              </span>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', border: '1px solid var(--kv-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={12} style={{ color: 'var(--kv-text-muted)' }} />
              </div>
            </div>
          </div>

          {/* بحث */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--kv-border)', borderRadius: 10, padding: '8px 12px', marginBottom: 14 }}>
            <Search size={13} style={{ color: 'var(--kv-text-faint)' }} />
            <span style={{ fontSize: '0.7rem', color: 'var(--kv-text-faint)' }}>
              {lang === 'ar' ? 'ابحث عن موظف، تقرير، طلب…' : lang === 'en' ? 'Search…' : 'گەڕان…'}
            </span>
          </div>

          {/* بطاقات KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
            {kpis.map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid var(--kv-border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `${k.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <Icon size={13} style={{ color: k.color }} />
                  </div>
                  <div style={{ color: 'var(--kv-text-hi)', fontWeight: 900, fontSize: '1.05rem', lineHeight: 1 }}>{k.value}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ color: 'var(--kv-text-muted)', fontSize: '0.55rem' }}>{k.label[lang]}</span>
                    <span style={{ color: k.delta.startsWith('-') ? '#dc2626' : '#16a34a', fontSize: '0.55rem', fontWeight: 700 }}>{k.delta}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* رسم بياني + قائمة */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div style={{ background: '#fff', border: '1px solid var(--kv-border)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <BarChart3 size={12} style={{ color: 'var(--kv-accent-1)' }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--kv-text-hi)' }}>
                  {lang === 'ar' ? 'الحضور الأسبوعي' : lang === 'en' ? 'Weekly attendance' : 'ئامادەبوونی هەفتانە'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
                {bars.map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '4px 4px 0 0', background: i === 5 ? 'var(--kv-accent-1)' : 'var(--kv-accent-soft)' }} />
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid var(--kv-border)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <TrendingUp size={12} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--kv-text-hi)' }}>
                  {lang === 'ar' ? 'النشاط' : lang === 'en' ? 'Activity' : 'چالاکی'}
                </span>
              </div>
              {[1, 2, 3].map((r) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--kv-bg-alt)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--kv-border)', width: `${90 - r * 12}%`, marginBottom: 4 }} />
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--kv-border-soft)', width: `${60 - r * 8}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
