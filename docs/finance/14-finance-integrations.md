# الوحدة 14 — التكاملات المالية

> Finance Unit 14 — Finance Integrations

## 1. الغرض

هذه الوحدة تضبط طبقة التكامل بين المالية وباقي البوابات والأنظمة الخارجية. أي حدث مالي قادم من Procurement أو Inventory أو MRP أو CRM أو نظام خارجي يجب أن يمر عبر Inbox/Bridge محكوم قبل أن يتحول إلى قيد مالي.

## 2. نطاق الوحدة

- تعريف موصلات التكامل Finance Integration Connectors.
- استقبال أحداث مالية موحدة في Integration Inbox.
- مراجعة/رفض/تجاهل الحدث بسبب إلزامي.
- تحويل حدث مالي إلى قيد يومية عبر خطوط محكومة.
- ربط الحدث بالقيد الناتج.
- Dashboard للنجاح والفشل والمعلقات.

## 3. قواعد العمل

- كل حدث تكامل مرتبط بكيان قانوني.
- لا يتم إنشاء قيد مالي من تكامل بدون مراجعة أو تحويل حاكم.
- idempotency key يمنع تكرار نفس الحدث.
- الرفض/الإلغاء يتطلب سبباً.
- التحويل إلى قيد يستخدم `create_journal_draft` و `post_journal_entry_with_reason`.
- كل عملية تسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### جداول

- `finance_integration_connectors`
- `finance_integration_events`

### RPCs

- `upsert_finance_integration_connector`
- `ingest_finance_integration_event`
- `review_finance_integration_event`
- `create_finance_journal_from_integration_event`

### Views

- `finance_integration_connector_board`
- `finance_integration_event_board`
- `finance_integration_dashboard`

## 5. واجهة المستخدم

- `/app/finance/integrations`

وتحتوي:

- `FinanceUnitNav unit="integrations"`.
- إدارة Connectors.
- Inbox للأحداث.
- مراجعة/رفض/تجاهل حدث.
- تحويل حدث إلى قيد.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد تجربة connector، ingest event، review، convert to journal.
