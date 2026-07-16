/**
 * data.ts — كل البيانات الثابتة لصفحة الهبوط في مكان واحد.
 * محتوى البوابات/الخطط/الخدمات هو نفسه المحتوى الأصلي دون حذف أي عنصر.
 * تم إزالة البيانات الوهمية (إحصائيات، آراء عملاء، قطاعات) — أضف بياناتك الحقيقية لاحقاً.
 */
import {
  Users, BarChart3, Shield, Globe, Activity, MessageSquare, Smartphone,
  Cpu, UserCheck, TrendingUp, Building2, Star, Clock, Lock, Award, Zap,
} from 'lucide-react';
import type {
  PortalData, PlanData, ServiceData, StatData, IndustryData,
  TestimonialData, FaqItem, ScreenshotTab, LocalizedText,
} from './types';

// ─── بيانات البوابات الفعلية في منصة Kyvzon SaaS ───────────────────────
export const PORTALS: PortalData[] = [
  {
    id: 'employee', icon: UserCheck, color: '#6366f1', gradient: 'from-indigo-500 to-violet-600',
    title: { ar: 'بوابة الموظف', en: 'Employee Portal', ku: 'دەروازەی کارمەند' },
    desc: { ar: 'خدمة ذاتية كاملة للموظف: الحضور، الإجازات، الرواتب، النفقات، السلف، الأهداف، المهارات، التدريب، طلبات HR وتصحيح الحضور.', en: 'Complete employee self-service: attendance, leave, payslips, expenses, loans, goals, skills, training, HR cases and attendance correction.', ku: 'خۆخزمەتکردنی تەواوی کارمەند: ئامادەبوون، مۆڵەت، مووچە، خەرجی، ئامانج، کارامەیی و داواکاری HR.' },
    features: { ar: ['الحضور وتصحيح الحضور', 'الرواتب والنفقات والسلف', 'الأهداف والمهارات', 'مركز خدمات HR والخطابات', 'التدريب وSOPs'], en: ['Attendance & corrections', 'Payroll, expenses & loans', 'Goals & skills', 'HR service center & letters', 'Training & SOPs'], ku: ['ئامادەبوون و چاککردنەوە', 'مووچە و خەرجی', 'ئامانج و کارامەیی', 'خزمەتگوزاری HR', 'ڕاهێنان و SOPs'] },
  },
  {
    id: 'hr', icon: Users, color: '#0ea5e9', gradient: 'from-sky-500 to-cyan-600',
    title: { ar: 'بوابة الموارد البشرية', en: 'HR Portal', ku: 'دەروازەی HR' },
    desc: { ar: 'إدارة شاملة للموارد البشرية: الموظفين، الحضور، الرواتب، التوظيف، التدريب، العقود، التعاقب، السلامة، ومركز خدمات HR.', en: 'Full HCM operations: employees, attendance, payroll, recruitment, training, contracts, succession, safety and HR service center.', ku: 'بەڕێوەبردنی HR: کارمەندان، ئامادەبوون، مووچە، دامەزراندن، گرێبەست، شوێنگرەوە و سەلامەتی.' },
    features: { ar: ['إدارة الموظفين والوثائق', 'العقود والتعاقب', 'الصحة والسلامة CAPA', 'تحليلات Workforce', 'تقارير HR متقدمة'], en: ['Employee & documents', 'Contracts & succession', 'Health & safety CAPA', 'Workforce analytics', 'Advanced HR reports'], ku: ['کارمەند و بەڵگەنامە', 'گرێبەست و شوێنگرەوە', 'سەلامەتی CAPA', 'شیکاری هێزی کار', 'ڕاپۆرتی HR'] },
  },
  {
    id: 'admin', icon: Shield, color: '#f59e0b', gradient: 'from-amber-500 to-orange-600',
    title: { ar: 'بوابة الإدارة والحوكمة', en: 'Admin & Governance Portal', ku: 'دەروازەی بەڕێوەبەرایەتی' },
    desc: { ar: 'تحكم كامل بإعدادات الشركة، الموظفين، الصلاحيات، الهيكل التنظيمي، الفروع، الامتثال، السجلات، وملف الشركة.', en: 'Control company settings, users, permissions, org structure, branches, compliance, audit logs and company profile.', ku: 'کۆنترۆڵی ڕێکخستن، بەکارهێنەر، مۆڵەت، پێکهاتە، لقەکان و پابەندی.' },
    features: { ar: ['إدارة المستخدمين والصلاحيات', 'ملف الشركة والفروع', 'الهيكل التنظيمي', 'مركز الامتثال', 'سجل عمليات متقدم'], en: ['Users & permissions', 'Company profile & branches', 'Org structure', 'Compliance center', 'Advanced audit log'], ku: ['بەکارهێنەر و مۆڵەت', 'پرۆفایلی کۆمپانیا', 'پێکهاتەی ڕێکخراو', 'پابەندی', 'تۆماری کردار'] },
  },
  {
    id: 'manager', icon: TrendingUp, color: '#f97316', gradient: 'from-amber-500 to-orange-600',
    title: { ar: 'بوابة المدير', en: 'Manager Portal', ku: 'دەروازەی بەڕێوەبەر' },
    desc: { ar: 'لوحة للمدير لإدارة الفريق، الموافقات، أداء الأعضاء، عبء العمل، الموارد، وحضور الفريق.', en: 'Manager workspace for team overview, approvals, performance, workload, resource allocation and attendance.', ku: 'شوێنی کاری بەڕێوەبەر بۆ تیم، پەسەندکردن، کارایی و باری کار.' },
    features: { ar: ['لوحة مدير مستقلة', 'مركز الموافقات', 'أداء الفريق', 'عبء العمل والموارد', 'حضور الفريق'], en: ['Manager dashboard', 'Approval center', 'Team performance', 'Workload & resources', 'Team attendance'], ku: ['داشبۆردی بەڕێوەبەر', 'پەسەندکردن', 'کارایی تیم', 'باری کار', 'ئامادەبوونی تیم'] },
  },
  {
    id: 'supervisor', icon: Activity, color: '#2563eb', gradient: 'from-blue-500 to-blue-700',
    title: { ar: 'بوابة المشرف', en: 'Supervisor Portal', ku: 'دەروازەی سەرپەرشتیار' },
    desc: { ar: 'إدارة تشغيلية يومية للمشرف: الوردية، المهام، تصاريح الاستراحة، قوائم الفحص، وملاحظات التسليم.', en: 'Daily supervisor operations: shifts, tasks, break permits, operational checklists and handover notes.', ku: 'کرداری ڕۆژانە: وەجبە، ئەرک، مۆڵەتی پشوودان، چێکلیست و تێبینی.' },
    features: { ar: ['لوحة المشرف', 'إدارة الوردية', 'مهام الفريق', 'قوائم فحص السلامة والجودة', 'تصاريح الاستراحة'], en: ['Supervisor dashboard', 'Shift operations', 'Team tasks', 'Safety/quality checklists', 'Break permits'], ku: ['داشبۆرد', 'وەجبە', 'ئەرکی تیم', 'چێکلیستی سەلامەتی', 'مۆڵەتی پشوودان'] },
  },
  {
    id: 'movement', icon: Activity, color: '#10b981', gradient: 'from-emerald-500 to-teal-600',
    title: { ar: 'بوابة الحركة والحراسة', en: 'Movement & Gatekeeper Portal', ku: 'دەروازەی جووڵە و ئاسایش' },
    desc: { ar: 'إدارة الزوار، جلسات الحراسة، حركة الموظفين، التصاريح، تسجيل العودة، التأخير ومخالفات المسار.', en: 'Manage visitors, gatekeeper sessions, employee movement, permits, returns, delays and route violations.', ku: 'بەڕێوەبردنی میوان، وەجبەی دەروازە، جووڵەی کارمەند، مۆڵەت و پێشێلکاری ڕێگا.' },
    features: { ar: ['تسجيل الزوار', 'تصاريح حركة مسبقة', 'تسجيل خروج/عودة الموظفين', 'كشف التأخير', 'مخالفات المسار وتقارير Excel'], en: ['Visitor registration', 'Movement permits', 'Employee exit/return', 'Delay detection', 'Route violations & Excel reports'], ku: ['تۆمارکردنی میوان', 'مۆڵەتی جووڵە', 'دەرچوون/گەڕانەوە', 'دواکەوتن', 'پێشێلکاری ڕێگا'] },
  },
  {
    id: 'tawathul', icon: MessageSquare, color: '#ec4899', gradient: 'from-pink-500 to-rose-600',
    title: { ar: 'بوابة التواصل Tawathul', en: 'Tawathul Communication Portal', ku: 'دەروازەی پەیوەندی Tawathul' },
    desc: { ar: 'تواصل مؤسسي داخل الشركة: محادثات، مجموعات، قنوات، مرفقات، إشعارات، تثبيت، كتم، أرشفة، وتصدير المحادثات.', en: 'Enterprise collaboration: DMs, groups, channels, attachments, notifications, pins, mute, archive and conversation export.', ku: 'هاوکاری ناوخۆیی: چات، گروپ، کەناڵ، هاوپێچ، ئاگاداری، جێگیرکردن و ئەرشیف.' },
    features: { ar: ['محادثات فردية وجماعية', 'قنوات مؤسسية', 'مرفقات وتفاعلات', 'إشعارات وذكر المستخدمين', 'تصدير وأرشفة'], en: ['DMs & groups', 'Company channels', 'Files & reactions', 'Notifications & mentions', 'Export & archive'], ku: ['چاتی تاک و گروپ', 'کەناڵ', 'هاوپێچ و کاردانەوە', 'ئاگاداری', 'هەناردن و ئەرشیف'] },
  },
  {
    id: 'tech', icon: Cpu, color: '#8b5cf6', gradient: 'from-violet-500 to-purple-600',
    title: { ar: 'البوابة التقنية', en: 'Technical Portal', ku: 'دەروازەی تەکنیکی' },
    desc: { ar: 'إدارة أجهزة البصمة، سجل المزامنة، صحة النظام، الإعدادات التقنية، وحدود الأجهزة حسب خطة الاشتراك.', en: 'Manage biometric devices, sync logs, system health, technical settings and device limits by subscription plan.', ku: 'بەڕێوەبردنی ئامێری پەنجەمۆر، تۆماری هاوکاتکردن، تەندروستی سیستەم و ڕێکخستنەکان.' },
    features: { ar: ['إدارة أجهزة البصمة', 'سجل مزامنة فعلي', 'اختبار اتصال الجهاز', 'بصمات اليوم', 'إعدادات تقنية محفوظة'], en: ['Biometric devices', 'Real sync logs', 'Device connection test', 'Today punches', 'Saved technical settings'], ku: ['ئامێری پەنجەمۆر', 'تۆماری هاوکاتکردن', 'تاقیکردنەوەی پەیوەندی', 'پەنجەمۆری ئەمڕۆ', 'ڕێکخستنی پاشەکەوتکراو'] },
  },
];

