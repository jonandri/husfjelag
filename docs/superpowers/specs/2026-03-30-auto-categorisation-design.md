# Auto-Categorisation — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Sub-project:** 3 of 4 (Ledger Foundation → Statement Import → Auto-categorisation → Reporting)

---

## Overview

When transactions are imported from a bank statement, Húsfélag automatically assigns a category based on keyword rules and transaction history. Uncategorised transactions fall back to the existing manual categorisation flow unchanged.

---

## Key Decisions

- **Two-layer rules.** Global rules (superadmin-managed) apply to all associations. Association-specific rules override global ones for that association. Within the same scope, first keyword match wins.
- **History-based fallback.** If no rule matches, the system normalises the description to extract a vendor name and looks up the most-recently-used category for that vendor in the same association's transaction history.
- **Auto-categorisation runs at import time.** `ImportConfirmView` calls the categoriser before `bulk_create`. No new endpoint; no separate batch action.
- **Uncategorised transactions are left as `IMPORTED`.** Only confident matches (rule or history) produce `status=CATEGORISED`. No wrong pre-fills.
- **Logic lives in `categoriser.py`.** Mirrors the `importers.py` pattern — all matching logic is in a standalone module, independently testable.

---

## Data Model

### New model: `CategoryRule`

```python
class CategoryRule(models.Model):
    keyword     = CharField(max_length=255)               # case-insensitive substring
    category    = ForeignKey(Category, on_delete=CASCADE)
    association = ForeignKey(Association, null=True, blank=True, on_delete=CASCADE)
    # null → global rule; set → association-specific rule
    deleted     = BooleanField(default=False)
```

No migration to existing models required. `Transaction.category` and `Transaction.status` are already nullable/have the right choices.

---

## Backend

### New file: `HusfelagPy/associations/categoriser.py`

```python
def normalise_vendor(description: str) -> str:
    """Extract a cleaned vendor name from a bank transaction description.
    Strips trailing reference numbers, dates, and punctuation. Lowercases.
    Example: "HS Veitur hf. 280226" → "hs veitur hf"
    """

def build_categorisation_context(association) -> tuple[list[CategoryRule], dict[str, Category]]:
    """Load rules and history for a batch categorisation run.
    Returns:
      rules   — association rules first, then global rules (all non-deleted)
      history — {normalised_vendor: category} from association's categorised transactions
    Two DB queries total.
    """

def categorise_row(description: str, rules: list, history: dict) -> Category | None:
    """Return a Category for this description, or None if no match.
    1. Check rules in order: first rule where keyword.lower() in description.lower() wins.
    2. If no rule matches, look up normalise_vendor(description) in history.
    3. Return None if nothing matches.
    """
```

### Modified: `ImportConfirmView` in `views.py`

After validating the bank account and before `bulk_create`, call the categoriser:

```python
rules, history = build_categorisation_context(bank_account.association)
for tx in transactions:
    cat = categorise_row(tx.description, rules, history)
    if cat:
        tx.category = cat
        tx.status = TransactionStatus.CATEGORISED
```

### New views in `views.py`

`CategoryRuleView` — one class, four actions:

| Method | URL | Body | Action |
|---|---|---|---|
| `GET` | `/CategoryRule/<user_id>` | — | List association rules + global rules |
| `POST` | `/CategoryRule` | `{user_id, keyword, category_id, is_global}` | Create rule |
| `PUT` | `/CategoryRule/update/<rule_id>` | `{user_id, keyword, category_id}` | Update |
| `DELETE` | `/CategoryRule/delete/<rule_id>` | `{user_id}` | Soft-delete |

**Authorization:**
- Regular users: can only create/edit/delete association-scoped rules (`association` = their association).
- Superadmins: can create/edit/delete global rules (`association=null`) when `is_global=true`.
- Any user can `GET` (sees own + global rules).

### New URL patterns in `urls.py`

```python
path("CategoryRule/<int:user_id>", CategoryRuleView.as_view(), name="categoryrule-list"),
path("CategoryRule", CategoryRuleView.as_view(), name="categoryrule-create"),
path("CategoryRule/update/<int:rule_id>", CategoryRuleView.as_view(), name="categoryrule-update"),
path("CategoryRule/delete/<int:rule_id>", CategoryRuleView.as_view(), name="categoryrule-delete"),
```

