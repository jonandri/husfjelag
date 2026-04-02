# Húsfélag UI Style Guide

**Last updated:** 2026-04-02

This is the canonical reference for all UI and UX decisions in the Húsfélag React frontend. All future work must follow these rules. When adding a new page or component, read this document first.

---

## Page Anatomy

Every page uses a strict three-zone layout. No exceptions.

```
┌─────────────────────────────────────────────────┐
│ ① HEADER — title + subtitle | primary action    │  bg: white, border-bottom
├─────────────────────────────────────────────────┤
│ ② TOOLBAR — secondary actions + filters | count │  bg: #fafafa, border-bottom
├─────────────────────────────────────────────────┤
│ ③ CONTENT — table or panels, scrollable         │  bg: white, flex: 1
└─────────────────────────────────────────────────┘
```

### Zone ① — Header
- Left: `Typography variant="h5"` (page title) + `Typography variant="body2" color="text.secondary"` (subtitle)
- Right: **one** primary action button maximum
- Padding: `p: "16px 24px"`
- Background: white, `borderBottom: "1px solid #e8e8e8"`
- **Buttons that trigger the page's main create/import action live here.** E.g. `+ Ný færsla`, `Innflutningur`, `Endurflokka` all go in Zone 1.

### Zone ② — Toolbar
- Left: filter dropdowns; utility/secondary actions that are *not* the main page action
- Right: result count `Typography variant="caption" color="text.disabled"`
- Padding: `p: "8px 24px"`
- Background: `#fafafa`, `borderBottom: "1px solid #e8e8e8"`
- Omit entirely when the page has no filters and no secondary actions
- Active filter: `border: "1.5px solid #1D366F"`, `background: "#eef1f8"`, `color: "#1D366F"`
- Filter `Select` and `InputLabel`: `fontSize: 13` on both the `sx` and `inputProps`/`InputLabelProps`

### Zone ③ — Content
- `flex: 1, overflowY: "auto"`
- Tables wrapped in `<Paper variant="outlined">` with no extra margin
- Multi-panel pages use `Box sx={{ p: 4 }}` with `Paper variant="outlined"` sections separated by `mt: 4`

---

## Tables

All tables use shared constants from `src/controlers/tableUtils.js`. No inline header overrides.

### Header

```js
// tableUtils.js
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

### Rows
- `Table size="small"` always
- Row divider: `borderBottom: "1px solid #f2f2f2"`
- Hover: `hover` prop on `TableRow` (MUI default)
- Clickable rows: `cursor: "pointer"` via sx

### Column alignment
| Column type | Alignment | Extra |
|-------------|-----------|-------|
| Text | left | — |
| Amount | right | `fontFamily: "monospace"`, `whiteSpace: "nowrap"` |
| Status / chip | left | — |
| Label / category chip | left | — |
| Action icons | right | fixed width `48px` |

### Padding
- First column: `px: 3` (24 px)
- All other columns: `px: 2` (16 px)
- Action icon column: `px: 3` right

### Action column
- Use `IconButton size="small"` with `Tooltip`; never text links ("Breyta", "Eyða")
- Edit: `EditIcon fontSize="small"` — neutral color (inherit)
- Delete: `DeleteOutlineIcon fontSize="small"` — `sx={{ color: '#c62828' }}`
- Unlink: `LinkOffIcon fontSize="small"` — neutral color
- Link/match: `AddLinkIcon fontSize="small"` — `sx={{ color: '#bbb' }}`

```jsx
<TableCell align="right" sx={{ width: 48 }}>
  <Tooltip title="Breyta">
    <IconButton size="small" onClick={...}><EditIcon fontSize="small" /></IconButton>
  </Tooltip>
  <Tooltip title="Eyða">
    <IconButton size="small" sx={{ color: '#c62828' }} onClick={...}><DeleteOutlineIcon fontSize="small" /></IconButton>
  </Tooltip>
</TableCell>
```

### Totals row

```js
export const TOTALS_ROW_SX = {
  '& td': {
    fontWeight: 600,
    borderTop: '2px solid rgba(0,0,0,0.12)',
    color: 'text.primary',
  },
};
```

Use `<TableFooter>` with this sx.

---

## Amounts

### Display rules
| Value | Color |
|-------|-------|
| Positive (> 0) | Green `#2e7d32` |
| Negative (< 0) | Red `#c62828` |
| Zero | Grey `text.disabled` |

- Format via `fmtAmount(n)` from `format.js` — outputs `"160.000 kr."`
- Use Unicode minus `−` (U+2212) for negatives, not hyphen-minus
- Expenses in financial reports are shown as **negative numbers** so they display red. Negate at render time: `fmtAmount(-budgeted)` for budget (stays gray), `<AmountCell value={-actual} />` for actual (turns red)
- Budget column expenses: gray `sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#888' }}`

### AmountCell component

```js
// tableUtils.js
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

## Buttons

Four levels. No ad-hoc sx overrides beyond what is listed here.

| Level | Variant | Color | When to use |
|-------|---------|-------|-------------|
| **Primary** | `contained` | `#1D366F` navy | One per page/dialog — the single most important action |
| **Secondary** | `outlined` | `#1D366F` navy | Supporting page-level actions (import, export, utility) |
| **Ghost** | `text` | `#555` | Cancel, dismiss, navigate back |
| **Destructive** | `text` | `#c62828` | Delete/disable — dialogs only, never in toolbars |

