# 📋 ملخص مشروع Kyvzon Platform 🏥

## 🆔 الهوية
| المعلومة | القيمة |
|---|---|
| **اسم المشروع** | Kyvzon Platform |
| **الشركة** | شركة Kyvzon - - |
| **السيرفر** | `npm run dev` → `http://localhost:5173` |
| **المستودع** | `https://github.com/Kararyousef1/-Al-Rafidain.git` |

---

## 🛠️ التقنيات المستخدمة (Tech Stack)

### الواجهة الأمامية (Frontend)
| التقنية | الإصدار | الاستخدام |
|---|---|---|
| React | ^18.3.1 | المكتبة الرئيسية |
| TypeScript | ^5.5.3 | لغة البرمجة |
| Vite | ^5.4.2 | أداة البناء والتطوير |
| Tailwind CSS | ^3.4.0 | التصميم والتنسيق |
| Zustand | ^4.5.4 | إدارة الحالة (Store) |
| React Router DOM | ^6.26.0 | التوجيه والتنقل |
| React Query | ^5.56.0 | إدارة البيانات من API |
| Framer Motion | ^11.5.4 | الحركات والأنيميشن |
| Recharts | ^2.12.7 | الرسوم البيانية |
| Lucide React | ^0.446.0 | الأيقونات |
| React Hook Form | ^7.53.0 | النماذج |
| Zod | ^3.23.8 | التحقق من البيانات |
| date-fns | ^3.6.0 | التعامل مع التواريخ |
| React Hot Toast | ^2.4.1 | الإشعارات المنبثقة |
| Axios | ^1.7.7 | طلبات HTTP |
| clsx / tailwind-merge | - | دمج Class Names |

### قاعدة البيانات والخدمات
| التقنية | الاستخدام |
|---|---|
| **Supabase** | قاعدة البيانات PostgreSQL + المصادقة |
| **Supabase Auth** | تسجيل الدخول وإدارة الجلسات |
| **Supabase Realtime** | الاشتراكات المباشرة (Live Updates) |
| **Supabase Storage** | رفع الصور والملفات |
| **Edge Functions** | دوال خلفية (Deno) |
| **Python** | السكريبتات الخلفية (ZKteco sync, Analytics) |

### الاختبارات
| التقنية | الاستخدام |
|---|---|
| Vitest | إطار الاختبارات |
| Testing Library | اختبارات React |
| JSDOM | محاكاة المتصفح |

---

## 📂 هيكل المشروع الكامل

### 1️⃣ الصفحات (Pages) - `/src/pages/`

#### 📄 الصفحات العامة (Public)
| الملف | الوظيفة |
|---|---|
| `LandingPage.tsx` | الصفحة الترحيبية للشركة (مع منتجات، إحصائيات، قسم التسويق) |
| `DisclaimerPage.tsx` | صفحة إخلاء المسؤولية |
| `SystemGuide.tsx` | دليل استخدام النظام |
| `NotificationsPage.tsx` | صفحة الإشعارات العامة |
| `MyNotificationsPage.tsx` | إشعارات المستخدم الشخصية |

#### 🔐 المصادقة (Auth)
| الملف | الوظيفة |
|---|---|
| `LoginPage.tsx` | صفحة تسجيل الدخول (بالإيميل أو اسم المستخدم) |