// ─── خطط الأسعار الفعلية لمنصة Kyvzon SaaS ─────────────────
export const PLANS: PlanData[] = [
  {
    id: 'low',
    name: { ar: 'BASIC', en: 'BASIC', ku: 'BASIC' },
    range: { ar: 'حتى ٥٠ موظف', en: 'Up to 50 employees', ku: 'تا ٥٠ کارمەند' },
    desc: { ar: 'الخطة الأساسية للشركات الصغيرة التي تبدأ بالتحول الرقمي للموارد البشرية.', en: 'Core plan for small companies starting HR digital transformation.', ku: 'پلانی بنەڕەتی بۆ کۆمپانیا بچووکەکان.' },
    features: {
      ar: ['بوابة الموظف', 'بوابة الموارد البشرية الأساسية', 'الحضور والإجازات والرواتب الأساسية', 'حد فرع واحد وجهاز بصمة واحد', 'دعم قياسي'],
      en: ['Employee portal', 'Core HR portal', 'Attendance, leave and basic payroll', '1 branch and 1 biometric device', 'Standard support'],
      ku: ['دەروازەی کارمەند', 'HR بنەڕەتی', 'ئامادەبوون و مۆڵەت', '١ لق و ١ ئامێر', 'پشتگیری ستاندارد'],
    },
    highlight: false,
    badge: null,
  },
  {
    id: 'medium',
    name: { ar: 'PROFESSIONAL', en: 'PROFESSIONAL', ku: 'PROFESSIONAL' },
    range: { ar: 'حتى ٢٥٠ موظف', en: 'Up to 250 employees', ku: 'تا ٢٥٠ کارمەند' },
    desc: { ar: 'للشركات المتوسطة التي تحتاج إدارة تشغيلية متكاملة للفرق والحركة والتواصل.', en: 'For growing companies that need operations, movement, teams and collaboration.', ku: 'بۆ کۆمپانیا ناوەندەکان کە پێویستیان بە کرداری گشتگیرە.' },
    features: {
      ar: ['بوابات الموظف وHR والإدارة', 'بوابة المدير والمشرف', 'الحراسة والحركة والتصاريح', 'بوابة التواصل Tawathul', 'تقارير متقدمة وعقود الموظفين'],
      en: ['Employee, HR and Admin portals', 'Manager and Supervisor portals', 'Gatekeeper, movement and permits', 'Tawathul collaboration', 'Advanced reports and employee contracts'],
      ku: ['کارمەند، HR و بەڕێوەبەرایەتی', 'بەڕێوەبەر و سەرپەرشتیار', 'دەروازە و جووڵە', 'Tawathul', 'ڕاپۆرت و گرێبەست'],
    },
    highlight: true,
    badge: { ar: 'الأكثر طلباً', en: 'Most Popular', ku: 'زۆرترین داواکاری' },
  },
  {
    id: 'max',
    name: { ar: 'ENTERPRISE', en: 'ENTERPRISE', ku: 'ENTERPRISE' },
    range: { ar: 'حتى ٢٠٠٠ موظف', en: 'Up to 2000 employees', ku: 'تا ٢٠٠٠ کارمەند' },
    desc: { ar: 'للمؤسسات الكبيرة التي تحتاج بوابات متقدمة وتحليلات عميقة وتكامل أجهزة.', en: 'For large enterprises that need advanced portals, analytics and device integrations.', ku: 'بۆ دامەزراوە گەورەکان بە پێویستی دەروازەی پێشکەوتوو.' },
    features: {
      ar: ['كل البوابات الحالية', 'البوابة التقنية وأجهزة البصمة', 'الصحة والسلامة والتعاقب', 'الذكاء الاصطناعي والرؤى', 'حدود عالية للفروع والأجهزة والتخزين'],
      en: ['All current portals', 'Tech portal and biometric devices', 'Health & safety and succession', 'AI insights', 'High branch/device/storage limits'],
      ku: ['هەموو دەروازەکان', 'دەروازەی تەکنیکی و ئامێرەکان', 'سەلامەتی و شوێنگرەوە', 'AI', 'سنووری بەرز'],
    },
    highlight: false,
    badge: { ar: 'للمؤسسات', en: 'Enterprise', ku: 'دامەزراوە' },
  },
  {
    id: 'extra',
    name: { ar: 'CUSTOM', en: 'CUSTOM', ku: 'CUSTOM' },
    range: { ar: 'حل مخصص', en: 'Custom solution', ku: 'چارەسەری تایبەت' },
    desc: { ar: 'حل SaaS مخصص للمجموعات والشركات التي تحتاج حدوداً أو تكاملات خاصة.', en: 'Custom SaaS solution for groups requiring special limits or integrations.', ku: 'چارەسەری SaaS ـی تایبەت بۆ گروپەکان.' },
    features: {
      ar: ['تفعيل مخصص للبوابات', 'حدود غير محدودة حسب العقد', 'خادم أو إعدادات مخصصة', 'تكاملات خاصة وAgent للأجهزة', 'دعم مخصص'],
      en: ['Custom portal activation', 'Contract-based unlimited limits', 'Dedicated/custom setup', 'Custom integrations and device agent', 'Dedicated support'],
      ku: ['چالاککردنی تایبەت', 'سنووری بەپێی گرێبەست', 'ڕێکخستنی تایبەت', 'یەکگرتنی تایبەت', 'پشتگیری تایبەت'],
    },
    highlight: false,
    badge: { ar: 'حسب العقد', en: 'By Contract', ku: 'بەپێی گرێبەست' },
  },
];

