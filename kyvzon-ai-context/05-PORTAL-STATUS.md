# 📊 حالة البوابات — بالأرقام (2026-08-04)

## جدول الحالة الشامل

| البوابة | صفحات | توثيق | اختبارات | الحالة |
|---|---|---|---|---|
| **المالية** finance | 33 | 38 ملفاً | 17 | ✅ مكتملة 00–14 · مرفوعة |
| **المخزون** inventory | 130 | 18 | 12 | ✅ مكتملة · مرفوعة |
| **التصنيع** mrp | 146 | 22 | 13 | ✅ مكتملة · مرفوعة |
| **المشتريات** procurement | 38 | 19 | 15 | ✅ مكتملة 00–07 · **غير مرفوعة** |
| **CRM** | 42 | 3 | 7 | ⚠️ تدقيق موجود · لم تُعالَج بالمنهجية |
| **التسويق** marketing | 46 | 1 | 7 | ⚠️ **شبه صفر توثيق** |
| **الموارد البشرية** hr | 32 | 0 | **0** | ⚠️ **صفر اختبارات** |
| **الإدارة** admin | 16 | متفرق | — | قائمة |

---

## 1) بوابة المشتريات — التفصيل الكامل

### الوحدات 00–07

| الوحدة | التوثيق المرجعي |
|---|---|
| 00 الأساس ولوحة التحكم | `docs/e-procurement/00-procurement-foundation-control-plane.md` |
| 01 طلبات الشراء والموافقات | `01-purchase-requisition-approval.md` |
| 02 التوريد الاستراتيجي RFx | `02-strategic-sourcing-RFx.md` |
| 03 تأهيل الموردين | `03-supplier-onboarding-qualification.md` |
| 04 أوامر الشراء والاستلام | `04-purchase-orders-goods-receipt.md` |
| 05 الفواتير والمطابقة الثلاثية | `05-invoice-processing-3way-matching.md` |
| 06 دورة حياة العقود CLM | `06-contract-lifecycle-management.md` |
| 07 تحليل الإنفاق | `07-spend-analysis-procurement-intelligence.md` |

### المايجريشنات 0256–0269 (غير مطبَّقة على Supabase)

| # | المحتوى |
|---|---|
| `0256` | الأساس: `procurement_audit_events` · `procurement_policies` · 7 RPC · 6 View |
| `0257` | إصلاح `b.name` — **كان يمنع إنشاء أي طلب شراء** |
| `0258` | `calculate_kraljic` STABLE→VOLATILE — كانت معطّلة |
| `0259` | إصلاح دوال STABLE تكتب + **حارس دائم** |
| `0260` | جسر الاستلام → المخزون |
| `0261` | إصلاح `status` الغامض — **المطابقة الثلاثية كانت معطّلة** |
| `0262` | جسر الفواتير → الذمم الدائنة |
| `0263` | حراس دورة حياة العقد + `contract_renewal_alerts` (90/30/7) |
| `0264` | محفّز `trg_sync_po_total` — **كل أرقام التحليل كانت أصفاراً** |
| `0265` | جسر المرتجعات RTV → خصم المخزون |
| `0266` | الإشعارات المجدولة + `procurement_notification_log` |
| `0267` | Lookups الربط + `procurement_integration_health` |
| `0268` | ★ cron متعدد المستأجرين + إصلاح ثغرة صلاحية `anon` |
| `0269` | ★ قواعد المزاد حسب النوع + سقف السعر |

### جداول المشتريات الأساسية

```
suppliers · supplier_documents · supplier_contacts · supplier_risk_assessments
supplier_portal_invites · supplier_site_visits
purchase_requisitions · pr_line_items · pr_attachments
procurement_approval_rules · procurement_approval_steps · procurement_approval_requests
sourcing_events · rfx_line_items · rfx_documents · supplier_bids · bid_evaluations
procurement_auctions · auction_bids · auction_participant_status
purchase_orders · po_line_items · po_releases · goods_receipts · gr_line_items
return_to_vendor · supplier_invoices · invoice_line_items
procurement_matching_results · procurement_duplicate_checks · procurement_payment_schedules
procurement_contracts · contract_obligations
spend_transactions · procurement_audit_events · procurement_policies
procurement_notification_log
```

