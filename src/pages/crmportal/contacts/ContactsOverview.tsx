/**
 * ContactsOverview — نظرة عامة على الوحدة 1: مؤشرات + شرح المفاهيم من التقرير.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, Flame, GitMerge, Sparkles, ShieldCheck } from 'lucide-react';
import { useAccounts, useContactsList } from './useContacts';
import { ACCOUNT_TYPE_LABEL, DECISION_ROLE_LABEL } from '../../../services/sdk';
import { CRM_BASE } from '../crmCatalog';

export default function ContactsOverview() {
  const { data: accounts, loading: aLoad } = useAccounts();
  const { data: contacts, loading: cLoad } = useContactsList();

  const stats = useMemo(() => {
    const customers = accounts.filter((a) => a.account_type === 'customer').length;
    const hot = contacts.filter((c) => c.temperature === 'hot').length;
    const decisionMakers = contacts.filter((c) => c.decision_role === 'decision_maker').length;
    const totalLtv = accounts.reduce((s, a) => s + Number(a.lifetime_value || 0), 0);
    return { customers, hot, decisionMakers, totalLtv };
  }, [accounts, contacts]);

  const cards = [
    { label: 'الحسابات (الشركات)', value: accounts.length, sub: `${stats.customers} عميل فعلي`, icon: Building2, color: 'text-cyan-600 bg-cyan-50', to: `${CRM_BASE}/contacts/accounts` },
    { label: 'جهات الاتصال (الأشخاص)', value: contacts.length, sub: `${stats.decisionMakers} صاحب قرار`, icon: Users, color: 'text-blue-600 bg-blue-50', to: `${CRM_BASE}/contacts/people` },
    { label: 'جهات اتصال ساخنة', value: stats.hot, sub: 'حرارة اهتمام عالية', icon: Flame, color: 'text-rose-600 bg-rose-50', to: `${CRM_BASE}/contacts/people` },
    { label: 'إجمالي قيمة الحسابات', value: `${stats.totalLtv.toLocaleString('ar')} ر.س`, sub: 'Lifetime Value', icon: Sparkles, color: 'text-emerald-600 bg-emerald-50', to: `${CRM_BASE}/contacts/accounts` },
  ];

  const concepts = [
    { icon: Building2, title: 'الفصل: Contact مقابل Account', desc: 'جهة الاتصال هي الشخص (مدير HR)، والحساب هو الشركة. حساب واحد قد يضم عشرات جهات الاتصال من أقسام مختلفة.' },
    { icon: Users, title: 'سجل 360° والجدول الزمني الموحّد', desc: 'كل بريد ومكالمة واجتماع وملاحظة وتفاعل تسويقي يظهر في شريط زمني واحد مرتب من الأحدث للأقدم.' },
    { icon: GitMerge, title: 'محرك إدارة المكررات (Deduplication)', desc: 'كشف تلقائي للسجلات المتشابهة (نفس البريد/الهاتف/الاسم) ودمج ذكي يحتفظ بأفضل البيانات مع سجل دمج للرجوع.' },
    { icon: Sparkles, title: 'إثراء البيانات (Data Enrichment)', desc: 'تحسين السجلات تلقائياً من مصادر خارجية (Clearbit / Apollo). حالياً محاكاة حتى إدخال مفاتيح المزوّد.' },
    { icon: ShieldCheck, title: 'الصلاحيات والامتثال لـ GDPR', desc: 'رؤية حسب الدور، تسجيل مصدر الموافقة لكل جهة اتصال، سجل تدقيق كامل، وزر حذف فعلي للبيانات.' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link to={c.to} key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-cyan-300 hover:shadow-sm transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={20} /></div>
              <p className="text-2xl font-black text-slate-800 mt-3">{(aLoad || cLoad) ? '…' : c.value}</p>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">{c.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>
            </Link>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">قلب الـ CRM النابض</h2>
        <p className="text-sm text-slate-500 mb-4">كل شيء آخر — الصفقات والتقارير والأتمتة — يدور حول سؤال واحد: <span className="font-semibold text-slate-700">من هذا الشخص؟ ما علاقته بنا؟ ماذا جرى بيننا؟</span></p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {concepts.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center"><Icon size={16} /></div>
                  <h3 className="font-bold text-slate-800 text-sm">{c.title}</h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-2">مستويات سلطة القرار (Decision Role)</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(DECISION_ROLE_LABEL).map(([k, v]) => (
            <span key={k} className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg">{v}</span>
          ))}
        </div>
        <h3 className="text-sm font-bold text-slate-700 mt-4 mb-2">تصنيف الحساب (Account Type)</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
            <span key={k} className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg">{v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
