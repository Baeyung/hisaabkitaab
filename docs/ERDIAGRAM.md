# Schema

Mirrors the JPA entities in `src/backend/.../entity` and the Flyway migrations in
`src/backend/src/main/resources/migrations` (baseline V1, current head V11).

`whatsapp_sends.target_id` and `whatsapp_blocks.target_id` hold a party id *or* a user id
depending on who was messaged, so they carry no FK — the dashed relations below say what
they point at in practice.

```mermaid
erDiagram
  USER ||--o{ STORE : owns
  USER ||--o| USER_PLAN : "billed under"
  USER ||--o{ USER_ACCESS_STORE : "works in"
  STORE ||--o{ USER_ACCESS_STORE : "grants seats"
  STORE ||--o{ STORE_ITEM : stocks
  STORE ||--o{ PARTY : has
  STORE ||--o{ TRANSACTION : records
  STORE ||--o{ EXPENSE_CATEGORY : "defines heads"
  STORE ||--o{ UNIT_CONVERSION : "defines units"
  STORE ||--o{ WHATSAPP_SEND : "sent from"
  STORE ||--o{ WHATSAPP_BLOCK : "opted out of"
  TRANSACTION ||--o{ TRANSACTION_LINE : posts
  TRANSACTION }o--o| PARTY : counterparty
  TRANSACTION_LINE }o--o| PARTY : "targets party"
  TRANSACTION_LINE }o--o| STORE_ITEM : "targets stock"
  TRANSACTION_LINE }o--o| EXPENSE_CATEGORY : "filed under (expense only)"
  WHATSAPP_SEND }o..o| PARTY : "target_id, no FK"
  WHATSAPP_BLOCK }o..o| PARTY : "target_id, no FK"

  USER {
    string id PK
    string contact_number UK "dial-code form, 92xxxxxxxxxx since V11"
    string password_hash
    string name
    string email "optional"
    enum status "INVITED/ACTIVE"
    boolean verified
    string verification_token "nullable, + expiry and attempt counter"
    string reset_token "nullable, + expiry and attempt counter"
    int failed_login_attempts
  }
  USER_PLAN {
    string user_id PK "also the FK; one plan per user"
    enum tier "TRIAL/BASIC/PREMIUM/PREMIUM_PLUS/ENTERPRISE"
    datetime assigned_at
    date expires_at "nullable, null = no expiry"
    int max_stores "nullable override of the tier default"
    int max_users "nullable override"
    int whatsapp_quota "nullable override"
    boolean daily_reports "nullable override"
    int reminder_contacts "nullable override"
    int whatsapp_used "counter, reset per period"
    string whatsapp_period "YYYY-MM the counter belongs to"
  }
  STORE {
    string id PK
    string owner_user_id FK
    string name
    string address
    string contact
    text logo_uri "base64 data URI"
    text watermark_uri "base64 data URI"
    text settings "JSON StoreSettings: menu, hideChrome, easyMode, reports"
    datetime suspended_at "nullable; set = shop closed by plan/admin"
  }
  USER_ACCESS_STORE {
    string id PK
    string store_id FK
    string user_id FK
    enum role "VIEWER/EDITOR/OWNER"
  }
  STORE_ITEM {
    string id PK
    string store_id FK
    string name
    string unit "meter/than/pc"
    decimal sale_price "prefill"
    decimal cost_price "prefill; weighted average, repriced by purchases and processing"
    boolean service "no stock is tracked for it"
  }
  PARTY {
    string id PK
    string store_id FK
    string name
    string contact "blank or 7-15 digits; 090078601 = the walk-in placeholder"
    string address
  }
  EXPENSE_CATEGORY {
    string id PK
    string store_id FK
    string name "unique per store; seed heads keep tokens (PARTS...)"
  }
  UNIT_CONVERSION {
    string id PK
    string store_id FK
    string from_unit
    string to_unit
    decimal factor "unique per (store, from, to)"
  }
  TRANSACTION {
    string id PK
    string store_id FK
    enum event "SALE/PURCHASE/PROCESSING/RECEIPT/PAYMENT/EXPENSE/ADJUSTMENT/OPENING_*"
    string party_id FK "nullable"
    string bill "nullable, free text bill number - not an FK"
    date event_date
    date entry_date
    string description
    datetime created_at "deletable by an editor for 24h after this"
  }
  TRANSACTION_LINE {
    string id PK
    string transaction_id FK "the group link"
    enum target_kind "CASH/BANK/PARTY/STOCK"
    string party_id FK "nullable"
    string item_id FK "nullable"
    string expense_category_id FK "nullable, expense cash line only"
    string name "nullable, free-text label where no item is linked"
    enum in_out "IN/OUT/NONE/UNKNOWN"
    double value "signed amount; replaced the old value_meta_data JSON"
    decimal quantity "stock only"
    string unit "stock only"
    double item_sold_at "stock only, unit price this line went out at"
  }
  WHATSAPP_SEND {
    string id PK
    string store_id FK
    string sender_id "user who sent, or the job"
    string sender_name
    string target_id "party or user id, no FK"
    string recipient_name
    string contact
    string filename
    enum status "SENT/FAILED/BLOCKED"
    enum source "SHARE/DAILY_REPORT/REMINDER"
    datetime sent_at "also the dedupe key for scheduled runs"
  }
  WHATSAPP_BLOCK {
    string id PK
    string store_id FK
    string target_id "party or user id, no FK"
    string contact "unique per (store, target, contact)"
    datetime blocked_at
  }
```

## Notes

- **`stores.settings` is a JSON blob, deliberately.** The backend validates its size and its
  `reports` half (`ReportSettings`, read by `ReportScheduler`) and treats the rest as opaque —
  menu keys belong to the client. See `StoreSettings` for why.
- **`user_plans` overrides are nullable on purpose.** Null means "use the tier's default"
  (`PlanTier`); a value is an admin-granted exception for that account.
- **No table for the scheduled reports.** `whatsapp_sends` is both the audit trail and the
  dedupe key — a run that already logged a send for that store/source/date does not repeat.