#### 👤 الموظف (Employee) - 17 صفحة
| الملف | معرف التنقل (activeView) | الوظيفة |
|---|---|---|
| `EmployeeDashboard.tsx` | `employee-dashboard` | لوحة تحكم الموظف الرئيسية |
| `ProblemsList.tsx` | `employee-problems` | قائمة المشاكل المرفوعة |
| `ProblemDetail.tsx` | `problem-detail-{id}` | تفاصيل مشكلة معينة |
| `NewProblemPage.tsx` | `new-problem` | رفع مشكلة جديدة |
| `WellnessPage.tsx` | `employee-wellness` | الصحة النفسية |
| `AIChatPage.tsx` | `employee-ai-chat` | محادثة مع الذكاء الاصطناعي |
| `SurveyPage.tsx` | `employee-survey` | الاستبيانات |
| `ProfilePage.tsx` | `employee-profile` | الملف الشخصي |
| `ContactPage.tsx` | `employee-contact` | التواصل مع HR |
| `TrainingPage.tsx` | `employee-training` | التدريب والتطوير |
| `SOPsPage.tsx` | `employee-sops` | إجراءات العمل (SOPs) |
| `AttendancePage.tsx` | - | صفحة الحضور (متصلة بـ Supabase) |
| `MyAttendancePage.tsx` | `employee-attendance` | حضوري الشخصي |
| `LeaveRequestPage.tsx` | `employee-leave-requests` | طلب إجازة |
| `PermissionsPage.tsx` | `employee-permissions` | طلب زمنية |
| `AIInsightsDashboard.tsx` | `admin-ai-insights`, `hr-ai-insights` | تحليلات الذكاء الاصطناعي |

#### 👥 الموارد البشرية (HR) - 13 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `HRDashboard.tsx` | `hr-dashboard` | لوحة تحكم HR (620 سطر - رسوم بيانية، مؤشرات KPIs) |
| `AnalyticsPage.tsx` | `hr-analytics` | التحليلات المتقدمة |
| `TeamPage.tsx` | `hr-team` | إدارة فريق العمل |
| `ReportsPage.tsx` | `hr-reports` | التقارير |
| `AttendancePage.tsx` | `hr-attendance` | سجلات الحضور |
| `GatekeeperPage.tsx` | `hr-movements` | بوابة الحركة |
| `HRCommunicationPage.tsx` | `hr-communication` | صندوق البريد |
| `HRMovementAnalyticsPage.tsx` | `hr-movement-analysis` | تحليل الحركة |
| `MovementAnalysisPage.tsx` | - | تحليل الحركة (إصدار آخر) |
| `KioskPage.tsx` | `kiosk-mode` | وضع الكشك (للحضور والانصراف) |
| `TalentMarketPage.tsx` | `hr-talent-market` | سجل المؤهلات والمواهب |
| `TrainingManagementPage.tsx` | `hr-manage-training` | إدارة الدورات التدريبية |
| `TrainingReportsPage.tsx` | `hr-training-reports` | تقارير التدريب |

#### 🔧 الإدارة (Admin) - 11 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `AdminDashboard.tsx` | `admin-dashboard` | لوحة تحكم الإدارة |
| `AdminEmployeesPage.tsx` | `admin-employees` | إدارة الموظفين (CRUD) |
| `AdminPermissionsTree.tsx` | `admin-permissions` | شجرة الصلاحيات |
| `AdminGatekeeperPermissions.tsx` | `admin-gatekeeper-permissions` | صلاحيات المدراء والمشرفين |
| `AdminLandingPageCMS.tsx` | `admin-cms` | إدارة صفحة الزوار (CMS متكامل) |
| `AdminSOPsPage.tsx` | `admin-sops` | إدارة إجراءات SOP |
| `AdminSOPsReport.tsx` | `admin-sops-reports` | تقارير SOPs |
| `SettingsPage.tsx` | `admin-settings` | إعدادات النظام |
| `AuditLogPage.tsx` | `admin-audit-log` | سجل العمليات (Audit Log) |
| `AIConfigPage.tsx` | `admin-ai-config` | إعداد الذكاء الاصطناعي |
| `OrgStructurePage.tsx` | - | هيكل التنظيم |

#### 🚪 بوابة الحراسة (Gatekeeper) - 1 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `GatekeeperPage.tsx` | `gatekeeper-portal` | بوابة تسجيل حركة الموظفين والزوار |
| `gatekeeper.css` | - | ستايلات مخصصة لصفحة الحارس |

#### 👑 المشرف (Supervisor) - 1 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `SupervisorBreaksPage.tsx` | `supervisor-breaks` | توقيع خروج الموظفين (Break Sign-out) |

#### 📊 المدير (Manager) - 1 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `ManagerAttendancePage.tsx` | `manager-attendance` | حضور فريقي |

