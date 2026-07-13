import type {
  User, Problem, Notification, WellnessData, Analytics, AuditLog
} from '../../shared/types';

// ════════════════════════════════════════════════════════════════
//  بيانات وهمية Mock Data - Kyvzon Platform
//  تستخدم في بيئة التطوير فقط
// ════════════════════════════════════════════════════════════════

export const mockUser: User = {
  id: 'dev-user-1',
  full_name: 'مستخدم تجريبي',
  email: 'test@kyvzon.local',
  role: 'admin',
  department: 'IT',
  position: 'مطور',
  status: 'active',
  permissions: ['*'],
};

export const mockEmployees: User[] = [
  mockUser,
  {
    id: 'emp-2',
    full_name: 'أحمد محمد',
    email: 'ahmed@kyvzon.local',
    role: 'employee',
    department: 'إنتاج',
    position: 'فني إنتاج',
    status: 'active',
    permissions: [],
  },
  {
    id: 'emp-3',
    full_name: 'سارة خالد',
    email: 'sara@kyvzon.local',
    role: 'hr',
    department: 'الموارد البشرية',
    position: 'أخصائي موارد بشرية',
    status: 'active',
    permissions: [],
  },
  {
    id: 'emp-4',
    full_name: 'محمد علي',
    email: 'mohammed@kyvzon.local',
    role: 'manager',
    department: 'المبيعات',
    position: 'مدير مبيعات',
    status: 'active',
    permissions: [],
  },
  {
    id: 'emp-5',
    full_name: 'نور حسن',
    email: 'noor@kyvzon.local',
    role: 'employee',
    department: 'مراقبة الجودة',
    position: 'مفتش جودة',
    status: 'inactive',
    permissions: [],
  },
];

export const mockProblems: Problem[] = [
  {
    id: 'prob-1',
    title: 'مشكلة في نظام الحضور',
    description: 'نظام الحضور لا يسجل بصمة بعض الموظفين بشكل صحيح',
    category: 'technical',
    severity: 'high',
    status: 'in_progress',
    isAnonymous: false,
    employeeId: 'emp-2',
    employeeName: 'أحمد محمد',
    department: 'إنتاج',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    comments: [
      {
        id: 'c1',
        text: 'سنقوم بفحص الجهاز في أقرب وقت',
        authorId: 'emp-3',
        authorName: 'سارة خالد',
        authorRole: 'hr',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
    timeline: [
      { id: 't1', event: 'تم الإنشاء', description: 'تم رفع المشكلة', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), actor: 'أحمد محمد', type: 'created' },
      { id: 't2', event: 'قيد المعالجة', description: 'تم تعيين فريق الصيانة', timestamp: new Date(Date.now() - 86400000).toISOString(), actor: 'سارة خالد', type: 'updated' },
    ],
  },
  {
    id: 'prob-2',
    title: 'تأخر صرف رواتب',
    description: 'راتب هذا الشهر لم يتم صرفه بعد رغم مرور الموعد المحدد',
    category: 'salary',
    severity: 'critical',
    status: 'pending',
    isAnonymous: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    timeline: [
      { id: 't3', event: 'تم الإنشاء', description: 'تم رفع المشكلة', timestamp: new Date(Date.now() - 86400000).toISOString(), actor: 'موظف مجهول', type: 'created' },
    ],
  },
  {
    id: 'prob-3',
    title: 'تحسين بيئة العمل',
    description: 'نحتاج إلى تحسين التهوية في خط الإنتاج',
    category: 'workplace',
    severity: 'medium',
    status: 'resolved',
    isAnonymous: false,
    employeeId: 'emp-5',
    employeeName: 'نور حسن',
    department: 'مراقبة الجودة',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    resolvedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    comments: [
      {
        id: 'c2',
        text: 'تم التعاقد مع شركة صيانة لتحسين التهوية',
        authorId: 'emp-3',
        authorName: 'سارة خالد',
        authorRole: 'hr',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
    ],
    timeline: [
      { id: 't4', event: 'تم الإنشاء', description: 'تم رفع المشكلة', timestamp: new Date(Date.now() - 86400000 * 7).toISOString(), actor: 'نور حسن', type: 'created' },
      { id: 't5', event: 'قيد المعالجة', description: 'تم التعاقد مع شركة صيانة', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), actor: 'سارة خالد', type: 'updated' },
      { id: 't6', event: 'تم الحل', description: 'تم تركيب أجهزة التهوية الجديدة', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), actor: 'النظام', type: 'resolved' },
    ],
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'notif-1',
    title: 'تم تسجيل دخول جديد',
    message: 'تم تسجيل دخولك إلى النظام بنجاح',
    type: 'info',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-2',
    title: 'مشكلة جديدة',
    message: 'تم رفع مشكلة جديدة في قسم الإنتاج',
    type: 'warning',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif-3',
    title: 'تم حل المشكلة',
    message: 'تم حل مشكلة تحسين بيئة العمل',
    type: 'success',
    read: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export const mockWellnessData: WellnessData[] = [
  { date: new Date(Date.now() - 86400000 * 6).toISOString().slice(0, 10), score: 85, mood: 'great', stress: 3, energy: 8 },
  { date: new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10), score: 72, mood: 'good', stress: 5, energy: 7 },
  { date: new Date(Date.now() - 86400000 * 4).toISOString().slice(0, 10), score: 60, mood: 'neutral', stress: 7, energy: 5 },
  { date: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10), score: 78, mood: 'good', stress: 4, energy: 7 },
  { date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10), score: 90, mood: 'great', stress: 2, energy: 9 },
  { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), score: 68, mood: 'neutral', stress: 6, energy: 6 },
  { date: new Date().toISOString().slice(0, 10), score: 82, mood: 'good', stress: 4, energy: 8 },
];

