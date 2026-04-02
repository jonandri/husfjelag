# UI Design System — Húsfjelagið
**Date:** 2026-04-02  
**Status:** Approved — ready for implementation

---

## Overview

A consistent design system applied across all pages of the Húsfjelagið React frontend. Covers page anatomy, tables, toolbars, buttons, dialogs, amounts, and status chips. Implemented as a shared utility module (`src/ui/`) plus updates to all existing pages.

---

## 1. Page Anatomy

Every page follows a three-zone layout:

```
┌─────────────────────────────────────────────────┐
│ ① HEADER — title, subtitle, primary action      │  bg: white, border-bottom
├─────────────────────────────────────────────────┤
│ ② TOOLBAR — filters left · result count right  │  bg: #fafafa, border-bottom
├─────────────────────────────────────────────────┤
│ ③ CONTENT — table or panels, scrollable         │  bg: white, flex: 1
└─────────────────────────────────────────────────┘
```

### Zone ① — Header
- Left: `Typography variant="h5"` (page title) + `Typography variant="body2" color="text.secondary"` (subtitle: association name · year or other context)
- Right: primary action button (one per page maximum)
- Padding: `p: "16px 24px"`
- Background: white, `borderBottom: "1px solid #e8e8e8"`

### Zone ② — Toolbar
- Left: secondary action buttons (import, export, utility) + filter dropdowns
- Right: result count `Typography variant="caption" color="text.disabled"`
- Padding: `p: "8px 24px"`
- Background: `#fafafa`, `borderBottom: "1px solid #e8e8e8"`
- Only rendered when the page has filters or secondary actions. Omit when neither applies.
- Active filter: `border: "1.5px solid #1D366F"`, `background: "#eef1f8"`, `color: "#1D366F"`

### Zone ③ — Content
- `flex: 1, overflowY: "auto"`
- Tables wrapped in `<Paper variant="outlined">` with no extra margin
- Multi-panel pages (AssociationPage, SuperAdminPage) use `Box sx={{ p: 4 }}` with `Paper variant="outlined"` sections separated by `mt: 4`

---

## 2. Tables

All tables use the shared `HEAD_SX` and `HEAD_CELL_SX` constants from `tableUtils.js`. No inline overrides.

### Header style (update tableUtils.js)
```js
export const HEAD_SX = {
  backgroundColor: '#f5f5f5',
  '& th': { borderBottom: '1px solid #e8e8e8' },
};

export const HEAD_CELL_SX = {
  fontWeight: 600,
  fontSize: '0.7rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#888',
  py: 1.25,
  whiteSpace: 'nowrap',
};
```

### Row style
- `Table size="small"` always
- Row divider: `borderBottom: "1px solid #f2f2f2"`
- Hover: `hover` prop on `TableRow` (MUI default)
- Clickable rows: `cursor: "pointer"` via sx
- First column: `px: 3` (24px). All others: `px: 2` (16px). Last column action cell: `px: 3` right.

### Column alignment rules
- Text columns: left-aligned
- Amount columns: right-aligned, `fontFamily: "monospace"`, `whiteSpace: "nowrap"`
- Status/chip columns: left-aligned
- Action icon column: right-aligned, fixed width `48px`

### Footer / totals row
```js
export const TOTALS_ROW_SX = {
  '& td': {
    fontWeight: 600,
    borderTop: '2px solid rgba(0,0,0,0.12)',
    color: 'text.primary',
  },
};
```
Export from `tableUtils.js`. Use `<TableFooter>` with this sx.

---

## 3. Buttons

Four levels. No ad-hoc `sx` overrides beyond what is specified here.

| Level | Variant | Color | When to use |
|-------|---------|-------|-------------|
| **Primary** | `contained` | `#1D366F` (navy) | One per page/dialog. The single most important action. |
| **Secondary** | `outlined` | `#1D366F` (navy) | Supporting page-level actions (import, export, utility). |
| **Ghost** | `text` | default (`#555`) | Cancel, dismiss, navigate back. Never styled further. |
| **Destructive** | `text` | `color: "#c62828"` | Delete/disable. Always placed bottom-left in dialogs, never in toolbars. |