#### 💻 المطور (Developer) - 1 صفحة
| الملف | معرف التنقل | الوظيفة |
|---|---|---|
| `StructureManager.tsx` | `developer-structure` | هيكلية النظام |

---

### 2️⃣ المكونات (Components) - `/src/components/`

#### 🎨 المكونات العامة (ui/)
| الملف | الوظيفة |
|---|---|
| `Badge.tsx` | علامة/شارة (مع ألوان حسب النوع) |
| `Button.tsx` | زر قابل لإعادة الاستخدام (مع حالات التحميل والتعطيل) |
| `Card.tsx` | بطاقة مع Header و Title |
| `Input.tsx` | حقل إدخال مع Label وخطأ |
| `Modal.tsx` | نافذة منبثقة (Modal) |
| `Toast.tsx` | مكون الإشعارات المنبثقة |
| `QuizEditor.tsx` | محرر الاختبارات (أسئلة متعددة) |
| `RichContentEditor.tsx` | محرر نصوص متقدم |
| `RichContentViewer.tsx` | عرض النصوص المتقدمة |
| `SOPFormModal.tsx` | نموذج إضافة/تعديل SOP |
| `TrainingTimer.tsx` | مؤقت للدورات التدريبية |

#### 🖥️ مكونات لوحة التحكم (dashboard/)
| الملف | الوظيفة |
|---|---|
| `DashboardContent.tsx` | المحتوى الرئيسي للوحة التحكم |
| `DeveloperDashboard.tsx` | لوحة تحكم المطور (Service Cards, Monitor, PinGate) |
| `Header.tsx` | الهيدر العلوي (بحث، إشعارات، مستخدم) |
| `NotificationBell.tsx` | جرس الإشعارات مع عداد |
| `Sidebar.tsx` | الشريط الجانبي مع قوائم ديناميكية (291 سطر) |
| `WelcomeModal.tsx` | نافذة ترحيب للمستخدمين الجدد |

#### 🔧 مكونات المطور (dashboard/developer/)
| الملف | الوظيفة |
|---|---|
| `BiometricSettings.tsx` | إعدادات البصمة (ZKTeco) |
| `ErrorBoundary.tsx` | حدود الأخطاء (Error Boundary) |
| `index.ts` | تصدير المكونات |
| `PinGate.tsx` | بوابة PIN للدخول |
| `ServiceCard.tsx` | بطاقة خدمة (Smart Dashboard) |
| `SmartDashboard.tsx` | لوحة تحكم ذكية |
| `StatCard.tsx` | بطاقة إحصائية |
| `StructureManager.tsx` | مدير هيكلية النظام |
| `SystemMonitor.tsx` | مراقبة النظام |

---

### 3️⃣ طبقة الخدمات (SDK) - `/src/sdk/`

| الملف | الوظيفة |
|---|---|
| `index.ts` | نقطة التصدير الموحدة لكل الخدمات |
| `supabase.ts` | عميل Supabase الأساسي (Anon Key) |
| `supabaseAdmin.ts` | عميل Supabase المسؤول (Service Role Key) |
| `auth.ts` | المصادقة (301 سطر): login, logout, createUser, updateUser, deleteUser, getUserProfile |
| `employees.ts` | إدارة بيانات الموظفين |
| `attendance.ts` | سجلات الحضور والبصمات |
| `settings.ts` | إعدادات النظام |
| `reports.ts` | التقارير والتحليلات |

### 4️⃣ إدارة الحالة (Store) - `/src/store/index.ts`

**ثلاثة مخازن رئيسية (Zustand):**

#### `useAuthStore` - المصادقة
- `user: User | null` - بيانات المستخدم الحالي
- `isAuthenticated: boolean` - حالة المصادقة
- `loading: boolean` - حالة التحميل
- `initialize()` - تهيئة الجلسة (تتحقق من localStorage ثم Supabase Session)
- `login(email, password)` - تسجيل الدخول
- `loginLocal(username, role, fullName)` - دخول محلي (بدون قاعدة بيانات)
- `logout()` - تسجيل الخروج
- `updateUser(data)` - تحديث بيانات المستخدم
- `refreshUser()` - إعادة تحميل بيانات المستخدم من Supabase
- Realtime subscription على جدول `profiles` للتحديثات المباشرة

