# Mizaniya AI — Multimodal Intelligence V3

## Added
- OCR receipt review is now fully editable before any transaction is saved.
- Rich OCR extraction: line items, quantity/unit price, subtotal, tax, discount, payment method, currency, receipt number.
- OCR wallet/category/payment/date/merchant/amount can be corrected by the user before confirmation.
- Receipt line items are persisted inside transaction notes for auditability without changing the existing transaction schema.
- AI Advisor now includes live smart-financial briefing cards for daily burn, month-end forecast, and anomalies.
- Briefing cards can directly ask the AI coach grounded follow-up questions.

## Safety
- OCR remains confirm-before-write.
- AI Advisor remains read-only and grounded in `/smart-insights` and trusted financial context.
