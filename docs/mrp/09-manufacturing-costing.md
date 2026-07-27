# الوحدة التاسعة: تكاليف التصنيع (Manufacturing Costing)
### بوابة التصنيع MRP — Kyvzon Platform

---

## لماذا هذه الوحدة جوهرية؟

بعد أن أصبحت بوابة التصنيع تعرف **ماذا سننتج** عبر BOM وMPS، و**كيف سننتج** عبر Routing/Work Orders، و**ما حدث فعلاً** عبر MES/Quality/Maintenance، يجب أن تجيب هذه الوحدة على السؤال المالي الحاسم:

> كم كلّفتنا الوحدة فعلاً؟ وما الفرق بين التكلفة المخططة والتكلفة الفعلية؟

بدون Manufacturing Costing لن تعرف الشركة هل المنتج مربح، ولا أين تحدث الهدر: مادة زائدة، وقت تشغيل أطول، خردة، إعادة عمل، توقفات، أو صيانة متكررة.

---

## أولاً: نماذج تكلفة التصنيع

### 1) التكلفة القياسية Standard Costing
تُحدد تكلفة معيارية مسبقة للصنف بناءً على:
- مواد BOM القياسية.
- عمليات Routing وزمن التشغيل القياسي.
- معدلات العمالة والآلة والتحميل الصناعي.
- نسب الهدر/Scrap المتوقعة.

تُستخدم في التخطيط والتسعير والموازنات، ثم تُقارن بالتكلفة الفعلية.

### 2) التكلفة الفعلية Actual Costing
تُحسب بعد التنفيذ اعتماداً على:
- الاستهلاك الفعلي للمواد من أرضية المصنع.
- أوقات العمال الفعلية.
- أوقات الآلات ومراكز العمل.
- الخردة وإعادة العمل.
- تكلفة الصيانة المرتبطة بالأمر/الأصل.
- المصاريف الصناعية المحملة.

### 3) متوسط مرجح / WAC
مناسب للمواد الخام والمخزون المتكرر، لكنه لا يكفي وحده لتحليل كفاءة أمر العمل.

### 4) التكلفة حسب الأمر Job/Work Order Costing
كل أمر عمل يصبح “حاوية تكلفة” تتجمع فيها:
- مواد.
- عمالة.
- آلة.
- تحميل صناعي.
- جودة.
- صيانة.
- خردة وإعادة عمل.

---

## ثانياً: عناصر التكلفة Cost Elements

يجب أن تسمح Kyvzon بتعريف عناصر تكلفة مرنة، مثل:

| العنصر | أمثلة |
|---|---|
| Material | صفيحة فولاذ، براغي، طلاء |
| Labor | ساعات عامل، مشرف، فني جودة |
| Machine | ساعات آلة، استهلاك طاقة |
| Overhead | إيجار مصنع، كهرباء، إهلاك |
| Subcontract | عملية خارجية |
| Quality | فحوصات، NCR، Rework |
| Maintenance | صيانة أصل مرتبط بالإنتاج |
| Scrap | تكلفة خردة غير قابلة للاسترداد |
| Rework | تكلفة إعادة عمل |

---

## ثالثاً: Rollup التكلفة القياسية

### BOM Rollup
```
تكلفة المادة = كمية BOM × تكلفة المادة القياسية
+ Scrap Factor
+ Freight/Handling إن وجد
```

### Routing Rollup
```
تكلفة العمالة = زمن التشغيل القياسي × معدل العمالة
تكلفة الآلة = زمن الآلة القياسي × معدل الآلة
Overhead = قاعدة التحميل × معدل التحميل
```

### Standard Cost للمنتج
```
Standard Unit Cost = Material + Labor + Machine + Overhead + Subcontract + Quality Allowance + Scrap Allowance
```

---

## رابعاً: التكلفة الفعلية لأمر العمل

عند تنفيذ أمر العمل، تُجمع التكاليف من الوحدات السابقة:

- Unit 03 Work Orders: الأمر والعمليات والكميات.
- Unit 04 WIP: حركة WIP والمواد.
- Unit 07 MES: إنتاج فعلي، استهلاك فعلي، عمالة، توقفات.
- Unit 08 Maintenance: تكلفة الصيانة المرتبطة بالأصل/أمر الإنتاج.
- Unit 06 Quality: NCR/Rework/Scrap.

ثم ينتج:

```
Actual Unit Cost = Total Actual Work Order Cost / Good Quantity
```

---

## خامساً: تحليل الفروقات Variance Analysis

| الفرق | المعنى |
|---|---|
| Material Usage Variance | استهلاك مادة أكثر/أقل من BOM |
| Material Price Variance | سعر المادة الفعلي مختلف عن القياسي |
| Labor Efficiency Variance | وقت العمل أكثر/أقل من القياسي |
| Labor Rate Variance | معدل العامل الفعلي مختلف |
| Machine Efficiency Variance | وقت الآلة/الأداء مختلف |
| Overhead Variance | التحميل الفعلي مختلف عن المخطط |
| Scrap Variance | خردة أعلى من المسموح |
| Rework Variance | إعادة عمل غير متوقعة |
| Maintenance Variance | صيانة/عطل أثر على تكلفة الإنتاج |

---

## سادساً: WIP وFinished Goods Valuation

### WIP
طالما أمر العمل قيد التنفيذ، تُجمع التكاليف في WIP Ledger.

### Finished Goods
عند اكتمال الأمر:
- تُنقل تكلفة WIP إلى Finished Goods.
- يُحسب متوسط تكلفة الوحدة الجيدة.
- تُسجل فروقات الخردة/إعادة العمل إن وجدت.

---

## سابعاً: التكامل مع المالية Finance

لا يجب أن تنشئ وحدة التصنيع قيوداً مالية نهائية دون مراجعة مالية. لذلك تعتمد Kyvzon على:
- Cost Posting Drafts.
- حالة: draft / reviewed / posted / cancelled.
- جسر إلى Journal Entries في بوابة المالية.
- منع التعديل بعد الترحيل إلا عبر عكس/تصحيح.

---

## ثامناً: ما يجب أن تتضمنه هذه الوحدة في Kyvzon

- تعريف عناصر التكلفة.
- ملفات/Profiles تكلفة لكل مصنع/طريقة تكلفة.
- Standard Cost Versions واعتمادها.
- Rollup من BOM وRouting.
- Actual Cost Collection من Work Orders/MES/Maintenance/Quality.
- Work Order Cost Summary.
- Variance Analysis.
- WIP Ledger وFinished Goods valuation bridge.
- Cost Posting Drafts للمالية.
- Dashboards: planned vs actual، cost per unit، variance، scrap/rework cost.

---

*الوحدة التاسعة — بوابة التصنيع MRP، Kyvzon Platform*
*تاريخ الإضافة الفني: يوليو 2026*