#### `useProblemStore` - المشاكل
- `problems: Problem[]` - قائمة المشاكل (تبدأ من mockData)
- `addProblem()`, `updateProblem()`, `deleteProblem()` - CRUD
- `addComment()` - إضافة تعليق لمشكلة

#### `useUIStore` - واجهة المستخدم (مع persist للتخزين المحلي)
- `sidebarOpen`, `activeView` - حالة الشريط الجانبي والتنقل
- `landingConfig: LandingConfig` - إعدادات صفحة الزوار (مع persist)
- `notifications`, `wellnessData`, `chatMessages`, `auditLogs`, `employees`, `analytics`
- `fetchLandingConfig()` - جلب إعدادات الصفحة من Supabase
- `saveLandingConfig()` - حفظ الإعدادات مع RLS fallback
- `uploadImage()` - رفع الصور إلى Supabase Storage
- `markNotificationRead()`, `markAllRead()` - إدارة الإشعارات
- `addWellnessEntry()`, `addChatMessage()`, `clearChat()` - بيانات المستخدم

### 5️⃣ الأنواع (Types) - `/src/types/`

#### `index.ts` - الأنواع الرئيسية (188 سطر)
```typescript
// الأدوار السبعة
UserRole = 'employee' | 'hr' | 'admin' | 'gatekeeper' | 'developer' | 'supervisor' | 'manager'

// الرتب
Rank = 'executive' | 'manager' | 'supervisor' | 'employee'

// أقسام التصنيع
ManufacturingDept = 'syrups' | 'tablets' | 'ointments' | 'powders' | 'management' | 'hr' | 'it'

// نوع الحارس
GatekeeperType = 'employee_movement' | 'visitor_movement' | 'both'

// الواجهات الرئيسية
User, Problem, Comment, TimelineEvent, AIAnalysis,
WellnessData, Notification, Survey, SurveyQuestion,
DepartmentStats, Analytics, ChatMessage, AuditLog, Employee
```

ملاحظات مهمة عن `User`:
- `full_name` هو الحقل المعتمد في قاعدة البيانات (Supabase)
- `name` يبقى اختيارياً للتوافق القديم
- `profile_image` هو الحقل المعتمد للصورة، `avatar` للتوافق القديم
- `permissions?: string[]` صلاحيات ديناميكية للشريط الجانبي
- `gatekeeper_pin?: string` الرمز السري للحارس (3 أرقام)

#### ملفات الأنواع الأخرى
| الملف | المحتوى |
|---|---|
| `api.ts` | أنواع API |
| `database.ts` | أنواع قاعدة البيانات |
| `gatekeeper.ts` | أنواع بوابة الحراسة |
| `landing.ts` | LandingConfig, LandingVideo, LandingProduct, LandingNavLink, LandingStat |
| `media.ts` | أنواع الوسائط |
| `quiz.ts` | أنواع الاختبارات |
| `sops.ts` | أنواع إجراءات العمل |

### 6️⃣ الثوابت (Constants)

#### `permissions.ts` - نظام الصلاحيات الموحد ⚠️
**المصدر الوحيد للصلاحيات في النظام بأكمله!**

| الدالة | الوظيفة |
|---|---|
| `PERMISSION_KEYS` | قائمة جميع مفاتيح الصلاحيات (32 مفتاح) |
| `DEFAULT_ROLE_PERMISSIONS` | الصلاحيات الافتراضية لكل دور |
| `getEffectivePermissions(role, dbPermissions)` | دمج الصلاحيات الافتراضية مع المخصصة من DB |
| `hasPermission(userPermissions, permissionKey)` | التحقق من صلاحية محددة |

الصلاحيات لكل دور:

