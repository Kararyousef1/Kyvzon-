# الوحدة 09 — الأصول الثابتة والإهلاك

> Finance Unit 09 — Fixed Assets

## 1. الغرض

هذه الوحدة تضبط سجل الأصول الثابتة، رسملة الأصل، جدول الإهلاك، تشغيل الإهلاك، والاستبعاد/البيع/التقاعد مع سجل تدقيق. لا يوجد حذف صلب للأصول.

## 2. نطاق الوحدة

- سجل أصول لكل كيان قانوني.
- تصنيف الأصل، تاريخ الشراء، التكلفة، العمر الإنتاجي، طريقة الإهلاك.
- إنشاء جدول إهلاك شهري.
- ترحيل/تشغيل الإهلاك حتى تاريخ محدد.
- استبعاد/بيع/تقاعد أصل بسبب إلزامي.
- Dashboard وViews للأصول وجداول الإهلاك.

## 3. قواعد العمل

- الأصل مرتبط بـ `legal_entity_id`.
- كود الأصل فريد داخل الكيان.
- لا حذف صلب؛ الحالات هي `draft/active/held_for_sale/retired/sold/impaired/voided`.
- الإهلاك لا يعمل إلا للأصول النشطة.
- الإهلاك لا يتجاوز تكلفة الأصل ناقص القيمة المتبقية.
- كل تغيير حالة أو تشغيل إهلاك يسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### RPCs

- `upsert_finance_fixed_asset`
- `generate_fixed_asset_depreciation_schedule`
- `run_fixed_asset_depreciation`
- `update_fixed_asset_status`

### Views

- `finance_fixed_asset_board`
- `finance_depreciation_schedule_board`
- `finance_fixed_asset_dashboard`

## 5. واجهة المستخدم

- `/app/finance/fixed-assets`

وتحتوي:

- `FinanceUnitNav unit="assets"`.
- اختيار الكيان.
- إنشاء أصل عبر RPC.
- توليد جدول إهلاك.
- تشغيل الإهلاك.
- تغيير حالة الأصل بسبب إلزامي.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء أصل، توليد جدول، تشغيل إهلاك، واستبعاد أصل.
