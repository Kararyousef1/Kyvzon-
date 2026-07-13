import { useState } from 'react';
import { LayoutDashboard, Users, FileText, Heart, Bot, ClipboardList, MessageSquare, BarChart3, ShieldCheck, UserCheck, Bell, ChevronLeft, Megaphone, ArrowRightLeft, Clock, BookOpen, Terminal, Database, AlertOctagon, Settings, Globe, Award, Star, Activity, Lock } from 'lucide-react';

const changelog = [
  {
    version: '2.1.0',
    date: '4 يونيو 2026',
    changes: [
      '✨ تحسين التوافق مع الشاشات الصغيرة (الهاتف والآيباد)',
      '📱 تعديل جميع اللوحات لتكون متجاوبة 100%',
      '🛠️ إصلاح مشكلة تداخل الهيدر مع المحتوى على الجوال',
      '📐 تحسين مرونة الحجم والتباعد في جميع الصفحات'
    ]
  },
  {
    version: '2.0.0',
    date: 'مايو 2026',
    changes: [
      '🚀 إطلاق النظام التجريبي',
      '👤 لوحة الموظف - رفع المشاكل، الصحة النفسية، المساعد الذكي',
      '👥 لوحة الموارد البشرية - التحليلات، التقارير، إدارة الفريق',
      '🛡️ لوحة الإدارة - إدارة الموظفين، الصلاحيات، إعدادات النظام',
      '🚪 بوابة الحراسة - تسجيل حركة الزوار والموظفين',
      '💻 لوحة المطور - إدارة قاعدة البيانات، الطرفية، سجل العمليات',
      '📢 التبليغات - إشعارات فورية لجميع المستخدمين'
    ]
  }
];