| الدور | الصلاحيات |
|---|---|
| **employee** | dashboard, problems, wellness, survey, training, sops, ai-chat, contact, profile, notifications, my-attendance, my-leave-requests, employee-permissions, employee-leaves |
| **supervisor** | dashboard, problems, team, reports, supervisor-breaks, profile, my-attendance, my-leave-requests, notifications, attendance, leave-requests, employee-permissions, employee-leaves |
| **manager** | supervisor's permissions + analytics, manager-attendance |
| **hr** | dashboard, movement-analysis, problems, analytics, team, talent-market, communication, reports, notifications, attendance, leave-requests, manage-training, training-reports |
| **gatekeeper** | gatekeeper-portal, notifications |
| **admin** | كل الصلاحيات: cms, employees, permissions, gatekeeper-permissions, reports, settings, audit-log, sops, ai-config, attendance, leave-requests |
| **developer** | developer-dashboard, developer-attendance, developer-logs, developer-db, developer-structure, notifications, dashboard, attendance, leave-requests |

#### `notificationTypes.ts` - أنواع الإشعارات

### 7️⃣ المكتبات المساعدة

#### `utils/` - الوظائف المساعدة
| الملف | الوظيفة | الأسطر |
|---|---|---|
| `cn.ts` | دمج Class Names مع Tailwind | بسيط |
| `shiftUtils.ts` | ⭐ **منطق الورديات والحضور الكامل** | 1008 سطر |
| `leaveUtils.ts` | منطق الإجازات والرصيد | - |
| `exportToExcel.ts` | التصدير إلى Excel | - |

**`shiftUtils.ts` بالتفصيل:**
- أنواع: ShiftType (صباحي، مسائي، ليلي)، AttendanceStatus (8 حالات)، PermissionType (4 أنواع)
- إعدادات الورديات الافتراضية: DEFAULT_SHIFT_TIMINGS, DEFAULT_SHIFT_WINDOWS
- سياسة الشركة الافتراضية (Overtime, Late policies)
- دوال: determineShift, calculateLateMinutes, calculateEarlyLeaveMinutes, calculateOvertimeMinutes
- determineAttendanceStatus (المنطق الصارم للحضور)
- STATUTS_COLORS, STATUS_LABELS لكل حالة
- createAttendanceSummary, createBulkAttendanceSummaries
- تقارير المدير: generateEmployeeReport, generateTeamReports, getTeamQuickStats
- تصدير CSV: attendanceToCSVRows, generateCSV, downloadCSV
- Daily Stats Dashboard

#### `lib/` - الخدمات
| الملف | الوظيفة |
|---|---|
| `supabase.ts` | إعادة تصدير من SDK (للتوافق القديم) |
| `supabase.ts` (مكرر) | عميل Supabase |
| `supabaseAdmin.ts` | عميل المسؤول |
| `securityService.ts` | الخدمات الأمنية |
| `aiService.ts` | خدمة الذكاء الاصطناعي |
| `quizAiService.ts` | AI للاختبارات |
| `notificationManager.ts` | مدير الإشعارات |
| `notificationService.ts` | خدمة الإشعارات |
| `attendanceNotificationService.ts` | إشعارات الحضور |
| `notificationHelpers.ts` | مساعدات الإشعارات |
| `useNotificationIntegration.ts` | دمج الإشعارات |
| `leaveAttendanceLink.ts` | ربط الإجازات مع الحضور |
| `utils.ts` | دوال عامة |

---

## 🗄️ قاعدة البيانات (Database)

