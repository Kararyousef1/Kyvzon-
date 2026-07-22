# 📣 بوابة التسويق (Marketing Portal) — التوثيق الكامل

> منصة Kyvzon — وحدة `marketing` — تُفعَّل كوحدة مستقلة للشركات المشتركة (خطة `professional` فما فوق).
> فريق التسويق (دور `marketing`) يدير كل تسويق شركته من هذه البوابة.

---

## 1. نظرة عامة

بوابة التسويق منظومة متكاملة من **7 وحدات** (بُنيت حسب 7 تقارير بحثية في `src/pages/marketing/`)، تعمل تحت طبقة حوكمة عليا مبتكرة. كل وحدة تعمل فعلياً بمعايير عالمية، مع نقاط ربط (hooks) للخدمات الخارجية (بريد/SMS/دفع/OAuth) تُفعَّل بإدخال المفاتيح دون إعادة بناء.

```
                 نظام المناعة العلائقية (الوحدة 7 — الطبقة الحاكمة)
                          ↕ (نقطة تفتيش قبل كل إرسال)
  ┌─────────────────────────────────────────────────────────┐
  │  1) أتمتة التسويق  ←→  2) البريد الإلكتروني               │
  │        ↕                      ↕                          │
  │  3) وسائل التواصل   ←→  4) SMS / واتساب                   │
  │        ↕                      ↕                          │
  │  5) إدارة الفعاليات  ←→  6) الاستبيانات                    │
  └─────────────────────────────────────────────────────────┘
                          ↕
                   marketing_leads (CRM مركزي للبوابة)
```

---

## 2. الوحدات السبع

| # | الوحدة | المسار | migration | الخدمة (SDK) | أبرز الجداول |
|---|--------|--------|-----------|--------------|--------------|
| 1 | **أتمتة التسويق** | `/app/marketing/automation` | `0155` | `MarketingAutomationService` | `marketing_leads`, `marketing_workflows`, `marketing_workflow_steps`, `marketing_workflow_enrollments`, `marketing_lead_score_rules`, `marketing_action_log` |
| 2 | **البريد الإلكتروني** | `/app/marketing/email` | `0156` (+`0157` ربط) | `MarketingEmailService` | `email_sender_domains`, `email_lists`, `email_subscribers`, `email_segments`, `email_templates`, `email_campaigns`, `email_events` |
| 3 | **وسائل التواصل** | `/app/marketing/social` | `0158` | `MarketingSocialService` | `social_accounts`, `social_posts`, `social_interactions`, `social_utm_links`, `social_listening_terms` |
| 4 | **SMS / واتساب** | `/app/marketing/messaging` | `0159` (+`0160` ربط) | `MarketingMessagingService` | `messaging_gateways`, `messaging_contacts`, `whatsapp_templates`, `messaging_campaigns`, `messaging_messages` |
| 5 | **إدارة الفعاليات** | `/app/marketing/events` | `0161` | `MarketingEventsService` | `marketing_events`, `event_ticket_types`, `event_promo_codes`, `event_registrations`, `event_speakers` |
| 6 | **الاستبيانات** | `/app/marketing/surveys` | `0162` | `MarketingSurveysService` | `marketing_surveys`, `mkt_survey_questions`, `mkt_survey_responses`, `mkt_survey_answers`, `mkt_survey_certificates` |
| 7 | **المناعة العلائقية** | `/app/marketing/immune-system` | `0163` | `RelationshipImmuneService` | `relationship_balances`, `relationship_ledger`, `governance_log`, `cultural_calendar`, `immune_incidents` |

> ملاحظة: جداول الاستبيانات تحمل بادئة `mkt_survey_*` لتفادي التعارض مع جدول `survey_responses` القديم في `0003_hr_platform_modules.sql`.

---

## 3. الربط الداخلي بين الوحدات (Integration Hooks)

كل الوحدات تلتقي حول جدول العملاء المركزي `marketing_leads` ومحرك الحوكمة:

- **الوحدة 1 → 2**: خطوة `send_email` في محرك الأتمتة تُسجّل حدثاً في `email_events` بمصدر `automation` (عبر `advance_workflow_enrollment` في `0157`).
- **الوحدة 1 → 4**: خطوات `send_sms`/`send_whatsapp` تُسجّل في `messaging_messages` بمصدر `automation` (في `0160`) مع احترام الموافقة و opt-out.
- **الوحدة 3 → 1**: زر «تحويل تعليق → عميل» ينشئ سجلاً في `marketing_leads` بمصدر `social:<platform>` (دالة `convert_interaction_to_lead`).
- **الوحدة 5 → 1**: حضور ويبينار 80%+ يرفع Lead Score تلقائياً (`set_event_engagement` → `apply_lead_score_event`).
- **الوحدة 6 → 1**: مروّج NPS (9-10) يرفع Lead Score.
- **الوحدة 7 (الحاكمة)**: `governance_check(lead, source, channel, is_promotional)` تُستدعى قبل أي إرسال؛ ترجع `allow / defer / block` حسب رصيد العلاقة والعتبات والتقويم الثقافي.

---

## 4. الأدوار والتفعيل

- **الوحدة في الكتالوج**: `src/services/sdk/TenantModuleCatalog.ts` → `key: 'marketing'`, `minPlan: 'professional'`, `category: 'advanced'`.
- **التفعيل لشركة**: من بوابة المطوّر → `ModulesPage` (تقرأ `MODULE_CATALOG` تلقائياً) → تفعيل/تعطيل يكتب في جدول `tenant_modules`.
- **دور `marketing`**: يُسنَد لموظفي التسويق من صفحة إدارة المستخدمين. عند الدخول يُوجَّه تلقائياً لـ `/app/marketing` (`ROLE_DEFAULT_PATH`).
- **حماية المسار**: `RequireRole roles={['marketing','admin','developer']}` + `RequireModule` (يفحص `isEnabled('marketing')`).
- **الشريط الجانبي**: `AppLayout` يبدّل إلى `MarketingSidebar` عند التصفّح داخل `/app/marketing`.

---

## 5. فلسفة "المحاكاة → الإنتاج" (Adapter/Hook)

الخدمات الخارجية لا يمكن أن يخترعها الكود؛ تحتاج حساباً/مفتاحاً من طرف خارجي. لذلك بُنيت كل وحدة بحيث:
- **الآن (بلا مفتاح)**: كل شيء يعمل منطقياً بوضع **محاكاة** (الإرسال يُسجَّل `simulated`)، ويمكن اختبار التدفق كاملاً.
- **لاحقاً (بمفتاح)**: بمجرد إدخال مفتاح المزوّد في الإعدادات، يتحوّل الإرسال إلى `live` **دون إعادة بناء**.

| البند | المزوّد الخارجي المطلوب |
|------|------------------------|
| إرسال بريد فعلي (وحدة 2) | SendGrid / Amazon SES + SPF/DKIM على النطاق |
| SMS/واتساب فعلي (وحدة 4) | Twilio / MessageBird / Meta Cloud + قوالب معتمدة |
| ربط الحسابات الاجتماعية (وحدة 3) | تطبيقات OAuth معتمدة (Meta/LinkedIn/X) |
| الدفع + البث (وحدة 5) | Stripe/بوابة محلية + Zoom/Teams API |

---

## 6. التحقق والاختبار

- **اختبار migrations محلياً**: `scripts/tests/00_supabase_shim.sql` + كل الـ migrations + `scripts/tests/99_post_migration_checks.sql` (CHECK M→S تغطي الوحدات السبع).
- **اختبارات الواجهة**: `src/test/marketing*.test.ts` + `relationshipImmune.test.ts` + `normalizeRoleMarketing.test.ts`.
- **أوامر التحقق الكاملة**: `npx tsc --noEmit` · `npx eslint src` · `npx vitest run` · `npx vite build`.

---

*آخر تحديث: يوليو 2026 — بوابة التسويق مكتملة (7/7).*