/** قيمة خلية في جدول المقارنة: علامة صح/خطأ، أو نص ثابت (رقم)، أو نص مترجم */
export type CompareValue = boolean | string | LocalizedText;

export interface CompareRow {
  label: LocalizedText;
  low: CompareValue;
  medium: CompareValue;
  max: CompareValue;
  extra: CompareValue;
}

/** صفوف جدول مقارنة الخطط */
export const PLAN_COMPARISON: CompareRow[] = [
  { label: { ar: 'عدد الموظفين', en: 'Employees', ku: 'کارمەندان' }, low: '50', medium: '250', max: '2000', extra: { ar: 'حسب العقد', en: 'By contract', ku: 'بەپێی گرێبەست' } },
  { label: { ar: 'البوابات المفعلة', en: 'Enabled portals', ku: 'دەروازە چالاکەکان' }, low: '2', medium: '10', max: { ar: 'كل البوابات', en: 'All portals', ku: 'هەموو' }, extra: { ar: 'مخصص', en: 'Custom', ku: 'تایبەت' } },
  { label: { ar: 'الفروع', en: 'Branches', ku: 'لقەکان' }, low: '1', medium: '5', max: '50', extra: { ar: 'غير محدود', en: 'Unlimited', ku: 'نامحدود' } },
  { label: { ar: 'أجهزة البصمة', en: 'Biometric devices', ku: 'ئامێری پەنجەمۆر' }, low: '1', medium: '5', max: '50', extra: { ar: 'غير محدود', en: 'Unlimited', ku: 'نامحدود' } },
  { label: { ar: 'التخزين', en: 'Storage', ku: 'هەڵگرتن' }, low: '5GB', medium: '50GB', max: '500GB', extra: { ar: 'حسب العقد', en: 'By contract', ku: 'بەپێی گرێبەست' } },
  { label: { ar: 'بوابة التواصل', en: 'Tawathul collaboration', ku: 'Tawathul' }, low: false, medium: true, max: true, extra: true },
  { label: { ar: 'بوابة الحركة والحراسة', en: 'Movement & gatekeeper', ku: 'جووڵە و ئاسایش' }, low: false, medium: true, max: true, extra: true },
  { label: { ar: 'البوابة التقنية', en: 'Tech portal', ku: 'دەروازەی تەکنیکی' }, low: false, medium: false, max: true, extra: true },
  { label: { ar: 'الذكاء الاصطناعي والرؤى', en: 'AI insights', ku: 'AI' }, low: false, medium: false, max: true, extra: true },
  { label: { ar: 'الدعم الفني', en: 'Support', ku: 'پشتگیری' }, low: { ar: 'قياسي', en: 'Standard', ku: 'ستاندارد' }, medium: { ar: 'أولوية', en: 'Priority', ku: 'پێشینەدار' }, max: { ar: 'مخصص', en: 'Dedicated', ku: 'تایبەت' }, extra: { ar: 'مخصص', en: 'Dedicated', ku: 'تایبەت' } },
];