### الجداول (19 جدول)
| الجدول | الوظيفة | ملاحظات |
|---|---|---|
| `employees` | الموظفين (يمتد من auth.users) | UUID, employee_code فريد, user_id يشير لـ auth.users |
| `departments` | الأقسام | هيكل شجري (parent_department_id) |
| `attendance_logs` | سجلات البصمات | unique_employee_punch |
| `attendance_summary` | ملخص الحضور اليومي | unique_employee_shift_date |
| `permissions` | الزمنيات (Permissions) | قيد الاستخدام |
| `permissions_request` | طلبات الزمنيات | جديد - مع triggers |
| `leaves` | الإجازات | 8 أنواع مع التحقق من التواريخ |
| `leave_balance` | رصيد الإجازات | أعمدة محسوبة (GENERATED ALWAYS) |
| `leave_settings` | إعدادات الإجازات | لكل نوع إجازة |
| `holidays` | العطل الرسمية | مع recurring option |
| `overtime_log` | سجل الأوفرتايم | مع تحويل لزمنية |
| `notifications` | الإشعارات | مرتبطة بـ auth.users |
| `ai_insights` | تحليلات AI | 4 أنواع (حضور، شذوذ، تنبؤ، قسم) |
| `system_settings` | إعدادات النظام | singleton pattern |
| `audit_log` | سجل التدقيق | لكل عملية على الجداول الهامة |
| `sync_log` | سجل المزامنة | مع أجهزة البصمة |
| `export_logs` | سجل التصدير | Excel و PDF |
| `profiles` | ملفات تعريف المستخدمين | للمزامنة الأمامية |
| `employee_skills` | مهارات الموظفين | - |

### الأنواع المخصصة (ENUMs) - 11 نوع
- shift_type_enum, verification_type_enum, source_enum
- attendance_status_enum (8 حالات)
- permission_type_enum (4 أنواع), permission_status_enum
- leave_type_enum (9 أنواع), leave_status_enum
- notification_type_enum (7 أنواع)
- insight_type_enum (5 أنواع), scope_enum, severity_enum, applies_to_enum

### الدوال (Functions) - 12+ دالة
| الدالة | الوظيفة |
|---|---|
| `update_updated_at_column()` | تحديث updated_at تلقائياً (Trigger Function) |
| `calculate_working_days(date_from, date_to)` | حساب أيام العمل الفعلية (تستثني الجمعة والعطل) |
| `determine_shift(punch_time)` | تحديد الوردية من وقت البصمة |
| `calculate_annual_leave_balance(employee_id, year)` | حساب رصيد الإجازة السنوية |
| `update_leave_balance()` | تحديث رصيد الإجازات عند إنشاء طلب |
| `log_audit()` | تسجيل التغييرات (SECURITY DEFINER) |
| `refresh_attendance_summary(employee_id, shift_date)` | تحديث ملخص الحضور (مع منطق صارم) |
| `on_attendance_log_insert()` | Trigger لتحديث الملخص تلقائياً |
| `check_hajj_eligibility(employee_id)` | التحقق من أهلية إجازة الحج |
| `create_notification(...)` | إنشاء إشعار تلقائي (SECURITY DEFINER) |
| `sync_adms_punch(...)` | مزامنة البصمات من ADMS |

### المشغلات (Triggers) - 16+
- update_*_updated_at لكل جدول رئيسي
- trigger_update_leave_balance على جدول leaves
- trigger_refresh_summary_on_log على attendance_logs
- audit_employees, audit_attendance_summary, audit_permissions, audit_leaves, إلخ

---

## 🔄 نظام التنقل (Routing)

يتم التنقل عبر `activeView` في `useUIStore`، وليس React Router!

**كيف يعمل؟**
1. `Sidebar.tsx` يحتوي على قائمة `navItems` مع:
   - `id`: معرف التنقل (activeView)
   - `roles`: الأدوار المسموح لها
   - `permKey`: مفتاح الصلاحية
2. عند النقر على عنصر في الشريط الجانبي → `setActiveView(id)`
3. `PageRenderer` في `App.tsx` يقرر أي صفحة يعرضها بناءً على `activeView`

**التحقق من الصلاحيات في Sidebar:**
```typescript
const canView = (item: NavItem) => {
  if (user?.permissions && user.permissions.length > 0) {
    if (item.permKey) return hasPermission(user.permissions, item.permKey);
    return item.roles.includes(user?.role || 'employee');
  }
  return item.roles.includes(user?.role || 'employee');
};
```

---

## 📊 نظام الورديات (متكامل)

### 3 ورديات
```
صباحي: 08:00 - 16:00 (نافذة بصمة: 06:00 - 10:00)
مسائي: 16:00 - 00:00 (نافذة بصمة: 14:00 - 18:00)
ليلي: 00:00 - 08:00 (نافذة بصمة: 22:00 - 02:00)
```

