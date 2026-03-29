# Ledger Foundation — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Sub-project:** 1 of 4 (Ledger Foundation → Statement Import → Auto-categorisation → Reporting)

---

## Overview

Add a simple accounting ledger to Húsfélag. This sub-project establishes the data foundation: a global chart of accounts, per-association bank accounts, and a transaction journal. Statement import, auto-categorisation, and budget-vs-actual reporting are out of scope here and will follow in subsequent sub-projects.

---

## Key Decisions

- **AccountingKey model is global**, managed by superadmin. One shared chart of accounts across all associations, seeded with standard Icelandic account numbers on deploy.
- **Simplified transaction register**, not raw double-entry UI. Users see transactions with categories. The system derives debit/credit accounts automatically from the category and bank account. No `JournalEntry` table in this phase — derived entries are computed on read.
- **BankAccount is per-association**, set up by Chair/CFO.
- **Category gains two FKs**: `expense_account` and `income_account`, both pointing to `AccountingKey`. Always nullable — the system omits derived accounting entries for categories without accounts rather than blocking users. Superadmin configures these at their own pace.
- **Account numbering**: standard Icelandic chart — assets (1xxx), liabilities (2xxx), equity (3xxx), income (4xxx), expenses (5xxx).

---

## Data Model

### `AccountingKey` — new model

```python
class AccountingKeyType(models.TextChoices):
    ASSET     = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY    = "EQUITY"
    INCOME    = "INCOME"
    EXPENSE   = "EXPENSE"

class AccountingKey(models.Model):
    number  = models.IntegerField(unique=True)
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=AccountingKeyType.choices)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_accountingkey"
        ordering = ["number"]
```

### `Category` — two new FKs added

```python
expense_account = models.ForeignKey(
    AccountingKey, null=True, blank=True,
    on_delete=models.SET_NULL, related_name="expense_categories"
)
income_account = models.ForeignKey(
    AccountingKey, null=True, blank=True,
    on_delete=models.SET_NULL, related_name="income_categories"
)
```

### `BankAccount` — new model

```python
class BankAccount(models.Model):
    association    = models.ForeignKey(Association, on_delete=models.CASCADE, related_name="bank_accounts")
    name           = models.CharField(max_length=255)        # e.g. "Rekstrarreikningur"
    account_number = models.CharField(max_length=50)         # e.g. "0101-26-123456"
    asset_account  = models.ForeignKey(
        AccountingKey, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="bank_accounts"
    )
    description    = models.CharField(max_length=255, blank=True)
    deleted        = models.BooleanField(default=False)

    class Meta:
        db_table = "associations_bankaccount"
```

### `Transaction` — new model

```python
class TransactionStatus(models.TextChoices):
    IMPORTED     = "IMPORTED"
    CATEGORISED  = "CATEGORISED"
    RECONCILED   = "RECONCILED"

class Transaction(models.Model):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name="transactions")
    date         = models.DateField()
    amount       = models.DecimalField(max_digits=14, decimal_places=2)  # positive=in, negative=out
    description  = models.CharField(max_length=500)
    reference    = models.CharField(max_length=255, blank=True)
    category     = models.ForeignKey(
        Category, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="transactions"
    )
    status       = models.CharField(
        max_length=20, choices=TransactionStatus.choices,
        default=TransactionStatus.IMPORTED
    )
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "associations_transaction"
        ordering = ["-date", "-created_at"]
```

**Derived accounting entries (computed on read, not stored):**
- Expense (negative amount): debit `category.expense_account`, credit `bank_account.asset_account`
- Income (positive amount): debit `bank_account.asset_account`, credit `category.income_account`

---

## Seeded Chart of Accounts

Migration seeds these defaults on first deploy. Superadmin can add/edit after.

| Number | Name | Type |
|--------|------|------|
| 1200 | Innstæður í bönkum (rekstrar) | ASSET |
| 1210 | Varasjóður | ASSET |
| 1300 | Útistandandi húsgjöld | ASSET |
| 2100 | Ógreidd gjöld | LIABILITY |
| 3100 | Eigið fé húsfélags | EQUITY |
| 4100 | Tekjur af húsgjöldum | INCOME |
| 5100 | Tryggingar | EXPENSE |
| 5200 | Hiti og rafmagn | EXPENSE |
| 5300 | Þrif og viðhald | EXPENSE |
| 5400 | Lóðarleiga | EXPENSE |
| 5500 | Sameiginleg gjöld | EXPENSE |

---

## Backend Endpoints

### Chart of accounts (superadmin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/AccountingKey/list` | All active keys — used by category/bank-account forms |
| GET | `/AccountingKey/{user_id}` | All keys including deleted — superadmin panel |
| POST | `/AccountingKey` | Create key. Body: `{user_id, number, name, type}` |
| PUT | `/AccountingKey/update/{id}` | Update name/type. Query: `?user_id=X` |
| DELETE | `/AccountingKey/delete/{id}` | Soft-delete. Query: `?user_id=X` |
| PATCH | `/AccountingKey/enable/{id}` | Re-enable. Query: `?user_id=X` |