const panels = [
  {
    id: 'employee',
    title: 'لوحة الموظف',
    titleEn: 'Employee Panel',
    icon: LayoutDashboard,
    color: 'from-blue-500 to-blue-700',
    description: 'الواجهة الرئيسية للموظف - متاحة لجميع الموظفين:',
    features: [
      { icon: LayoutDashboard, text: '📊 لوحة التحكم - ملخص الأنشطة والإحصائيات والمشاكل' },
      { icon: FileText, text: '📝 مشاكلي - رفع وتتبع المشاكل المرفوعة' },
      { icon: Heart, text: '💚 الصحة النفسية - تسجيل المزاج اليومي ومتابعة الحالة' },
      { icon: ClipboardList, text: '📋 الاستبيانات - المشاركة في استبيانات الموارد البشرية' },
      { icon: BookOpen, text: '📚 التدريب والتطوير - دورات تدريبية ومواد تعليمية' },
      { icon: FileText, text: '📄 إجراءات SOP - دليل إجراءات العمل القياسية' },
      { icon: Bot, text: '🤖 محادثة AI - مساعد ذكي للإجابة على الاستفسارات' },
      { icon: MessageSquare, text: '💬 تواصل مع HR - إرسال واستقبال الرسائل' },
      { icon: UserCheck, text: '👤 ملفي الشخصي - عرض وتحديث البيانات الشخصية' },
      { icon: Bell, text: '🔔 التبليغات - الإشعارات والأخبار الداخلية' },
    ]
  },
  {
    id: 'hr',
    title: 'لوحة الموارد البشرية',
    titleEn: 'HR Panel',
    icon: Users,
    color: 'from-emerald-500 to-emerald-700',
    description: 'لوحة إدارة الموارد البشرية - متاحة لقسم HR:',
    features: [
      { icon: LayoutDashboard, text: '📊 لوحة التحكم - مؤشرات الأداء الرئيسية وإحصائيات المؤسسة' },
      { icon: BarChart3, text: '📈 تحليل الحركة - تحليل حركة دخول وخروج الموظفين' },
      { icon: FileText, text: '📝 المشاكل المرفوعة - إدارة مشاكل الموظفين' },
      { icon: Activity, text: '📊 التحليلات - تحليلات متقدمة ورسوم بيانية' },
      { icon: Users, text: '👥 فريق العمل - إدارة فرق العمل والأقسام' },
      { icon: Award, text: '💼 سجل المؤهلات - متابعة مؤهلات وكفاءات الموظفين' },
      { icon: MessageSquare, text: '📬 صندوق البريد - تواصل مع الموظفين' },
      { icon: ClipboardList, text: '📋 التقارير - تقارير الموارد البشرية الشاملة' },
      { icon: Bell, text: '🔔 التبليغات - الإشعارات والأخبار' },
    ]
  },
  {
    id: 'gatekeeper',
    title: 'بوابة الحراسة',
    titleEn: 'Gatekeeper Portal',
    icon: UserCheck,
    color: 'from-cyan-500 to-cyan-700',
    description: 'بوابة تسجيل حركة الدخول والخروج - متاحة لحراس الأمن:',
    features: [
      { icon: Users, text: '👥 زوار البوابة - تسجيل دخول وخروج الزوار' },
      { icon: ArrowRightLeft, text: '🚶 حركة الموظفين - تسجيل خروج وعودة الموظفين' },
      { icon: Clock, text: '⏰ إدارة الورديات - ورديات صباحية/مسائية/ليلية' },
      { icon: ShieldCheck, text: '🔐 كشف التلاعب - التحقق من مسار الموظفين' },
      { icon: ClipboardList, text: '📊 تصدير Excel - تصدير التقارير بصيغة Excel' },
      { icon: Bell, text: '🔔 الإشعارات - تنبيهات الموافقات والطلبات' },
    ]
  },
  {
    id: 'admin',
    title: 'لوحة الإدارة',
    titleEn: 'Admin Panel',
    icon: ShieldCheck,
    color: 'from-orange-500 to-red-600',
    description: 'لوحة إدارة النظام الكاملة - متاحة للمشرفين:',
    features: [
      { icon: LayoutDashboard, text: '📊 لوحة التحكم - نظرة عامة على النظام والإحصائيات' },
      { icon: Globe, text: '🌐 إدارة صفحة الزوار - تعديل محتوى الصفحة الرئيسية' },
      { icon: Users, text: '👥 إدارة الموظفين - إضافة/تعديل/تفعيل المستخدمين' },
      { icon: ShieldCheck, text: '🔐 شجرة الصلاحيات - إدارة صلاحيات الوصول' },
      { icon: ShieldCheck, text: '🛡️ صلاحيات المدراء - إدارة صلاحيات المشرفين' },
      { icon: ClipboardList, text: '📋 التقارير - تقارير النظام الكاملة' },
      { icon: Settings, text: '⚙️ الإعدادات - إعدادات النظام العامة' },
      { icon: AlertOctagon, text: '📋 سجل العمليات - تتبع جميع التغييرات' },
      { icon: FileText, text: '📄 إدارة SOPs - إدارة إجراءات العمل القياسية' },
      { icon: FileText, text: '📊 تقارير SOPs - تقارير إجراءات العمل' },
      { icon: Bot, text: '🤖 إعداد AI - إعدادات الذكاء الاصطناعي' },
      { icon: Bell, text: '🔔 التبليغات - الإشعارات والأخبار' },
    ]
  },
  {
    id: 'developer',
    title: 'لوحة المطور',
    titleEn: 'Developer Dashboard',
    icon: Terminal,
    color: 'from-slate-800 to-black',
    description: 'بيئة التطوير والتحكم المتقدم - متاحة للمطورين فقط:',
    features: [
      { icon: LayoutDashboard, text: '💻 لوحة التحكم - معلومات تقنية وحالة الخدمات' },
      { icon: Users, text: '👥 إدارة المستخدمين - إدارة كاملة للمستخدمين والصلاحيات' },
      { icon: ShieldCheck, text: '🔐 إدارة الصلاحيات - صلاحيات وصول تفصيلية' },
      { icon: Lock, text: '📦 الأرشيف المحمي - بيانات مؤرشفة مشفرة' },
      { icon: Clock, text: '⏰ إعدادات البصمة - ربط أجهزة البصمة والحضور' },
      { icon: AlertOctagon, text: '🚨 إدارة البلاغات - إدارة بلاغات النظام' },
      { icon: Database, text: '🗄️ قاعدة البيانات - استعلامات SQL وإدارة الجداول' },
      { icon: FileText, text: '📋 سجل العمليات - سجل التدقيق الكامل' },
      { icon: Terminal, text: '💻 الطرفية (Terminal) - أوامر تحكم متقدمة' },
      { icon: Settings, text: '⚙️ الإعدادات - إعدادات الأمان والحماية' },
    ]
  },
  {
    id: 'notifications',
    title: 'التبليغات',
    titleEn: 'Notifications',
    icon: Megaphone,
    color: 'from-amber-500 to-orange-600',
    description: 'نظام الإشعارات الداخلية - متاح لجميع المستخدمين:',
    features: [
      { icon: Bell, text: '🔔 إشعارات فورية عند رفع مشكلة أو تحديث حالتها' },
      { icon: MessageSquare, text: '💬 تنبيهات الرسائل الجديدة من HR' },
      { icon: Clock, text: '⏰ إشعارات تذكيرية للمواعيد والاستبيانات' },
      { icon: Activity, text: '📊 إشعارات تغيير الحالة للمشاكل المرفوعة' },
      { icon: ShieldCheck, text: '🛡️ إشعارات أمان ومتابعة للصلاحيات' },
    ]
  }
];