### 8 حالات حضور
1. ✅ **حضور_بوقت** - أخضر (22C55E)
2. ⏰ **متأخر** - أصفر (EAB308)
3. ✅ **زمنية_معتمدة** - أزرق (3B82F6)
4. ⏳ **زمنية_انتظار** - أصفر (EAB308)
5. 🏖️ **مجاز** - بنفسجي (A855F7)
6. ⏳ **إجازة_انتظار** - أصفر (EAB308)
7. ❌ **غائب** - أحمر (EF4444)
8. 🏖️ **عطلة** - رمادي (9CA3AF)

### منطق الحضور الصارم
```
لم يبصم:
  - يوم الجمعة/عطلة → عطلة
  - لديه إجازة موافق عليها → مجاز
  - لديه إجازة معلقة → إجازة_انتظار
  - وإلا → غائب

بصم:
  - تأخير > 0:
    - معتمد (خروج مبكر + زمنية معتمدة) → زمنية_معتمدة
    - معلق (خروج مبكر + زمنية معلقة) → زمنية_انتظار
    - خروج مبكر بدون زمنية → متأخر
    - وإلا → متأخر
  - لا تأخير:
    - خروج مبكر بدون زمنية → متأخر
    - خروج مبكر مع زمنية معتمدة → زمنية_معتمدة
    - وإلا → حضور_بوقت
```

---

## 🔐 المصادقة

### آلية تسجيل الدخول
1. `initialize()` → تتحقق من `localStorage.getItem('user')` أولاً (للدخول المحلي)
2. إذا لا يوجد، تتحقق من `supabase.auth.getSession()`
3. إذا وجدت جلسة → تجلب `profiles` ثم `employees` كـ fallback
4. تشترك في Realtime channel لتحديثات الـ profile

### أنواع المستخدمين
| الدور | الصلاحيات الأساسية |
|---|---|
| **employee** | بوابته الخاصة (مشاكله، صحته، استبياناته، تدريبه) |
| **supervisor** | إشراف على فريقه (توقيع خروج، إجازات) |
| **manager** | إدارة (تقارير، تحليلات، حضور فريقه) |
| **hr** | كل شيء (موظفين، حضور، إجازات، تحليلات، تقارير) |
| **gatekeeper** | فقط بوابة الحراسة |
| **admin** | كل شيء (إدارة، صلاحيات، إعدادات، CMS) |
| **developer** | أدوات المطور (DB، logs، structure، errors) |

---

## 🧪 Mock Data

النظام يستخدم `mockData` من `/src/data/dev/mockData.ts` خاصة عند الدخول المحلي (بدون قاعدة بيانات).
المستخدمون المحليون يُخزنون في `localStorage`.

---

## ⚡ الميزات الرئيسية

| الميزة | الحالة |
|---|---|
| 🏥 نظام حضور ثلاثي الورديات | ✅ مكتمل |
| 👆 بصمات ZKTeco مع Py**thon sync** | ✅ مكتمل |
| 📋 طلبات إجازات (8 أنواع) مع رصيد | ✅ مكتمل |
| 🕐 الزمنيات (4 أنواع) مع موافقات | ✅ مكتمل |
| 🚪 بوابة الحراسة (Gatekeeper) | ✅ مكتمل |
| 🤖 AI Chat للموظفين | ✅ مكتمل |
| 📊 تحليلات ورسوم بيانية (Recharts) | ✅ مكتمل |
| 💬 تواصل مع HR | ✅ مكتمل |
| 🧠 الصحة النفسية | ✅ مكتمل |
| 📝 الاستبيانات | ✅ مكتمل |
| 📚 التدريب والتطوير مع Timer | ✅ مكتمل |
| 📋 إجراءات SOP | ✅ مكتمل |
| 🔒 نظام صلاحيات متكامل (شجرة) | ✅ مكتمل |
| 📱 CMS للصفحة الترحيبية | ✅ مكتمل |
| ℹ️ Audit Log (سجل التدقيق) | ✅ مكتمل |
| 🎯 AI Insights وتحليلات | ✅ مكتمل |
| 🔔 إشعارات Realtime | ✅ مكتمل |
| 🌍 دعم كامل للغة العربية (RTL) | ✅ مكتمل |

