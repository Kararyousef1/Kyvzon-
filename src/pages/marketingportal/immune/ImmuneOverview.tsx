/**
 * ImmuneOverview — نظرة عامة: مخطط الطبقة الحاكمة + جدول الخصم/الشحن + الدَّين التسويقي + عتبات القرار.
 */
import { Scale, AlertOctagon, TrendingUp } from 'lucide-react';
import { POINTS_TABLE, STATUS_LABEL } from '../../../services/sdk';
import { useDebt, useBalances } from './useImmune';

const THRESHOLDS = [
  { range: '800-1000', status: 'healthy', decision: 'كل الأنظمة تعمل بحرية كاملة' },
  { range: '500-799', status: 'good', decision: 'تباعد إلزامي 24-48 ساعة بين رسالتين' },
  { range: '300-499', status: 'warning', decision: 'تشغيلي فقط (فواتير/دعم/أمان)' },
  { range: '150-299', status: 'danger', decision: 'تعليق الحملات + تنبيه موظف' },
  { range: '<150', status: 'critical', decision: 'تعليق تام + تصعيد لمدير النجاح' },
];
const TH_COLOR: Record<string, string> = {
  healthy: 'border-emerald-200 bg-emerald-50/50', good: 'border-sky-200 bg-sky-50/50',
  warning: 'border-amber-200 bg-amber-50/50', danger: 'border-orange-200 bg-orange-50/50', critical: 'border-rose-200 bg-rose-50/50',
};

export default function ImmuneOverview() {
  const { data: debt, loading } = useDebt();
  const { data: balances } = useBalances();
  const avg = balances.length ? Math.round(balances.reduce((s, b) => s + b.balance, 0) / balances.length) : 1000;

  return (
    <div className="space-y-6">
      {/* المفهوم */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Scale size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">الطبقة الحاكمة فوق الوحدات الست</h2></div>
        <p className="text-xs text-slate-500 mb-4">قبل أي إرسال، يسأل النظام: هل تستحق هذه الرسالة أن تصل الآن، من هذه القناة، لهذا العميل؟</p>
        <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 text-center">
          <p className="text-sm font-bold text-fuchsia-700">نظام المناعة العلائقية</p>
          <p className="text-[11px] text-slate-500 mt-1">↕ نقطة تفتيش واحدة ↕</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-[11px]">
            {['أتمتة', 'بريد', 'وسائل تواصل', 'SMS/واتساب', 'فعاليات', 'استبيانات'].map((s) => (
              <div key={s} className="rounded-lg bg-white border border-slate-100 py-2 text-slate-600 font-semibold">{s}</div>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{balances.length}</p><p className="text-xs text-slate-500">عملاء مُراقَبون</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{avg}</p><p className="text-xs text-slate-500">متوسط الرصيد</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><TrendingUp size={16} /></div><p className="text-2xl font-black text-slate-800 mt-2">{loading ? '…' : debt.netDebt.toLocaleString()}</p><p className="text-xs text-slate-500">الدَّين التسويقي (90 يوم)</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{loading ? '…' : debt.totalCredit.toLocaleString()}</p><p className="text-xs text-slate-500">نقاط مُستردّة (شحن)</p></div>
      </div>

      {debt.netDebt > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 flex items-center gap-2">
          <AlertOctagon size={15} /> إنذار مبكر: تاريخياً، ارتفاع الدَّين التسويقي يسبق ارتفاع معدل إلغاء الاشتراك بفارق 4-6 أسابيع.
        </div>
      )}

      {/* عتبات القرار */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-4">عتبات القرار التلقائي</h2>
        <div className="space-y-2">
          {THRESHOLDS.map((t) => (
            <div key={t.range} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${TH_COLOR[t.status]}`}>
              <span className="font-black text-slate-800 text-sm w-24">{t.range}</span>
              <span className="text-xs font-bold text-slate-600 w-28">{STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]}</span>
              <span className="text-[11px] text-slate-500 flex-1 text-left">{t.decision}</span>
            </div>
          ))}
        </div>
      </section>

      {/* جداول النقاط */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-800 mb-3">جدول الخصم (تكلفة كل تواصل)</h2>
          <div className="space-y-1.5">
            {POINTS_TABLE.debits.map((d) => (
              <div key={d.key} className="flex items-center justify-between text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50"><span className="text-slate-600">{d.label}</span><span className="text-rose-500 font-bold">−{d.pts}</span></div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-800 mb-3">جدول الشحن (كل تفاعل إيجابي)</h2>
          <div className="space-y-1.5">
            {POINTS_TABLE.credits.map((c) => (
              <div key={c.key} className="flex items-center justify-between text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50"><span className="text-slate-600">{c.label}</span><span className="text-emerald-600 font-bold">+{c.pts}</span></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