### Migration

One new migration: `CreateCategoryRule`.

---

## Frontend

### New file: `HusfelagJS/src/controlers/CategorisationRulesPage.js`

Two sections:

**"Reglur þessa félags"** (green heading)
- Table: Lykliorð | Flokkur | Breyta / Eyða
- "+ Ný regla" button opens an inline form: keyword text field + category dropdown + Save
- Edit: inline row editing (same form, pre-filled)
- Delete: confirms with a small dialog

**"Almennar reglur"** (grey heading)
- Same table structure, but rows are read-only for non-superadmins (no edit/delete buttons)
- Superadmins see Breyta / Eyða on global rule rows

API calls: `GET /CategoryRule/<user_id>`, `POST /CategoryRule`, `PUT /CategoryRule/update/<id>`, `DELETE /CategoryRule/delete/<id>`.

### Modified: `Sidebar.js`

Add "Flokkunarreglur" nav entry (between Færslur and the existing items).

### Modified: `App.js`

Add route: `/flokkunarreglur` → `CategorisationRulesPage`.

### No changes to `TransactionsPage.js`

Auto-categorisation is invisible at import — transactions just arrive with a category already set when a match was found.

---

## Serialiser / Response shape

`GET /CategoryRule/<user_id>`:

```json
{
  "association_rules": [
    {"id": 1, "keyword": "HS Veitur", "category": {"id": 3, "name": "Hitaveita"}}
  ],
  "global_rules": [
    {"id": 10, "keyword": "Orka", "category": {"id": 5, "name": "Rafmagn"}}
  ]
}
```

`POST /CategoryRule` and `PUT /CategoryRule/update/<id>` respond with the saved rule object:

```json
{"id": 1, "keyword": "HS Veitur", "category": {"id": 3, "name": "Hitaveita"}, "is_global": false}
```

`DELETE /CategoryRule/delete/<id>` responds with `{"deleted": true}`.

---

## Error handling

| Scenario | Response |
|---|---|
| `category_id` not found | `400` — "Flokkur fannst ekki." |
| `is_global=true` but user is not superadmin | `403` — "Aðeins stjórnendur geta búið til almennar reglur." |
| Rule not found on update/delete | `404` — "Regla fannst ekki." |
| Rule belongs to a different association | `403` — "Aðgangi hafnað." |

---

## Testing

- **`CategoriserTest`** — unit tests for `categoriser.py`:
  - `normalise_vendor` strips reference numbers, dates, punctuation
  - `categorise_row` — association rule wins over global rule
  - `categorise_row` — history match when no rule
  - `categorise_row` — returns `None` when no match
  - `build_categorisation_context` — returns association rules first, then global

- **`CategoryRuleViewTest`** — integration tests:
  - `GET` returns both association and global rules
  - `POST` creates association rule
  - `POST` with `is_global=true` and superadmin creates global rule
  - `POST` with `is_global=true` and non-superadmin returns `403`
  - `PUT` updates keyword
  - `DELETE` soft-deletes rule
  - Access to another association's rule returns `403`

- **`ImportConfirmCategorisationTest`** — integration test:
  - Import with a matching rule → transaction arrives with correct category and `status=CATEGORISED`
  - Import with no matching rule → transaction `status=IMPORTED`, `category=null`
  - Import with history match (no rule) → transaction categorised from history

---

## Scope Boundary

**In scope:**
- `CategoryRule` model + migration
- `categoriser.py` with `normalise_vendor`, `build_categorisation_context`, `categorise_row`
- `ImportConfirmView` updated to call categoriser
- `CategoryRuleView` with full CRUD
- `CategorisationRulesPage.js` with association + global rules sections
- Sidebar and route updates

**Out of scope (future sub-projects):**
- Reporting (sub-project 4)
- Confidence scores or ranked suggestions in the categorise dialog
- Editing individual transactions' categories in bulk
- Re-categorisation batch action for already-imported transactions