// ─── الخدمات الإضافية ─────────────────────────────────────────────
export const EXTRA_SERVICES: ServiceData[] = [
  {
    icon: Globe,
    color: '#6366f1',
    title: { ar: 'تصميم وإنشاء مواقع إلكترونية', en: 'Web Design & Development', ku: 'دیزاین و دروستکردنی مالپەڕ' },
    desc: { ar: 'احصل على موقع احترافي يعكس هوية شركتك', en: 'Get a professional website that reflects your brand identity', ku: 'مالپەڕێکی پیشەیی بەدەست بهێنە کە ناسنامەی برانتت نیشان بدات' },
    promo: { ar: '🎁 اشترك واحصل على موقعك مجاناً', en: '🎁 Subscribe & Get a Free Website', ku: '🎁 بەشداری بکە و مالپەڕی بە خۆراو وەربگرە' },
    badge: { ar: 'مجاناً مع الاشتراك', en: 'Free with Plan', ku: 'خۆراو لەگەڵ ئەبۆنمەنت' },
  },
  {
    icon: Smartphone,
    color: '#0ea5e9',
    title: { ar: 'تطوير تطبيقات إدارة مخصصة', en: 'Custom Management App Development', ku: 'گەشەپێدانی ئەپی بەڕێوەبردنی تایبەت' },
    desc: { ar: 'نصمم وننشئ تطبيق ويب أو موبايل مخصص بالكامل لإدارة مؤسستك حسب احتياجاتك الفعلية', en: 'We design and build a fully custom web or mobile app to manage your organization, built around your real needs', ku: 'ئێمە ئەپێکی وێب یان مۆبایلی تایبەت دروست دەکەین بۆ بەڕێوەبردنی دامەزراوەکەت' },
    promo: { ar: '⚙️ من الفكرة إلى الإطلاق', en: '⚙️ From Idea to Launch', ku: '⚙️ لە بیرۆکەوە بۆ دەستپێکردن' },
    badge: { ar: 'حل مخصص', en: 'Custom Build', ku: 'دروستکراوی تایبەت' },
  },
  {
    icon: TrendingUp,
    color: '#f59e0b',
    title: { ar: 'استشارات تقنية وتحول رقمي', en: 'Technical Consulting & Digital Transformation', ku: 'ڕاوێژکاری تەکنیکی و گۆڕانکاری دیجیتاڵ' },
    desc: { ar: 'نساعدك على تحديد المسار الرقمي الأمثل لمؤسستك وربط أنظمتك بكفاءة أعلى', en: 'We help you define the right digital roadmap for your organization and connect your systems more efficiently', ku: 'یارمەتیت دەدەین ڕێگای دیجیتاڵی گونجاو بۆ دامەزراوەکەت دیاری بکەیت' },
    promo: { ar: '📈 استراتيجية مبنية على بياناتك', en: '📈 Strategy Built Around Your Data', ku: '📈 ستراتیژی بەپێی داتاکانت' },
    badge: { ar: 'فريق خبراء', en: 'Expert Team', ku: 'تیمی شارەزا' },
  },
  {
    icon: Shield,
    color: '#10b981',
    title: { ar: 'الأمن السيبراني', en: 'Cybersecurity Services', ku: 'خزمەتگوزاریی ئەمنییەتی سایبەر' },
    desc: { ar: 'حماية متكاملة لبيانات شركتك — تشفير، مراقبة، وإدارة أذونات متقدمة', en: 'Complete protection for your company data — encryption, monitoring, and advanced permission management', ku: 'پاراستنی تەواو بۆ داتاکانی کۆمپانیاکەت' },
    promo: { ar: '🛡️ حماية 24/7 لبياناتك', en: '🛡️ 24/7 Data Protection', ku: '🛡️ پاراستنی داتا ٢٤/٧' },
    badge: { ar: 'متوفر', en: 'Available', ku: 'بەردەستە' },
  },
];

