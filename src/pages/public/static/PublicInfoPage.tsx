import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, FileText, Headphones, Lock, Mail, ShieldCheck, Signal, Users, type LucideIcon } from 'lucide-react';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicInfoPageConfig } from '../../../services/sdk';

type PageKind = 'about' | 'careers' | 'blog' | 'support' | 'status' | 'privacy' | 'terms' | 'security' | 'contact';

const META: Record<PageKind, { title: string; desc: string; icon: LucideIcon; bullets: string[] }> = {
  about: { title: 'من نحن', desc: 'KYVZON منصة SaaS عراقية لبناء بوابات عمل احترافية للشركات والمؤسسات.', icon: Users, bullets: ['منصة متعددة الشركات', 'تركيز على HR والتشغيل', 'مصممة للعراق والمنطقة'] },
  careers: { title: 'الوظائف', desc: 'انضم إلى فريق Kyvzon لبناء مستقبل منصات SaaS في العراق والمنطقة.', icon: Briefcase, bullets: ['هندسة برمجيات', 'دعم فني', 'مبيعات وشراكات', 'تصميم وتجربة مستخدم'] },
  blog: { title: 'المدونة', desc: 'مقالات ورؤى حول التحول الرقمي، الموارد البشرية، وأنظمة SaaS.', icon: FileText, bullets: ['مقالات تقنية', 'إدارة الموارد البشرية', 'دراسات حالة', 'تحديثات المنتج'] },
  support: { title: 'الدعم الفني', desc: 'نحن هنا لمساعدة عملاء KYVZON في التشغيل والإعداد وحل المشاكل.', icon: Headphones, bullets: ['دعم عبر البريد', 'دعم أولوية للخطط المتقدمة', 'مساعدة في الإعداد', 'قاعدة معرفة مستقبلية'] },
  status: { title: 'حالة النظام', desc: 'تابع حالة خدمات KYVZON الأساسية والتشغيلية.', icon: Signal, bullets: ['تطبيق الويب: يعمل', 'المصادقة: تعمل', 'الإشعارات: تعمل', 'المزامنة التقنية: حسب إعداد العميل'] },
  privacy: { title: 'سياسة الخصوصية', desc: 'نلتزم بحماية بيانات العملاء والمستخدمين وفق أفضل ممارسات SaaS.', icon: Lock, bullets: ['عزل بيانات الشركات', 'عدم بيع البيانات', 'تشفير الاتصالات', 'صلاحيات وصول محددة'] },
  terms: { title: 'شروط الاستخدام', desc: 'توضح هذه الصفحة شروط استخدام منصة KYVZON وخدماتها.', icon: FileText, bullets: ['استخدام مشروع ومصرح', 'احترام حقوق الملكية', 'الالتزام بسياسات الأمان', 'شروط الاشتراك حسب العقد'] },
  security: { title: 'الأمان', desc: 'KYVZON تعتمد مبادئ أمان قوية تشمل RLS وعزل الشركات وطبقة صلاحيات.', icon: ShieldCheck, bullets: ['Multi-Tenant Isolation', 'Row Level Security', 'SDK Boundary', 'سجلات تدقيق وأحداث أمنية'] },
  contact: { title: 'تواصل معنا', desc: 'تواصل مع فريق KYVZON للاستفسارات والشراكات وطلبات العروض.', icon: Mail, bullets: ['hello@kyvzon.com', 'بغداد، العراق', 'طلبات العروض', 'الشراكات والدعم'] },
};

export default function PublicInfoPage({ kind }: { kind: PageKind }) {
  const navigate = useNavigate();
  const [custom, setCustom] = useState<PublicInfoPageConfig | null>(null);
  useEffect(() => {
    publicSiteConfigService.getConfig().then(cfg => {
      const page = cfg.pages.find(p => p.kind === kind && p.enabled !== false);
      if (page) setCustom(page);
    }).catch(() => undefined);
  }, [kind]);
  const meta = custom ? { ...META[kind], ...custom } : META[kind];
  const Icon = meta.icon;
  return (
    <div className="kv-root min-h-screen hero-grid" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-24">
        <button onClick={() => navigate('/')} className="btn-outline py-2 px-4 mb-8">العودة للرئيسية</button>
        <div className="glass-dark rounded-3xl p-8 md:p-12 border border-white/10">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 text-indigo-200 flex items-center justify-center mb-6"><Icon size={30}/></div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-4">{meta.title}</h1>
          <p className="text-white/70 leading-8 text-lg mb-8">{meta.desc}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {meta.bullets.map(b => <div key={b} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 text-white/75">{b}</div>)}
          </div>
          <button onClick={() => navigate(custom?.ctaHref || '/signup?intent=general')} className="btn-primary mt-8">{custom?.ctaLabel || 'تواصل / أنشئ حساب'}</button>
        </div>
      </div>
    </div>
  );
}