export const mockAnalytics: Analytics = {
  totalEmployees: 45,
  activeProblems: 2,
  resolvedThisMonth: 15,
  avgResolutionTime: 3.5,
  wellnessScore: 76,
  satisfactionRate: 82,
  departmentStats: [
    { name: 'إنتاج', employeeCount: 15, problemCount: 5, resolvedCount: 4, wellnessAvg: 75, satisfactionScore: 80 },
    { name: 'مراقبة الجودة', employeeCount: 8, problemCount: 2, resolvedCount: 2, wellnessAvg: 80, satisfactionScore: 85 },
    { name: 'المبيعات', employeeCount: 10, problemCount: 3, resolvedCount: 2, wellnessAvg: 70, satisfactionScore: 78 },
    { name: 'الموارد البشرية', employeeCount: 5, problemCount: 1, resolvedCount: 1, wellnessAvg: 82, satisfactionScore: 88 },
    { name: 'المالية', employeeCount: 7, problemCount: 4, resolvedCount: 3, wellnessAvg: 72, satisfactionScore: 75 },
  ],
  monthlyTrend: [
    { month: 'يناير', problems: 8, resolved: 6 },
    { month: 'فبراير', problems: 6, resolved: 5 },
    { month: 'مارس', problems: 10, resolved: 8 },
    { month: 'أبريل', problems: 7, resolved: 7 },
    { month: 'مايو', problems: 5, resolved: 4 },
    { month: 'يونيو', problems: 9, resolved: 7 },
  ],
  categoryBreakdown: [
    { category: 'technical', count: 15, percentage: 30 },
    { category: 'hr', count: 8, percentage: 16 },
    { category: 'salary', count: 10, percentage: 20 },
    { category: 'workplace', count: 12, percentage: 24 },
    { category: 'management', count: 5, percentage: 10 },
  ],
  severityBreakdown: [
    { severity: 'low', count: 10 },
    { severity: 'medium', count: 20 },
    { severity: 'high', count: 12 },
    { severity: 'critical', count: 8 },
  ],
};

export const mockAuditLogs: AuditLog[] = [
  {
    id: 'audit-1',
    action: 'تسجيل دخول',
    actor: 'مستخدم تجريبي',
    actorRole: 'admin',
    target: 'النظام',
    details: 'تم تسجيل الدخول إلى النظام',
    timestamp: new Date().toISOString(),
    ipAddress: '192.168.1.1',
  },
  {
    id: 'audit-2',
    action: 'إضافة مشكلة',
    actor: 'أحمد محمد',
    actorRole: 'employee',
    target: 'مشكلة في نظام الحضور',
    details: 'تم إضافة مشكلة جديدة',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    ipAddress: '192.168.1.2',
  },
  {
    id: 'audit-3',
    action: 'حل مشكلة',
    actor: 'سارة خالد',
    actorRole: 'hr',
    target: 'تحسين بيئة العمل',
    details: 'تم حل المشكلة بعد تركيب أجهزة التهوية',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    ipAddress: '192.168.1.3',
  },
  {
    id: 'audit-4',
    action: 'تعديل بيانات',
    actor: 'مستخدم تجريبي',
    actorRole: 'admin',
    target: 'إعدادات النظام',
    details: 'تم تعديل إعدادات الصفحة الرئيسية',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    ipAddress: '192.168.1.1',
  },
  {
    id: 'audit-5',
    action: 'إضافة موظف',
    actor: 'مستخدم تجريبي',
    actorRole: 'admin',
    target: 'قسم المبيعات',
    details: 'تم إضافة موظف جديد إلى قسم المبيعات',
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    ipAddress: '192.168.1.1',
  },
];