// ─── إحصائيات الثقة ─────────────────────────────────────────────────
// ℹ️ مصفوفة فارغة — أضف إحصائياتك الحقيقية هنا لاحقاً
export const STATS: StatData[] = [];

// ─── القطاعات التي نمثّلها ──────────────────────────────────────────
// ℹ️ مصفوفة فارغة — أضف القطاعات التي تخدمها أو شعارات العملاء لاحقاً
export const INDUSTRIES: IndustryData[] = [];

// ─── آراء العملاء ───────────────────────────────────────────────────
// ℹ️ مصفوفة فارغة — أضف آراء عملاء حقيقيين لاحقاً
export const TESTIMONIALS: TestimonialData[] = [];

// ─── الأسئلة الشائعة ──────────────────────────────────────────────
export const FAQS: FaqItem[] = [
  {
    id: 'f1',
    q: { ar: 'هل يمكن تخصيص النظام حسب احتياجات مؤسستي؟', en: 'Can the system be customized to my organization\u2019s needs?', ku: 'ئایا سیستەمەکە دەتوانرێت بگونجێنرێت؟' },
    a: {
      ar: 'نعم. بعد الاشتراك يمكن تخصيص الحقول والتقارير وسير العمل حسب طبيعة عملك، وللمؤسسات الكبيرة نقدّم تطوير حلول مخصصة بالكامل ضمن خطة EXTRA.',
      en: 'Yes. After you subscribe, fields, reports, and workflows can be tailored to your business. For large organizations, we offer fully custom solution development under the EXTRA plan.',
      ku: 'بەڵێ، دوای بەشداریکردن دەتوانرێت خانەکان و ڕاپۆرتەکان بگونجێنرێن.',
    },
  },
  {
    id: 'f2',
    q: { ar: 'هل بياناتنا آمنة؟ وأين تُخزَّن؟', en: 'Is our data secure? Where is it stored?', ku: 'ئایا داتاکانمان پارێزراون؟' },
    a: {
      ar: 'بياناتك مشفّرة ومخزّنة على خوادم تُراقب على مدار الساعة، ومع خطتَي MAX وEXTRA نوفّر خادماً مخصصاً بالكامل لمؤسستك.',
      en: 'Your data is encrypted and stored on servers monitored around the clock. With MAX and EXTRA plans, we provide a fully dedicated server for your organization.',
      ku: 'داتاکانت کۆدکراو و لەسەر سێرڤەرێکی چاودێریکراو هەڵدەگیرێن.',
    },
  },
  {
    id: 'f3',
    q: { ar: 'كم يستغرق الإعداد والتشغيل؟', en: 'How long does setup and onboarding take?', ku: 'ئامادەکردن چەند کات دەخایەنێت؟' },
    a: {
      ar: 'عادة بين يوم وأسبوع حسب حجم بياناتك وعدد البوابات المفعّلة، مع دعم كامل من فريقنا خلال مرحلة الإعداد.',
      en: 'Usually between one day and one week, depending on your data volume and the number of active portals, with full support from our team throughout setup.',
      ku: 'بەگشتی نێوان یەک ڕۆژ و یەک هەفتە.',
    },
  },
  {
    id: 'f4',
    q: { ar: 'هل أستطيع تغيير خطتي لاحقاً؟', en: 'Can I change my plan later?', ku: 'ئایا دەتوانم پلانەکەم بگۆڕم؟' },
    a: {
      ar: 'بالتأكيد، يمكنك الترقية أو التخفيض في أي وقت دون فقدان بياناتك وبدون التزام طويل الأمد.',
      en: 'Absolutely — you can upgrade or downgrade anytime without losing your data or being locked into a long-term contract.',
      ku: 'بەڵێ، دەتوانیت لە هەر کاتێک پلانەکەت بگۆڕیت.',
    },
  },
  {
    id: 'f5',
    q: { ar: 'ما اللغات التي يدعمها النظام؟', en: 'What languages does the system support?', ku: 'سیستەمەکە چ زمانانێک پشتگیری دەکات؟' },
    a: {
      ar: 'يدعم النظام العربية والإنجليزية والكردية بالكامل، ويمكن لكل موظف اختيار لغته الخاصة داخل حسابه.',
      en: 'The system fully supports Arabic, English, and Kurdish, and each employee can choose their own language inside their account.',
      ku: 'سیستەمەکە بە تەواوی عەرەبی، ئینگلیزی و کوردی پشتگیری دەکات.',
    },
  },
  {
    id: 'f6',
    q: { ar: 'هل توجد فترة تجريبية قبل الاشتراك؟', en: 'Is there a trial before subscribing?', ku: 'ئایا ماوەیەکی تاقیکردنەوە هەیە؟' },
    a: {
      ar: 'نعم، تواصل مع فريقنا لجدولة عرض تجريبي مباشر على بياناتك قبل اتخاذ القرار النهائي.',
      en: 'Yes — contact our team to schedule a live demo using your own data before making a final decision.',
      ku: 'بەڵێ، پەیوەندی بە تیمەکەمانەوە بکە بۆ دیمۆیەکی ڕاستەوخۆ.',
    },
  },
  {
    id: 'f7',
    q: { ar: 'كيف يتم الدعم الفني؟', en: 'How does technical support work?', ku: 'پشتگیری تەکنیکی چۆنە؟' },
    a: {
      ar: 'عبر البريد الإلكتروني في الخطط الأساسية، ودعم بأولوية أو مدير حساب مخصص في الخطط الأعلى، مع تغطية ٢٤/٧ في خطة EXTRA.',
      en: 'Via email on core plans, with priority support or a dedicated account manager on higher plans, and 24/7 coverage on the EXTRA plan.',
      ku: 'لە ڕێگەی ئیمەیڵ لە پلانە بنەڕەتییەکاندا.',
    },
  },
  {
    id: 'f8',
    q: { ar: 'هل يمكن تصدير بياناتنا إذا قررنا التوقف؟', en: 'Can we export our data if we decide to stop?', ku: 'ئایا دەتوانین داتاکانمان دەربهێنین؟' },
    a: {
      ar: 'نعم، بياناتك ملكك دائماً، ويمكنك تصديرها بالكامل بصيغة Excel أو PDF في أي وقت تشاء.',
      en: 'Yes — your data always belongs to you, and you can export it in full as Excel or PDF whenever you want.',
      ku: 'بەڵێ، داتاکانت هەمیشە هی خۆتن.',
    },
  },
];

