# Kyvzon Platform

**منصة موارد بشرية متعددة الشركات (Multi-tenant HR SaaS)** — React + TypeScript + Supabase.

[![Quality Gate](https://img.shields.io/badge/CI-passing-brightgreen)]() [![Tests](https://img.shields.io/badge/tests-246%2F246-brightgreen)]() [![Migrations](https://img.shields.io/badge/migrations-16-blue)]() [![Coverage](https://img.shields.io/badge/coverage-74%25-green)]()

---

## 🚀 البدء السريع

### للمطورين
```bash
git clone https://github.com/Kararyousef1/Kyvzon-.git
cd Kyvzon-
npm ci
cp .env.example .env.local
# املأ .env.local بمفاتيح Supabase (لا تلتزمها في git)
npm run dev
```

### للنشر الإنتاجي
اقرأ **[docs/OPERATIONS_RUNBOOK_AR.md](docs/OPERATIONS_RUNBOOK_AR.md)** — دليل خطوة بخطوة.

---

## 📚 هيكل الوثائق

### أساسي (اقرأ أولاً)
| الملف | متى تقرأه؟ |
|---|---|
| [docs/OPERATIONS_RUNBOOK_AR.md](docs/OPERATIONS_RUNBOOK_AR.md) | 🚀 قبل أي نشر إنتاجي |
| [docs/DATABASE_ARCHITECTURE.md](docs/DATABASE_ARCHITECTURE.md) | 🗃️ لفهم schema + RLS + Multi-tenancy |
| [supabase/migrations/README.md](supabase/migrations/README.md) | 🔧 لإعداد قاعدة بيانات جديدة |
| [docs/EDGE_FUNCTIONS_DEPLOYMENT.md](docs/EDGE_FUNCTIONS_DEPLOYMENT.md) | 🔐 لنشر Edge Functions |

### قرارات معمارية (ADRs)
- [ADR-0001: Record architecture decisions](docs/adr/0001-record-architecture-decisions.md)
- [ADR-0002: SDK Layer Architecture](docs/adr/0002-sdk-layer-architecture.md)
- [ADR-0003: Multi-tenancy Strategy](docs/adr/0003-multi-tenancy-strategy.md)
- [ADR-0004: Observability Strategy](docs/adr/0004-observability-strategy.md)
- [ADR-0005: Component Ownership Model](docs/adr/0005-component-ownership-model.md)
- [ADR-0006: Error Handling & Logging](docs/adr/0006-error-handling-logging-strategy.md)

### تقارير المراحل (تاريخي — للمرجعية)
- [SQL Remediation](docs/SQL_REMEDIATION_COMPLETION_REPORT_AR.md)
- [RLS Isolation Tests](docs/RLS_ISOLATION_TEST_REPORT_AR.md)
- [SDK Cleanup](docs/SDK_CLEANUP_COMPLETION_REPORT_AR.md)
- [Router Migration (Phase 2)](docs/ROUTER_FINAL_COMPLETION_REPORT_AR.md)
- [Edge Functions Hardening](docs/EDGE_FUNCTIONS_HARDENING_COMPLETION_REPORT_AR.md)

---

## 🏗️ البنية

```
Kyvzon-/
├── src/
│   ├── router/              🧭 React Router v7 (83 route + 4 guards)
│   ├── services/
│   │   ├── sdk/             🧱 طبقة SDK موحّدة (40 خدمة)
│   │   └── supabase/        Supabase client (Singleton)
│   ├── core/                Auth store + Tenant context
│   ├── pages/               صفحات مقسّمة حسب الدور
│   ├── modules/tawathul/    وحدة التواصل الداخلي
│   └── shared/              مكونات مشتركة
│
├── supabase/
│   ├── migrations/          🗃️ 16 migration رسمية (المصدر الوحيد)
│   └── functions/           🔐 7 Edge Functions
│
├── database/
│   ├── seeds/               بيانات ديمو
│   └── legacy-DO-NOT-USE/   أرشيف تاريخي — لا تُنفّذ
│
├── scripts/
│   ├── check-db-contract.mjs    CI: التأكد أن الكود يطابق الـ schema
│   ├── check-sdk-boundary.mjs   CI: منع استعمال supabase خارج SDK
│   └── tests/
│       ├── run_clean_db_test.sh  اختبار كل migrations من الصفر
│       ├── rls_isolation_test.sql 10 اختبارات عزل بين شركتين
│       └── 00_supabase_shim.sql
│
└── docs/                    📚 كل الوثائق
```

---

## 🛠️ أوامر مفيدة

```bash
# التطوير
npm run dev              # يشغل vite dev server
npm run build            # يبني للـ production
npm run preview          # يعرض build

# الفحوصات (جميعها يجب أن تنجح قبل commit)
npm run check:all        # الكل دفعة واحدة
npm run type-check       # TypeScript
npm run test:run         # 246 اختبار
npm run test:coverage    # مع تقرير التغطية
npm run sdk:boundary-check   # حماية طبقة SDK
npm run db:contract-check    # تطابق جداول DB مع الكود

# قاعدة البيانات (يتطلب Postgres محلي على 54322)
bash scripts/tests/run_clean_db_test.sh
```

---

## 🔐 الأمان

### طبقات الحماية
1. **RLS** (Row Level Security) — كل جدول محمي بسياسات على مستوى الصف
2. **SDK Layer** — كل استعلام يمر عبر `BaseService<T>` مع حقن `tenant_id` تلقائي
3. **Route Guards** — `RequireAuth`, `RequireRole`, `RequirePermission`
4. **Edge Functions** — verify_jwt + role check + tenant check + **rate limiting**
5. **CI Guards** — 5 فحوصات آلية تفشل أي PR يكسر العقود

### Rate Limits الإنتاجية
- `admin-create-user`: 5/دقيقة/admin
- `admin-delete-user`: 3/دقيقة/admin
- `admin-update-role`: 10/دقيقة/admin
- `admin-reset-password`: 3/دقيقة/admin
- `admin-toggle-status`: 10/دقيقة/admin
- `ai-chat`: 20/دقيقة/user

### الأدوار المدعومة
`employee` | `supervisor` | `manager` | `hr` | `admin` | `gatekeeper` | `developer` | `it_admin`

---

## 🎯 المزايا الرئيسية

- ✅ **Multi-tenant صارم** — عزل مُثبَت بـ 10 اختبارات RLS آلية
- ✅ **Type-safe كامل** — 0 أخطاء TypeScript
- ✅ **Deep-linking** — كل صفحة لها URL يمكن مشاركته
- ✅ **PWA + Offline** — يعمل بدون إنترنت
- ✅ **Real-time** — إشعارات + تحديثات مباشرة عبر Supabase Realtime
- ✅ **8 أدوار مختلفة** بصلاحيات مخصصة
- ✅ **AI Chat** — مساعد ذكي مع rate limiting
- ✅ **ZKTeco Integration** — سحب بصمات مع HMAC + nonce
- ✅ **Tawathul** — وحدة تواصل داخلي كاملة (chats + groups + channels)

---

## 📊 حالة المشروع

**المرحلة الحالية:** ✅ برمجياً جاهز للإنتاج
**الخطوة التالية:** تنفيذ [OPERATIONS_RUNBOOK_AR.md](docs/OPERATIONS_RUNBOOK_AR.md)

### آخر إحصائيات
- **Tests:** 246/246 ✅
- **Migrations:** 16 ملف (تنفَّذ من الصفر في ~1 ثانية)
- **CI Guards:** 5 (type-check, SDK boundary, DB contract, tests, build)
- **Edge Functions:** 7 (كلها rate-limited)
- **SDK Services:** 40
- **Router Paths:** 83

---

## 🤝 المساهمة

قبل فتح Pull Request:
1. `npm run check:all` يجب أن يمر
2. اختبارات جديدة لأي ميزة جديدة
3. اقرأ `docs/adr/` قبل قرارات معمارية
4. تحديث الوثائق ذات الصلة

---

## 📄 الترخيص

Proprietary — Kyvzon Team © 2026

---

**آخر تحديث:** 2026-07-15