All write endpoints require `is_superadmin`. Pattern mirrors `CategoryView`.

### Bank accounts (Chair/CFO)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/BankAccount/{user_id}` | List association's bank accounts (active) |
| POST | `/BankAccount` | Create. Body: `{user_id, name, account_number, asset_account_id, description}` |
| PUT | `/BankAccount/update/{id}` | Update. Body: `{user_id, name, account_number, asset_account_id, description}` |
| DELETE | `/BankAccount/delete/{id}` | Soft-delete. Body: `{user_id}` |

Resolved via `_resolve_assoc(user_id, request)` — supports `?as=` for superadmin.

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/Transaction/{user_id}` | List transactions. Query params: `?year=`, `?bank_account_id=`, `?status=` |
| POST | `/Transaction` | Create manual transaction. Body: `{user_id, bank_account_id, date, amount, description, reference?, category_id?}` |
| PATCH | `/Transaction/categorise/{id}` | Assign category. Body: `{user_id, category_id}`. Sets status=CATEGORISED. |

---

## Serializers

**`AccountingKeySerializer`**: `id`, `number`, `name`, `type`, `deleted`

**`BankAccountSerializer`**: `id`, `name`, `account_number`, `description`, `deleted`, `asset_account` (nested: `id`, `number`, `name`)

**`TransactionSerializer`**: `id`, `date`, `amount`, `description`, `reference`, `status`, `created_at`, `bank_account` (nested: `id`, `name`), `category` (nested: `id`, `name`, `type`)

---

## Frontend

### New file

- `HusfelagJS/src/controlers/TransactionsPage.js` — transaction list + manual entry form + categorise dialog

### Modified files

- `HusfelagJS/src/controlers/SuperAdminPage.js` — add `GlobalAccountingKeysPanel` (same pattern as `GlobalCategoriesPanel`)
- `HusfelagJS/src/controlers/AssociationPage.js` — add `BankAccountsPanel`
- `HusfelagJS/src/controlers/CategoriesPage.js` — add `expense_account` and `income_account` dropdowns to the edit dialog (superadmin only; populated from `GET /AccountingKey/list`)
- `HusfelagJS/src/controlers/SuperAdminPage.js` — `GlobalCategoriesPanel` edit dialog gains account dropdowns
- `HusfelagJS/src/controlers/Sidebar.js` — add "Færslur" between "Áætlun" and "Innheimta"
- `HusfelagJS/src/App.js` — add route `/faerslur → TransactionsPage`

### TransactionsPage layout

- Header: "Færslur {year}" + year selector + "+ Færsla" button
- Filter bar: bank account dropdown, status filter (All / Uncategorised / Categorised)
- Table: Date | Description | Bank Account | Category | Amount (colour-coded ±) | Status badge
- Clicking a row or the category cell opens a **categorise dialog**: category dropdown, save
- "+ Færsla" opens a form: date, amount, description, bank account, category (optional)

### SuperAdmin — GlobalAccountingKeysPanel

Mirrors `GlobalCategoriesPanel` exactly:
- Table: Number | Name | Type | Edit icon
- Inline add form: number field, name field, type dropdown
- Edit dialog: rename, retype, disable/re-enable
- Disabled keys collapsed under toggle

### AssociationPage — BankAccountsPanel

- Table: Name | Account number | Accounting key | Edit icon
- Inline add form: name, account number, accounting key dropdown (from `GET /AccountingKey/list`, filtered to ASSET type)
- Edit dialog: same fields + disable

---

## Error Handling

| Scenario | Response |
|---|---|
| `AccountingKey` number already exists | `400` — "Bókhaldslykill með þetta númer er þegar til." |
| `BankAccount` for wrong association | `403` — "Aðgangur hafnaður." |
| `Transaction` references bank account not belonging to association | `403` |
| `Transaction.categorise` — category not found | `404` |
| `GET /Transaction` with no bank accounts set up | Returns `[]` with `200` |

---

## Scope Boundary

**In scope:**
- `AccountingKey` model, migration, seeded defaults, superadmin UI
- `BankAccount` model, migration, per-association UI in AssociationPage
- `Transaction` model, migration, TransactionsPage (manual entry + categorise)
- `Category` gains `expense_account` + `income_account` FKs (nullable)
- "Færslur" sidebar entry + `/faerslur` route

**Out of scope (future sub-projects):**
- Bank statement import (CSV/Excel)
- Auto-categorisation (payee learning model)
- Budget vs actual reporting
- Collection reconciliation
- `JournalEntry` table (audit trail)