---

## ⚠️ تنبيهات مهمة جداً للمطور

### 1. ❌ لا تلمس الملفات التالية إلا للضرورة القصوى
- `src/constants/permissions.ts` - المصدر الوحيد للصلاحيات
- `src/types/index.ts` - أنواع البيانات الأساسية
- `src/store/index.ts` - حالة التطبيق المركزية
- `src/App.tsx` - التوجيه الرئيسي

### 2. ✅ مسار التطوير الصحيح
- إضافة صفحات جديدة → `/src/pages/`
- إضافة مكونات → `/src/components/`
- إضافة خدمات → `/src/sdk/` (عزل قاعدة البيانات)
- أي تغيير في قاعدة البيانات → عبر `database/schema.sql` ثم الترحيل

### 3. 🔄 التوافق مع قاعدة البيانات
- `profiles` هو المصدر الأساسي للواجهة الأمامية
- `employees` هو مصدر المزامنة الخلفي
- الـ SDK (`sdk/`) يعزل الكود الأمامي عن قاعدة البيانات
- إذا تغيرت قاعدة البيانات، **تغير فقط ملفات SDK**

### 4. 📦 Mock Data
- ملف `src/data/dev/mockData.ts` يحتوي بيانات وهمية للتطوير
- `src/data/mockData.ts` (مكرر) للاستخدام العام
- الدخول المحلي (`loginLocal`) لا يتطلب قاعدة بيانات

### 5. ⚠️ RLS (Row Level Security)
- بعض العمليات مثل `system_settings` قد تخطئ بسبب RLS
- النظام يستخدم fallback للدخول المحلي إذا فشلت عمليات Supabase

### 6. 📁 اللغات والاتجاه
- التطبيق كامل باللغة العربية
- الاتجاه: RTL (`dir="rtl"`)
- الخطوط: Tajawal, Cairo

### 7. 📖 أسماء الجداول والمفاتيح
- `activeView` = معرف الصفحة النشطة
- `permKey` = مفتاح الصلاحية (في sidebar)
- `PKEY` (في admin page) = مفتاح الصلاحية لإدارة الصلاحيات

### 8. 💾 ملفات البيانات (Data Files)
- `src/data/dev/mockData.ts` - بيانات وهمية للمطورين
- `src/data/mockData.ts` - نسخة عامة

### 9. 📄 ملفات التوثيق
- `REPORT.md`, `IMPROVEMENTS.md`, `IMPROVEMENTS_SUMMARY.md`
- `NOTIFICATIONS.md`, `NOTIFICATIONS_INTEGRATION_PLAN.md`
- `FIXES_APPLIED.md`, `SUMMARY_FIXES.md`, `CLEANUP_SUMMARY.md`

---

## 📜 الملفات الخارجية

| الملف | الوظيفة |
|---|---|
| `index.html` | نقطة الدخول HTML |
| `package.json` | الاعتماديات |
| `vite.config.ts` | إعدادات Vite |
| `tailwind.config.js` | إعدادات Tailwind |
| `tsconfig.json` | إعدادات TypeScript |
| `postcss.config.js` | إعدادات PostCSS |
| `vitest.config.ts` | إعدادات Vitest |
| `netlify.toml` | إعدادات نشر Netlify |
| `.env.example` | مثال المتغيرات البيئية |

## 🐍 سكريبتات Python
| الملف | الوظيفة |
|---|---|
| `scripts/attendanceAnalytics.py` | تحليلات الحضور |
| `scripts/zkteco_sync.py` | مزامنة أجهزة ZKTeco |
| `scripts/README.md` | توثيق السكريبتات |
| `scripts/database-fixes/` | إصلاحات قاعدة البيانات |
| `run_fix_sql.py` | تشغيل إصلاحات SQL |

---

**📌 تم إعداد هذا التوثيق لفهم المشروع بالكامل.**
**التاريخ:** 17 يونيو 2026