### Implementation
Create `src/ui/buttons.js`:
```js
export const primaryButtonSx = {
  backgroundColor: '#1D366F',
  color: '#fff',
  '&:hover': { backgroundColor: '#162d5e' },
  '&:disabled': { backgroundColor: '#c5cfe8', color: '#fff' },
  textTransform: 'none',
  fontWeight: 500,
};

export const secondaryButtonSx = {
  color: '#1D366F',
  borderColor: '#1D366F',
  textTransform: 'none',
  fontWeight: 500,
  '&:hover': { backgroundColor: '#eef1f8', borderColor: '#1D366F' },
};

export const ghostButtonSx = {
  textTransform: 'none',
  fontWeight: 400,
  color: '#555',
};

export const destructiveButtonSx = {
  textTransform: 'none',
  fontWeight: 400,
  color: '#c62828',
  padding: 0,
  minWidth: 0,
  '&:hover': { color: '#8b0000', backgroundColor: 'transparent' },
};
```

### Usage pattern
```jsx
// Primary
<Button variant="contained" sx={primaryButtonSx}>+ Ný færsla</Button>

// Secondary
<Button variant="outlined" sx={secondaryButtonSx}>+ Innflutningur</Button>

// Ghost (cancel)
<Button sx={ghostButtonSx}>Hætta við</Button>

// Destructive (dialog bottom-left)
<Button sx={destructiveButtonSx}>Eyða færslu</Button>
```

### MUI theme — remove current overrides
The current `color="secondary" sx={{ color: '#fff' }}` pattern is replaced entirely by `sx={primaryButtonSx}`. Update `App.js` theme: remove secondary color definition (or keep for Chips/badges only).

---

## 4. Dialogs

All create and edit flows use dialogs. Inline expand/collapse forms (`<Collapse>` + `<Paper>`) are removed from: OwnersPage, ApartmentsPage, CategoriesPage, TransactionsPage, SuperAdminPage, AssociationPage.

### Structure
```jsx
<Dialog open={open} onClose={onClose} maxWidth={size} fullWidth>
  {/* Header */}
  <DialogTitle sx={{ pb: 0.5 }}>
    {title}
    {subtitle && (
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
        {subtitle}
      </Typography>
    )}
  </DialogTitle>

  {/* Content */}
  <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
    {/* fields */}
  </DialogContent>

  {/* Footer */}
  <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
    <Box>
      {/* Destructive action here if applicable, else empty Box */}
      {onDelete && <Button sx={destructiveButtonSx} onClick={onDelete}>Eyða</Button>}
    </Box>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
      <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={onSave}>
        {saving ? <CircularProgress size={18} color="inherit" /> : saveLabel}
      </Button>
    </Box>
  </DialogActions>
</Dialog>
```

### Size rules
| Content | maxWidth |
|---------|----------|
| Simple form (≤4 fields) | `xs` (360px) |
| Medium form (5–8 fields) | `sm` (480px) |
| Table/preview content | `md` (680px) |
| Multi-column or wizard | `lg` |

### Field style inside dialogs
- All fields: `size="small"` and `fullWidth`
- Spacing: `gap: 2` (16px) between fields
- Field groups (date + amount side by side): `<Box sx={{ display: 'flex', gap: 2 }}>` — each field gets `sx={{ flex: 1 }}`

---

## 5. Amount Display

### Color rules
| Value | Color | Token |
|-------|-------|-------|
| Positive (> 0) | Green | `#2e7d32` |
| Negative (< 0) | Red | `#c62828` |
| Zero | Grey | `text.disabled` |

### Format rules
- Always use `fmtAmount(n)` from `format.js` — outputs `"160.000 kr."`
- No sign prefix on positive numbers
- Negative numbers: the minus sign comes from the number itself (e.g. `fmtAmount(-2805)` → `"−2.805 kr."`)
- Update `fmtAmount` to use the Unicode minus `−` (U+2212) instead of hyphen-minus `-` for negative numbers
- Font: `fontFamily: "monospace"` in all table cells showing amounts
- Alignment: always `align="right"` in tables

