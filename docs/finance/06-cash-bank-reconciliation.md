# الوحدة 06 — النقد والبنوك والتسوية البنكية

> Finance Unit 06 — Cash & Bank Reconciliation

## 1. الغرض

هذه الوحدة تضبط الحسابات البنكية والنقدية، استيراد كشوف البنوك، مطابقة الحركات، وتسوية الرصيد البنكي مع الدفتر العام. لا يجوز أن تكون الأرصدة مجرد أرقام يدوية غير قابلة للتدقيق.

## 2. نطاق الوحدة

- حسابات بنكية لكل كيان قانوني.
- تعطيل/تفعيل الحساب البنكي بسبب إلزامي.
- استيراد كشف بنكي idempotent مع سطور.
- مطابقة سطر كشف مع قيد يومية منشور.
- إنشاء تسوية بنكية لفترة/تاريخ.
- إكمال أو إلغاء التسوية بسبب إلزامي.
- Dashboard للنقد والبنوك.

## 3. قواعد العمل

- الحساب البنكي مرتبط بـ `legal_entity_id`.
- لا حذف صلب للحساب البنكي؛ تعطيل فقط.
- `file_path` للكشف البنكي لا يتكرر داخل الحساب.
- كل سطر كشف يمكن مطابقته مرة واحدة مع قيد منشور في نفس الكيان.
- إكمال التسوية يتطلب أن الفرق صفر أو سبب اعتماد فرق.
- كل عملية حاكمة تسجل في `finance_audit_events`.

## 4. كائنات قاعدة البيانات

### RPCs

- `upsert_finance_bank_account`
- `update_finance_bank_account_status`
- `create_bank_statement_import_with_lines`
- `match_bank_statement_line`
- `create_bank_reconciliation_controlled`
- `complete_bank_reconciliation`
- `void_bank_reconciliation`

### Views

- `finance_bank_account_board`
- `finance_bank_statement_import_board`
- `finance_bank_statement_line_board`
- `finance_bank_reconciliation_board`
- `finance_cash_bank_dashboard`

## 5. واجهة المستخدم

- `/app/finance/cash-management`
- `/app/finance/bank-statement-import`

يجب أن تحتوي الصفحات على `FinanceUnitNav unit="cash"`، وأن تستخدم RPCs بدلاً من CRUD مباشر.

## 6. حدود الجاهزية

- **Local/Static:** type-check/build/contract tests.
- **Supabase Runtime:** بعد `npx supabase db push` فقط.
- **Browser Runtime:** بعد إنشاء حساب، استيراد كشف، مطابقة سطر، إنشاء/إكمال تسوية، ومراجعة Audit.