export default function SystemGuide({ onSkip }: { onSkip: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showChangelog, setShowChangelog] = useState(false);
  const current = panels[currentIndex];

  if (showChangelog) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl rounded-3xl p-6 md:p-10 border border-white/10 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <Megaphone className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">📋 سجل التحديثات</h1>
            <p className="text-gray-400 text-sm">آخر التحديثات والإضافات على المنصة</p>
          </div>

          <div className="space-y-6">
            {changelog.map((entry, idx) => (
              <div key={idx} className="bg-white/5 rounded-2xl p-5 md:p-6 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-sm font-bold">
                      v{entry.version}
                    </span>
                    <span className="text-gray-500 text-sm">{entry.date}</span>
                  </div>
                </div>
                <ul className="space-y-2">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <button onClick={() => setShowChangelog(false)} 
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-colors">
              عودة للدليل
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-xl rounded-3xl p-6 md:p-10 border border-white/10 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-500/20 flex items-center justify-center">
            <LayoutDashboard className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">🌐 خريطة النظام</h1>
          <p className="text-gray-400 text-sm">دليل شامل لجميع أقسام ولوحات النظام</p>
          
          {/* زر سجل التحديثات */}
          <button onClick={() => setShowChangelog(true)}
            className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-xs font-bold hover:bg-green-500/20 transition-colors">
            <Star size={14} />
            آخر تحديث: 4 يونيو 2026 - الإصدار 2.1.0
          </button>
        </div>

        <div className="flex gap-2 mb-6 justify-center">
          {panels.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === currentIndex ? 'w-8 bg-indigo-500' : 'w-4 bg-white/20'}`} />
          ))}
        </div>

        <div className="bg-white/5 rounded-2xl p-5 md:p-8 border border-white/10">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r ${current.color} mb-5`}>
            <current.icon size={18} className="text-white" />
            <span className="text-white font-bold text-sm md:text-base">{current.title}</span>
            <span className="text-white/60 text-xs md:text-sm">({current.titleEn})</span>
          </div>
          <p className="text-gray-300 mb-5 text-sm md:text-base">{current.description}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {current.features.map((feature, i) => (
              <div key={i} className="bg-white/5 rounded-xl px-3 md:px-4 py-2.5 border border-white/5 flex items-center gap-2">
                <span className="text-gray-300 text-xs md:text-sm">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors text-sm">
            <ChevronLeft size={18} /> السابق
          </button>
          <div className="text-gray-500 text-xs md:text-sm">{currentIndex + 1} / {panels.length}</div>
          {currentIndex < panels.length - 1 ? (
            <button onClick={() => setCurrentIndex(prev => Math.min(panels.length - 1, prev + 1))}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-colors text-sm">
              التالي <ChevronLeft size={18} />
            </button>
          ) : (
            <button onClick={onSkip}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold transition-colors text-sm">
              ✨ بدء استخدام النظام
            </button>
          )}
        </div>
        <div className="flex justify-center gap-4 mt-4">
          <button onClick={onSkip} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">تخطي الشرح</button>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/5 text-center">
          <p className="text-gray-600 text-xs">
            Kyvzon Platform © {new Date().getFullYear()} | الإصدار 2.1.0
          </p>
        </div>
      </div>
    </div>
  );
}