### Amount cell helper
Add to `tableUtils.js`:
```js
export function AmountCell({ value, sx = {}, ...props }) {
  const n = parseFloat(value) || 0;
  const color = n > 0 ? '#2e7d32' : n < 0 ? '#c62828' : 'text.disabled';
  return (
    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color, ...sx }} {...props}>
      {fmtAmount(n)}
    </TableCell>
  );
}
```

---

## 6. Status Chips

All status indicators use a consistent pill chip style. Add to `src/ui/chips.js`:

```js
const CHIP_STYLES = {
  CATEGORISED: { bg: '#f3f4f6', color: '#555',    label: 'Flokkað'   },
  IMPORTED:    { bg: '#fff8e1', color: '#e65100',  label: 'Óflokkað'  },
  RECONCILED:  { bg: '#e8f4fd', color: '#1565c0',  label: 'Jafnað'    },
  PAID:        { bg: '#e8f5e9', color: '#2e7d32',  label: 'Greitt'    },
  UNPAID:      { bg: '#fff3e0', color: '#e65100',  label: 'Ógreitt'   },
};

export function StatusChip({ status }) {
  const s = CHIP_STYLES[status] || { bg: '#f3f4f6', color: '#555', label: status };
  return (
    <Box component="span" sx={{
      background: s.bg, color: s.color,
      px: 1, py: 0.25, borderRadius: 3,
      fontSize: 11, fontWeight: 600,
      display: 'inline-block',
    }}>
      {s.label}
    </Box>
  );
}
```

Category chips (flokkur labels on transactions):
- Background: `#e3e8f4`, color: `#1D366F` (navy tint) — neutral, doesn't compete with status chips

---

## 7. Files to Create / Modify

### New files
- `src/ui/buttons.js` — button sx constants (see §3)
- `src/ui/chips.js` — StatusChip component (see §6)

### Modified files
- `src/controlers/tableUtils.js` — update HEAD_SX, HEAD_CELL_SX, add TOTALS_ROW_SX, add AmountCell
- `src/App.js` — remove secondary color theme override; update global button styles

### Pages to update (inline forms → dialogs + new anatomy)
| Page | Inline form to remove | Notes |
|------|-----------------------|-------|
| `OwnersPage.js` | AddOwnerForm (Collapse) | Move to AddOwnerDialog |
| `ApartmentsPage.js` | AddApartmentForm (Collapse) | Move to AddApartmentDialog |
| `CategoriesPage.js` | AddCategoryForm (Collapse) | Move to AddCategoryDialog |
| `TransactionsPage.js` | AddTransactionForm (Collapse) | Move to AddTransactionDialog |
| `AssociationPage.js` | BankAccountForm (Collapse) | Move to BankAccountDialog |
| `SuperAdminPage.js` | GlobalCreateCategoryDialog already dialog | Apply button sx |
| `ReportPage.js` | No inline form | Apply toolbar anatomy, button sx |
| `CollectionPage.js` | No inline form | Apply button sx, StatusChip |
| `BudgetPage.js` | No inline form | Apply button sx |
| `CategorisationRulesPage.js` | No inline form | Apply button sx |

### All pages
- Apply `primaryButtonSx` / `secondaryButtonSx` / `ghostButtonSx` / `destructiveButtonSx`
- Apply three-zone page anatomy (header / toolbar / content)
- Use `HEAD_SX`, `HEAD_CELL_SX`, `TOTALS_ROW_SX` from tableUtils
- Use `AmountCell` for all amount table cells
- Use `StatusChip` for all status displays
- Remove `color="secondary"` from all buttons

---

## 8. Out of Scope

- No changes to routing, API calls, or business logic
- No changes to the Sidebar component
- No changes to the MUI theme color palette (primary/secondary remain for non-button uses)
- No new pages or features
- No mobile/responsive work beyond what the three-zone layout naturally provides