// ─── ألسنة قسم لقطات الشاشة ──────────────────────────────────────
export const SCREENSHOT_TABS: ScreenshotTab[] = [
  { id: 'dashboard', icon: BarChart3, label: { ar: 'لوحة التحكم', en: 'Dashboard', ku: 'داشبۆرد' }, color: '#6366f1' },
  { id: 'hr', icon: Users, label: { ar: 'الموارد البشرية', en: 'HR', ku: 'HR' }, color: '#0ea5e9' },
  { id: 'employee', icon: UserCheck, label: { ar: 'الموظف', en: 'Employee', ku: 'کارمەند' }, color: '#f59e0b' },
  { id: 'analytics', icon: TrendingUp, label: { ar: 'التحليلات', en: 'Analytics', ku: 'شیکاری' }, color: '#10b981' },
  { id: 'mobile', icon: Smartphone, label: { ar: 'الجوال', en: 'Mobile', ku: 'مۆبایل' }, color: '#ec4899' },
];

/** عناصر "لماذا KYVZON" — عنوان + وصف قصير لكل ميزة */
export const WHY_REASONS = [
  { icon: Shield, title: { ar: 'بيانات آمنة ١٠٠٪', en: '100% Secure Data', ku: 'داتای ئەمن ١٠٠٪' }, desc: { ar: 'تشفير كامل ونسخ احتياطي منتظم لكل بياناتك', en: 'Full encryption and regular backups for all your data', ku: 'کۆدکردنی تەواو و پاڵپشتی بەردەوام' } },
  { icon: Zap, title: { ar: 'أداء عالٍ وسريع', en: 'High Performance', ku: 'کارایی بەرز' }, desc: { ar: 'واجهات سريعة الاستجابة حتى مع آلاف السجلات', en: 'Fast, responsive interfaces even with thousands of records', ku: 'ڕووکاری خێرا تەنانەت لەگەڵ هەزاران تۆمار' } },
  { icon: Globe, title: { ar: '٣ لغات مدعومة', en: '3 Languages', ku: '٣ زمان پشتگیریکراو' }, desc: { ar: 'العربية والإنجليزية والكردية بواجهة واحدة', en: 'Arabic, English, and Kurdish in one unified interface', ku: 'عەرەبی، ئینگلیزی و کوردی لە یەک ڕووکار' } },
  { icon: Clock, title: { ar: 'دعم ٢٤/٧', en: '24/7 Support', ku: 'پشتگیری ٢٤/٧' }, desc: { ar: 'فريق دعم محلي يفهم سياق سوقك', en: 'A local support team that understands your market', ku: 'تیمی پشتگیری ناوخۆیی' } },
  { icon: Lock, title: { ar: 'خوادم مخصصة', en: 'Dedicated Servers', ku: 'سێرڤەری تایبەت' }, desc: { ar: 'متاحة للمؤسسات الكبيرة عند الحاجة', en: 'Available for large organizations when needed', ku: 'بەردەست بۆ دامەزراوە گەورەکان' } },
  { icon: Award, title: { ar: 'تحديثات مستمرة', en: 'Continuous Updates', ku: 'نوێکردنەوەی بەردەوام' }, desc: { ar: 'ميزات جديدة بانتظام دون تكلفة إضافية', en: 'New features regularly, at no extra cost', ku: 'تایبەتمەندی نوێ بەبێ تێچووی زیاد' } },
];