```js
// src/ui/buttons.js
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

**Never** use `variant="contained"` on a destructive button. `destructiveButtonSx` is always used as `<Button sx={destructiveButtonSx}>` with no variant prop.

---

## Dialogs

### Standard create/edit dialog

```jsx
<Dialog open={open} onClose={onClose} maxWidth={size} fullWidth>
  <DialogTitle sx={{ pb: 0.5 }}>
    {title}
    {subtitle && (
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
        {subtitle}
      </Typography>
    )}
  </DialogTitle>

  <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
    {/* fields */}
  </DialogContent>

  <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
    <Box>
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

### Confirmation dialog (destructive action)

Same structure, but:
- No `onDelete` action in footer
- Primary button is ghost (`ghostButtonSx`), confirm button uses `destructiveButtonSx` as a `<Button sx={destructiveButtonSx}>` — **no** `variant="contained"`
- `DialogActions sx={{ px: 3, pb: 2 }}`

```jsx
<DialogActions sx={{ px: 3, pb: 2 }}>
  <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
  <Button sx={destructiveButtonSx} onClick={onConfirm}>Já, óvirkja</Button>
</DialogActions>
```

### Selection / picker dialog (e.g. ManualMatchDialog)

Used for choosing from a list of candidates:
- `maxWidth="sm"`, `fullWidth`
- Title: descriptive of what is being selected
- Content: selectable table — clicked row highlighted with `bgcolor: "#eef1f8"`
- Loading: `CircularProgress` centered
- Empty state: Icelandic message centered, `color: "text.secondary"`
- Error state: `<Alert severity="error">` 
- Footer: ghost cancel left, primary confirm right (disabled until a row selected)

```jsx
<DialogActions sx={{ px: 2, pb: 2 }}>
  <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
  <Button variant="contained" sx={primaryButtonSx} disabled={!selected} onClick={onConfirm}>
    Tengja
  </Button>
</DialogActions>
```

### Dialog size rules
| Content | maxWidth |
|---------|----------|
| Simple form (≤ 4 fields) | `xs` |
| Medium form (5–8 fields) | `sm` |
| Table / preview content | `md` |
| Multi-column or wizard | `lg` |

### Fields inside dialogs
- All fields: `size="small"`, `fullWidth`
- Spacing: `gap: 2` between fields
- Side-by-side fields: `<Box sx={{ display: 'flex', gap: 2 }}>` with `sx={{ flex: 1 }}` on each

---

## Status Chips

```js
// src/ui/chips.js
const CHIP_STYLES = {
  CATEGORISED: { bg: '#f3f4f6', color: '#555',   label: 'Flokkað'  },
  IMPORTED:    { bg: '#fff8e1', color: '#e65100', label: 'Óflokkað' },
  RECONCILED:  { bg: '#e8f4fd', color: '#1565c0', label: 'Jafnað'   },
  PAID:        { bg: '#e8f5e9', color: '#2e7d32', label: 'Greitt'   },
  UNPAID:      { bg: '#fff3e0', color: '#e65100', label: 'Ógreitt'  },
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

---

## Label Chips

Use `LabelChip` (from `src/ui/chips.js`) wherever a column shows a textual label that is not a status — e.g. category name, bank account name, payer indicator.

```js
export function LabelChip({ label }) {
  return (
    <Box component="span" sx={{
      background: '#e3e8f4', color: '#1D366F',
      px: 1, py: 0.25, borderRadius: 3,
      fontSize: 11, fontWeight: 500,
      display: 'inline-block',
    }}>
      {label}
    </Box>
  );
}
```

**Apply LabelChip to:**
- Transaction category name (TransactionsPage)
- Transaction bank account name / Reikningur column
- Accounting key labels (SuperAdminPage)
- Payer indicator ("Greiðandi") in OwnersPage

---

## Navigation / Sidebar

- "Yfirlit" (Reports/Overview page) is always the **first** item in the sidebar
- Route: `/yfirlit`
- "Yfirlit" is the **default post-login landing page** — the `/dashboard` redirect goes to `/yfirlit`
- Sidebar icon for Yfirlit: `BarChartOutlinedIcon`

---

## Typography

- Page title: `Typography variant="h5"` — bold via theme (`fontWeight: 600`)
- Subtitle / association context: `Typography variant="body2" color="text.secondary"`
- Table column headers: `HEAD_CELL_SX` (0.7rem, uppercase, 600 weight, #888)
- Result counts in toolbar: `variant="caption" color="text.disabled"`
- Filter controls: `fontSize: 13` on both the `Select sx` and the `InputLabel sx`
- Deactivate entity buttons (e.g. "Óvirkja eiganda", "Óvirkja íbúð"): `fontSize: '0.8rem'` — keep consistent across owner and apartment pages

---

## Source Files Reference

| What | File |
|------|------|
| Button sx constants | `src/ui/buttons.js` |
| StatusChip, LabelChip | `src/ui/chips.js` |
| HEAD_SX, HEAD_CELL_SX, TOTALS_ROW_SX, AmountCell | `src/controlers/tableUtils.js` |
| fmtAmount | `src/controlers/format.js` |
| Theme (primary navy, secondary green) | `src/App.js` |