### إثباتات بالتشغيل الفعلي (Postgres محلي)

```
استلام 50 طن           → inventory_stock_balances = 50.0000 + حركة receipt
استلام 100 → مرتجع 30  → الرصيد 70 + حركة return_out
مرتجع 500 والرصيد 70   → INSUFFICIENT_STOCK_FOR_RTV · الرصيد لم يتأثر
فاتورة معتمدة          → accounts_payable: INV-002 · 1200.00 · draft
MECCA بـ 4 معايير      → 84.50
مزاد بريطاني           → 100,000 → 95,000 → 90,000 · رفض 99,000 · وفورات 10%
عقد                    → draft → approved → signed → terminated
محفّز PO               → سطر 500 → 2,500 · تعديل 300 → 3,500 · حذف → 2,000
cron (service_role)    → 2 عقد → 4 إشعارات · تشغيل ثانٍ = أصفار
مزاد ياباني            → 3 موردين نفس المستوى ✓ · انسحاب ما قبل الأخير يُنهيه
مزاد هولندي            → أول قبول يفوز وينهي المزاد
```

### تنظيف الجودة
`prompt()` 16→**0** · `confirm()` 1→**0** · `as any` 31→**0**

صفحة خطرة عولجت: `ProcurementApprovalRulesPage.tsx` كانت تستخدم
`confirm()` + **حذف نهائي** عبر `BaseService.delete()` → حُوّلت إلى
`<Navigate>` وحُذفت الخدمة الخطرة.

---

## 2) بوابة المالية

- الوحدات 00–14 · مايجريشنات `0240`–`0255`.
- `0255` أصلح خطأ 400 في `get_ap_aging` (تعارض `varchar`/`TEXT`).
- 16 وحدة في `FinanceUnitNav` + `.finance-nav-scroll` في `src/index.css`.
- 29 صفحة سُجِّلت في `hybridPagesCatalog` (كانت **صفراً**).
- ملف الاستئناف: `docs/finance/FINANCE_STATE_2026-08-03.md`.

---

## 3) البوابات التي تحتاج عملاً

### CRM (42 صفحة)
- تدقيق موجود: `docs/CRM_PORTAL_AUDIT_AR_2026-07-28.md`.
- ✅ **لا ثغرة `RequireModule`** — تحقّق مُثبت، الادعاء السابق خاطئ.
- لم تمرّ بمنهجية الوحدات كاملةً.

### التسويق (46 صفحة)
- **ملف توثيق واحد فقط.** يحتاج تدقيقاً شاملاً من الصفر.

### الموارد البشرية (32 صفحة)
- **صفر اختبارات · صفر توثيق مخصَّص.** أعلى مخاطرة انحدار.

---

## 4) تكاملات تحتاج إعداداً تشغيلياً (الكود جاهز)

| البند | المطلوب | الحالة |
|---|---|---|
| جدولة cron | `CRON_SECRET` + جدولة `procurement-daily-notifications` | الدوال جاهزة |
| OCR الفواتير | مفتاح OpenRouter/Groq | `procurement-invoice-ocr` (118 سطراً) **منفَّذ بـ AI Vision حقيقي** |
| البريد | Resend أو BYOK | `procurement-send-rfq` جاهز |
| DocuSign | حساب واشتراك | `procurement-send-signature` جاهز |

> ⚠️ ادعاء سابق بأن OCR «يحتاج مزوّداً خارجياً/غير منفَّذ» **خاطئ** —
> منفَّذ ويرفض العمل بلا مفتاح برسالة صريحة بدل محاكاة وهمية.

---

## 5) لم يُنفَّذ فعلاً (كن صادقاً)

- **تصدير PDF** — يتطلب مكتبة غير مثبَّتة.
- **XLSX ثنائي حقيقي** — يتطلب SheetJS/ExcelJS.
- **استلام بريد/EDI** — يتطلب صندوق بريد ومعالجاً.
- التصنيف «بـ AI» مُنفَّذ كقواعد مطابقة، لا نموذج تعلّم.
- استخراج التزامات العقد من النص يدوي.
- `RequisitionListPage` (391 سطراً) و`SupplierDetailPage` يستحقان تقسيماً.
