# UI Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a consistent design system across all pages — shared button/table/chip utilities, three-zone page anatomy, dialogs replacing all inline forms, and uniform amount display.

**Architecture:** Create two new shared utility files (`src/ui/buttons.js`, `src/ui/chips.js`), update `tableUtils.js` and `format.js`, then apply systematically to all 10 pages. Each task is independently deployable. No API or routing changes.

**Tech Stack:** React 17, MUI v5, existing `src/controlers/tableUtils.js` and `src/format.js` utilities.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/ui/buttons.js` | **Create** | Button sx constants for all 4 levels |
| `src/ui/chips.js` | **Create** | StatusChip component |
| `src/controlers/tableUtils.js` | **Modify** | Update HEAD_SX/HEAD_CELL_SX, add TOTALS_ROW_SX, AmountCell |
| `src/format.js` | **Modify** | Unicode minus in fmtAmount for negative numbers |
| `src/App.js` | **Modify** | Update typography h5 fontWeight; keep secondary green for non-button uses |
| `src/controlers/OwnersPage.js` | **Modify** | Page anatomy + AddOwnerForm → AddOwnerDialog |
| `src/controlers/ApartmentsPage.js` | **Modify** | Page anatomy + AddApartmentForm → AddApartmentDialog |
| `src/controlers/CategoriesPage.js` | **Modify** | Page anatomy + AddCategoryForm → AddCategoryDialog |
| `src/controlers/TransactionsPage.js` | **Modify** | Page anatomy + AddTransactionForm → AddTransactionDialog |
| `src/controlers/AssociationPage.js` | **Modify** | Page anatomy + BankAccountForm → BankAccountDialog |
| `src/controlers/CollectionPage.js` | **Modify** | Page anatomy + StatusChip + button sx |
| `src/controlers/BudgetPage.js` | **Modify** | Page anatomy + button sx |
| `src/controlers/ReportPage.js` | **Modify** | Page anatomy + button sx |
| `src/controlers/CategorisationRulesPage.js` | **Modify** | Page anatomy + button sx |
| `src/controlers/SuperAdminPage.js` | **Modify** | Button sx throughout |

---

## Task 1: Create shared button sx constants

**Files:**
- Create: `src/ui/buttons.js`

- [ ] **Step 1: Create the file**

```js
// src/ui/buttons.js

export const primaryButtonSx = {
    backgroundColor: '#1D366F',
    color: '#fff',
    textTransform: 'none',
    fontWeight: 500,
    '&:hover': { backgroundColor: '#162d5e' },
    '&:disabled': { backgroundColor: '#c5cfe8', color: '#fff' },
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

- [ ] **Step 2: Verify file exists**

```bash
cat HusfelagJS/src/ui/buttons.js
```
Expected: file prints the four exported constants.

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/ui/buttons.js
git commit -m "feat: add shared button sx constants"
```

---

## Task 2: Create StatusChip component

**Files:**
- Create: `src/ui/chips.js`

- [ ] **Step 1: Create the file**

```js
// src/ui/chips.js
import React from 'react';
import { Box } from '@mui/material';

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
            background: s.bg,
            color: s.color,
            px: 1,
            py: 0.25,
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            display: 'inline-block',
            whiteSpace: 'nowrap',
        }}>
            {s.label}
        </Box>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add HusfelagJS/src/ui/chips.js
git commit -m "feat: add StatusChip component"
```

---

## Task 3: Update tableUtils.js

**Files:**
- Modify: `src/controlers/tableUtils.js`

- [ ] **Step 1: Replace the file contents**

```js
// src/controlers/tableUtils.js
import React, { useState } from 'react';
import { TableCell, TableSortLabel } from '@mui/material';
import { fmtAmount } from '../format';

/** Sx applied to <TableHead> */
export const HEAD_SX = {
    backgroundColor: '#f5f5f5',
    '& th': { borderBottom: '1px solid #e8e8e8' },
};

/** Sx applied to each <TableCell> inside the header */
export const HEAD_CELL_SX = {
    fontWeight: 600,
    fontSize: '0.7rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#888',
    py: 1.25,
    whiteSpace: 'nowrap',
};

/** Sx for totals/footer rows */
export const TOTALS_ROW_SX = {
    '& td': {
        fontWeight: 600,
        borderTop: '2px solid rgba(0,0,0,0.12)',
        color: 'text.primary',
    },
};

/**
 * Table cell for currency amounts.
 * Green for positive, red for negative, grey for zero.
 */
export function AmountCell({ value, sx = {}, ...props }) {
    const n = parseFloat(value) || 0;
    const color = n > 0 ? '#2e7d32' : n < 0 ? '#c62828' : 'text.disabled';
    return (
        <TableCell
            align="right"
            sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color, ...sx }}
            {...props}
        >
            {fmtAmount(n)}
        </TableCell>
    );
}

/**
 * Sorting hook for tables.
 * @param {string} defaultKey  - field key to sort by initially
 * @param {'asc'|'desc'} defaultDir
 * @returns {{ sort(arr): arr, lbl(key, label): JSX }}
 */
export function useSort(defaultKey, defaultDir = 'asc') {
    const [key, setKey] = useState(defaultKey);
    const [dir, setDir] = useState(defaultDir);

    const toggle = (k) => {
        if (k === key) setDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setKey(k); setDir('asc'); }
    };

    const sort = (arr) => [...arr].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const na = parseFloat(av), nb = parseFloat(bv);
        const cmp = (!isNaN(na) && !isNaN(nb) && typeof av !== 'boolean')
            ? (na - nb)
            : typeof av === 'string'
                ? av.localeCompare(bv, 'is', { sensitivity: 'base' })
                : (av < bv ? -1 : av > bv ? 1 : 0);
        return dir === 'asc' ? cmp : -cmp;
    });

    const lbl = (k, children) => (
        <TableSortLabel
            active={key === k}
            direction={key === k ? dir : 'asc'}
            onClick={() => toggle(k)}
        >
            {children}
        </TableSortLabel>
    );

    return { sort, lbl };
}
```

- [ ] **Step 2: Verify the app still starts**

```bash
cd HusfelagJS && npm start
```
Expected: browser opens without console errors. Check one table page (e.g. /eigendur) — table headers should now be lighter grey (`#f5f5f5` bg) instead of the previous blue-tinted bg.

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/controlers/tableUtils.js
git commit -m "feat: update tableUtils with new HEAD_SX, TOTALS_ROW_SX, AmountCell"
```

---

## Task 4: Update fmtAmount to use Unicode minus

**Files:**
- Modify: `src/format.js`

- [ ] **Step 1: Update `intWithDots` to use Unicode minus for negatives**

Replace the `intWithDots` function and `fmtAmount`:

```js
/** Format integer with . as thousands separator, Unicode minus for negatives */
function intWithDots(n) {
    const rounded = Math.round(n);
    const abs = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return rounded < 0 ? `\u2212${abs}` : abs;
}

/** Format a currency amount as "981.500 kr." or "−2.805 kr." */
export function fmtAmount(n) {
    return intWithDots(parseFloat(n) || 0) + ' kr.';
}
```

- [ ] **Step 2: Verify in browser**

Open the app and navigate to /faerslur. A negative transaction amount should show `−2.805 kr.` (with a wider minus sign) instead of `-2.805 kr.`.

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/format.js
git commit -m "fix: use Unicode minus in fmtAmount for negative amounts"
```

---

## Task 5: Update App.js typography

**Files:**
- Modify: `src/App.js` lines 44–53

The theme's h5 fontWeight is `200` (very light). The design system uses page titles that should read at normal weight. Update h5 to `600`. Keep `secondary: '#08C076'` — it is still used for Chip colours and CollectionPage badges.

- [ ] **Step 1: Update h5 fontWeight in the theme**

In `src/App.js`, find the typography block and change h5:

```js
typography: {
    fontFamily: '"Inter", sans-serif',
    fontSize: 16,
    fontFeatureSettings: '"tnum"',
    h1: { fontWeight: 200 },
    h2: { fontWeight: 200 },
    h3: { fontWeight: 200 },
    h4: { fontWeight: 200 },
    h5: { fontWeight: 600 },   // ← was 200
    h6: { fontWeight: 400 },   // ← was 200
},
```

- [ ] **Step 2: Verify**

Open /eigendur. "Eigendur" page title should now be bold/semibold.

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/App.js
git commit -m "fix: increase h5/h6 fontWeight in theme for page title readability"
```

---

## Task 6: Apply design system to OwnersPage

**Files:**
- Modify: `src/controlers/OwnersPage.js`

This task:
1. Converts the `AddOwnerForm` collapse → `AddOwnerDialog`
2. Applies three-zone page anatomy
3. Applies button sx

- [ ] **Step 1: Add imports for button sx**

At the top of `OwnersPage.js`, add:
```js
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

Remove `Collapse` from the MUI import list (no longer needed after dialog conversion).

- [ ] **Step 2: Replace the page header + Collapse with dialog pattern**

Replace this block (roughly lines 66–88):
```jsx
// OLD
<Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Eigendur</Typography>
        <Button
            variant="contained" color="secondary" sx={{ color: '#fff' }}
            onClick={() => setShowForm(v => !v)}
        >
            {showForm ? 'Loka skráningarformi' : '+ Bæta við eiganda'}
        </Button>
    </Box>
    <Collapse in={showForm}>
        <AddOwnerForm ... />
    </Collapse>
```

With:
```jsx
// NEW — three-zone anatomy
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Box>
            <Typography variant="h5">Eigendur</Typography>
        </Box>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
            + Bæta við eiganda
        </Button>
    </Box>
    {/* Zone 3: Content (no toolbar needed — no filters) */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <AddOwnerDialog
            open={showForm}
            onClose={() => setShowForm(false)}
            userId={user.id}
            assocParam={assocParam}
            apartments={apartments}
            ownerships={active}
            onCreated={() => { setShowForm(false); loadAll(); }}
        />
```

- [ ] **Step 3: Rename `AddOwnerForm` → `AddOwnerDialog` and convert to dialog**

Replace the entire `AddOwnerForm` function with:
```jsx
function AddOwnerDialog({ open, onClose, userId, assocParam, apartments, ownerships, onCreated }) {
    const [kennitala, setKennitala] = useState('');
    const [apartmentId, setApartmentId] = useState('');
    const [share, setShare] = useState('');
    const [isPayer, setIsPayer] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) { setKennitala(''); setApartmentId(''); setShare(''); setIsPayer(false); setError(''); }
    }, [open]);

    const aptActive = ownerships.filter(o => String(o.apartment_id) === String(apartmentId));
    const existingSum = aptActive.reduce((s, o) => s + parseFloat(o.share || 0), 0);
    const round2 = n => Math.round(n * 100) / 100;
    const shareOver = parseFloat(share) > 0 && round2(existingSum + parseFloat(share)) > 100;
    const isValid = kennitala.length === 10 && apartmentId && parseFloat(share) > 0 && !shareOver;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Owner${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, kennitala, apartment_id: apartmentId, share: parseFloat(share), is_payer: isPayer }),
            });
            if (resp.ok) { onCreated(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch { setError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Skrá nýjan eiganda
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Eigandinn verður tengdur við valda íbúð
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField
                    label="Kennitala eiganda" value={kennitala} size="small" fullWidth autoFocus
                    onChange={e => setKennitala(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                    helperText={`${kennitala.length}/10`}
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>Íbúð</InputLabel>
                    <Select value={apartmentId} label="Íbúð" onChange={e => setApartmentId(e.target.value)}>
                        {apartments.map(a => (
                            <MenuItem key={a.id} value={a.id}>{a.anr} — {a.fnr}</MenuItem>
                        ))}
                    </Select>
                    {apartmentId && (
                        <FormHelperText>Núverandi hlutfall: {fmtPct(existingSum)} / 100%</FormHelperText>
                    )}
                </FormControl>
                <TextField
                    label="Hlutfall (%)" value={share} size="small" fullWidth type="number"
                    onChange={e => setShare(e.target.value)}
                    error={shareOver}
                    helperText={shareOver ? `Hlutfall fer yfir 100% (${fmtPct(existingSum)} + ${share}%)` : ''}
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>Greiðandi innheimtu</InputLabel>
                    <Select value={isPayer ? 'yes' : 'no'} label="Greiðandi innheimtu"
                        onChange={e => setIsPayer(e.target.value === 'yes')}>
                        <MenuItem value="yes">Já</MenuItem>
                        <MenuItem value="no">Nei</MenuItem>
                    </Select>
                </FormControl>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá eiganda'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 4: Update existing OwnerRow edit/delete buttons**

Find all `color="secondary" sx={{ color: '#fff' }}` patterns in `OwnersPage.js` and replace with `sx={primaryButtonSx}`. Find all `color="error"` or inline `sx={{ color: '#c62828' }}` destructive buttons and apply `sx={destructiveButtonSx}`. Find ghost/cancel buttons and apply `sx={ghostButtonSx}`.

- [ ] **Step 5: Apply `ghostButtonSx` to the "Óvirkir eigendur" toggle button**

```jsx
// Find this pattern (~line 127):
<Button size="small" variant="text" color="inherit"
    sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
    onClick={() => setShowDisabled(v => !v)}
>
// Replace with:
<Button size="small" sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}
    onClick={() => setShowDisabled(v => !v)}
>
```

- [ ] **Step 6: Verify**

Open /eigendur. "+ Bæta við eiganda" button should be navy. Click it — a dialog should open (not an inline form below). Fill in fields and save — owner appears in table. Dismiss with "Hætta við" — no state left in fields.

- [ ] **Step 7: Commit**

```bash
git add HusfelagJS/src/controlers/OwnersPage.js
git commit -m "feat: OwnersPage — three-zone anatomy, AddOwnerDialog, button sx"
```

---

## Task 7: Apply design system to ApartmentsPage

**Files:**
- Modify: `src/controlers/ApartmentsPage.js`

- [ ] **Step 1: Add import**

```js
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

Remove `Collapse` from MUI imports.

- [ ] **Step 2: Replace header + Collapse with three-zone anatomy**

```jsx
// Replace the outer Box sx={{ p: 4, ... }} wrapper and header block with:
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="h5">Íbúðir</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" sx={secondaryButtonSx} onClick={() => navigate('/ibudir/innflutningur')}>
                ⬇ HMS innflutningur
            </Button>
            <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
                + Bæta við íbúð
            </Button>
        </Box>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <AddApartmentDialog
            open={showForm}
            onClose={() => setShowForm(false)}
            userId={user.id}
            assocParam={assocParam}
            apartments={apartments.filter(a => !a.deleted)}
            onCreated={(updated) => { setShowForm(false); setApartments(updated); }}
        />
```

- [ ] **Step 3: Convert `AddApartmentForm` → `AddApartmentDialog`**

Wrap the existing form fields in a Dialog with the standard header/footer pattern. Keep all existing field logic unchanged — only the container changes:

```jsx
function AddApartmentDialog({ open, onClose, userId, assocParam, apartments, onCreated }) {
    // ... keep all existing state and handleSubmit unchanged ...

    React.useEffect(() => {
        if (!open) { /* reset all state fields to '' / false */ }
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Skrá nýja íbúð
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Íbúðin verður bætt við húsfélgaið
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                {/* existing fields — all size="small" fullWidth already */}
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá íbúð'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 4: Apply button sx to existing edit/delete dialogs in ApartmentRow**

Replace `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`. Replace `color="error"` → `sx={destructiveButtonSx}`. Replace cancel buttons → `sx={ghostButtonSx}`.

- [ ] **Step 5: Apply ghostButtonSx to "Óvirkar íbúðir" toggle**

Same pattern as OwnersPage step 5.

- [ ] **Step 6: Verify**

Open /ibudir. Dialog opens on click, closes and resets on cancel, saves correctly.

- [ ] **Step 7: Commit**

```bash
git add HusfelagJS/src/controlers/ApartmentsPage.js
git commit -m "feat: ApartmentsPage — three-zone anatomy, AddApartmentDialog, button sx"
```

---

## Task 8: Apply design system to CategoriesPage

**Files:**
- Modify: `src/controlers/CategoriesPage.js`

- [ ] **Step 1: Add import**

```js
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

Remove `Collapse` from MUI imports.

- [ ] **Step 2: Replace header + Collapse with three-zone anatomy**

```jsx
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="h5">Flokkar</Typography>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
            + Bæta við flokk
        </Button>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <AddCategoryDialog
            open={showForm}
            onClose={() => setShowForm(false)}
            userId={user.id}
            assocParam={assocParam}
            onCreated={() => { setShowForm(false); loadCategories(); }}
        />
```

- [ ] **Step 3: Convert `AddCategoryForm` → `AddCategoryDialog`**

```jsx
function AddCategoryDialog({ open, onClose, userId, assocParam, onCreated }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) { setName(''); setType(''); setError(''); }
    }, [open]);

    const isValid = name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Category${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name: name.trim(), type }),
            });
            if (resp.ok) { onCreated(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch { setError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Nýr flokkur
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Flokkar eru notaðir til að flokkja útgjöld og tekjur
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label="Nafn flokks" value={name} size="small" fullWidth autoFocus
                    onChange={e => setName(e.target.value)} />
                <FormControl size="small" fullWidth>
                    <InputLabel>Tegund</InputLabel>
                    <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                        {CATEGORY_TYPES.map(t => (
                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista flokk'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 4: Apply button sx to existing CategoryRow edit/delete dialogs**

Replace `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`. `color="error"` → `sx={destructiveButtonSx}`. Cancel buttons → `sx={ghostButtonSx}`. "Óvirkir flokkar" toggle → `sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}`.

- [ ] **Step 5: Verify and commit**

```bash
git add HusfelagJS/src/controlers/CategoriesPage.js
git commit -m "feat: CategoriesPage — three-zone anatomy, AddCategoryDialog, button sx"
```

---

## Task 9: Apply design system to TransactionsPage

**Files:**
- Modify: `src/controlers/TransactionsPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx } from '../ui/buttons';
import { StatusChip } from '../ui/chips';
import { AmountCell } from './tableUtils';
```

Remove `Collapse` from MUI imports (AddTransactionForm uses Collapse).

- [ ] **Step 2: Replace page wrapper with three-zone anatomy**

```jsx
// Replace <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}> and header block:
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Box>
            <Typography variant="h5">Færslur</Typography>
        </Box>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
            + Ný færsla
        </Button>
    </Box>
    {/* Zone 2: Toolbar */}
    <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" sx={secondaryButtonSx} onClick={() => setImportOpen(true)}>
                + Innflutningur
            </Button>
            {user?.is_superadmin && (
                <Button variant="outlined" sx={{ ...secondaryButtonSx, fontSize: '0.8rem' }}
                    disabled={recategorising}
                    onClick={/* existing handler */}>
                    {recategorising ? <CircularProgress size={14} color="inherit" /> : '↻ Endurflokka'}
                </Button>
            )}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <FormControl size="small">
                <Select value={year} onChange={e => setYear(e.target.value)}>
                    {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Bankareikningur</InputLabel>
                <Select value={filterBankAccount} label="Bankareikningur" onChange={e => setFilterBankAccount(e.target.value)}>
                    <MenuItem value="">Allir reikningar</MenuItem>
                    {bankAccounts.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Staða</InputLabel>
                <Select value={filterStatus} label="Staða" onChange={e => setFilterStatus(e.target.value)}>
                    <MenuItem value="">Allar stöður</MenuItem>
                    <MenuItem value="IMPORTED">Óflokkað</MenuItem>
                    <MenuItem value="CATEGORISED">Flokkað</MenuItem>
                    <MenuItem value="RECONCILED">Jafnað</MenuItem>
                </Select>
            </FormControl>
        </Box>
        <Typography variant="caption" color="text.disabled">{filtered.length} færslur</Typography>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto' }}>
```

- [ ] **Step 3: Remove the old separate filter bar** (the `<Box sx={{ display: 'flex', gap: 2, mb: 2 }}>` block below the header — these filters now live in Zone 2).

- [ ] **Step 4: Convert `AddTransactionForm` → `AddTransactionDialog`**

```jsx
function AddTransactionDialog({ open, onClose, userId, assocParam, bankAccounts, categories, onCreated }) {
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reference, setReference] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) {
            setBankAccountId(''); setDate(new Date().toISOString().slice(0, 10));
            setAmount(''); setDescription(''); setReference(''); setCategoryId(''); setError('');
        }
    }, [open]);

    const isValid = bankAccountId && date && amount && !isNaN(parseFloat(amount)) && description.trim();

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Transaction${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, bank_account_id: bankAccountId, date, amount, description: description.trim(), reference: reference.trim(), category_id: categoryId || null }),
            });
            if (resp.ok) { onCreated(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch { setError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Ný færsla
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Skráðu nýja bankafærslu handvirkt
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField label="Dagsetning" type="date" value={date}
                        onChange={e => setDate(e.target.value)}
                        size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
                    <TextField label="Upphæð" type="number" value={amount}
                        onChange={e => setAmount(e.target.value)}
                        size="small" sx={{ flex: 1 }} placeholder="-50000"
                        helperText="Neikvætt = útgjöld" />
                </Box>
                <FormControl size="small" fullWidth>
                    <InputLabel>Bankareikningur</InputLabel>
                    <Select value={bankAccountId} label="Bankareikningur" onChange={e => setBankAccountId(e.target.value)}>
                        <MenuItem value=""><em>Veldu reikning</em></MenuItem>
                        {bankAccounts.map(b => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
                    </Select>
                </FormControl>
                <TextField label="Lýsing" value={description}
                    onChange={e => setDescription(e.target.value)} size="small" fullWidth />
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField label="Tilvísun (valfrjálst)" value={reference}
                        onChange={e => setReference(e.target.value)} size="small" sx={{ flex: 1 }} />
                    <FormControl size="small" sx={{ flex: 1 }}>
                        <InputLabel>Flokkur (valfrjálst)</InputLabel>
                        <Select value={categoryId} label="Flokkur (valfrjálst)" onChange={e => setCategoryId(e.target.value)}>
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá færslu'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 5: Replace inline amount cell in `TransactionRow` with `AmountCell`**

```jsx
// Replace:
<TableCell align="right" sx={{ fontFamily: 'monospace', color: amount >= 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
    {fmtAmount(amount)}
</TableCell>
// With:
<AmountCell value={amount} />
```

- [ ] **Step 6: Replace `<Chip>` status in `TransactionRow` with `StatusChip`**

```jsx
// Replace:
<Chip label={statusInfo.label} size="small" color={statusInfo.color} />
// With:
<StatusChip status={tx.status} />
```

Also remove the `STATUS_LABELS` constant at the top of the file since `StatusChip` handles labels internally.

- [ ] **Step 7: Apply button sx to `CategoriseDialog`**

Replace `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`. Cancel → `sx={ghostButtonSx}`.

- [ ] **Step 8: Verify**

Open /faerslur. Toolbar shows filters + import button. "+ Ný færsla" opens dialog. Status chips match new style. Amounts are green/red/grey.

- [ ] **Step 9: Commit**

```bash
git add HusfelagJS/src/controlers/TransactionsPage.js
git commit -m "feat: TransactionsPage — three-zone anatomy, AddTransactionDialog, AmountCell, StatusChip"
```

---

## Task 10: Apply design system to AssociationPage

**Files:**
- Modify: `src/controlers/AssociationPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

Remove `Collapse` from MUI imports.

- [ ] **Step 2: Apply three-zone anatomy to main page**

The AssociationPage uses a multi-panel layout (KPI cards + BankAccountsPanel + AssociationRulesPanel). Zone 2 (toolbar) is not needed here. Apply header zone only:

```jsx
// Replace:
<Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
    <Typography variant="h5" gutterBottom sx={{ mb: 0.5 }}>{association.name}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>
    <Divider sx={{ mb: 3 }} />
// With:
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
        <Typography variant="h5">{association.name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
    </Box>
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
```

- [ ] **Step 3: Convert `BankAccountForm` collapse in `BankAccountsPanel` → `BankAccountDialog`**

In `BankAccountsPanel`, change:
```jsx
// Remove Collapse + showForm toggle from the panel header button
// Change button from "Loka / + Bæta við reikning" to always "+ Bæta við reikning"
<Button variant="contained" sx={primaryButtonSx} onClick={() => setShowForm(true)}>
    + Bæta við reikning
</Button>
```

Wrap existing `BankAccountForm` fields in a Dialog:
```jsx
function BankAccountDialog({ open, onClose, userId, assocParam, accountingKeys, onCreated }) {
    // ... all existing state from BankAccountForm ...
    React.useEffect(() => {
        if (!open) { setName(''); setAccountNumber(''); setAssetAccountId(''); setDescription(''); setError(''); }
    }, [open]);

    // ... existing isValid and handleSubmit unchanged, but call onClose on success ...

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Nýr bankareikningur
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Tengdu bankareikning við húsfélagið
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                {/* existing fields — size="small" fullWidth */}
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'flex-end' }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista reikning'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
```

- [ ] **Step 4: Apply button sx to `BankAccountEditDialog` and `AssociationRulesPanel` dialogs**

Replace `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`. `color="error"` → `sx={destructiveButtonSx}`. Cancel → `sx={ghostButtonSx}`.

- [ ] **Step 5: Apply button sx to role edit buttons in `RoleCard` and `RoleDialog`**

- [ ] **Step 6: Verify and commit**

```bash
git add HusfelagJS/src/controlers/AssociationPage.js
git commit -m "feat: AssociationPage — three-zone anatomy, BankAccountDialog, button sx"
```

---

## Task 11: Apply design system to CollectionPage

**Files:**
- Modify: `src/controlers/CollectionPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx } from '../ui/buttons';
import { StatusChip } from '../ui/chips';
import { AmountCell } from './tableUtils';
```

- [ ] **Step 2: Apply three-zone anatomy**

```jsx
// Replace outer Box wrapper and header:
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="h5">Innheimta</Typography>
        {/* primary action if any */}
    </Box>
    {/* Zone 2: Toolbar — month selector */}
    <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {/* existing month navigation controls */}
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
```

- [ ] **Step 3: Replace `StatusBadge` with `StatusChip`**

Find all usages of `<StatusBadge status={...} />` or inline status Chip renders and replace with `<StatusChip status={row.status === 'PAID' ? 'PAID' : 'UNPAID'} />`. Remove the old `StatusBadge` function.

- [ ] **Step 4: Replace amount cells with `AmountCell`**

Find all amount `<TableCell>` renders with `fmtAmount` and replace with `<AmountCell value={...} />`.

- [ ] **Step 5: Apply button sx to all buttons**

Replace `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`. Outlined → `sx={secondaryButtonSx}`. Cancel/ghost → `sx={ghostButtonSx}`.

- [ ] **Step 6: Verify and commit**

```bash
git add HusfelagJS/src/controlers/CollectionPage.js
git commit -m "feat: CollectionPage — three-zone anatomy, StatusChip, AmountCell, button sx"
```

---

## Task 12: Apply design system to BudgetPage

**Files:**
- Modify: `src/controlers/BudgetPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx } from '../ui/buttons';
import { AmountCell } from './tableUtils';
```

- [ ] **Step 2: Apply three-zone anatomy**

```jsx
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Box>
            <Typography variant="h5">{budget?.name || 'Áætlun'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {/* year or version info if available */}
            </Typography>
        </Box>
        <Button variant="contained" sx={primaryButtonSx} onClick={/* new budget wizard */}>
            + Ný áætlun
        </Button>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
```

- [ ] **Step 3: Replace amount cells with `AmountCell`**

Find all `<TableCell align="right">` cells containing `fmtAmount(...)` and replace with `<AmountCell value={...} />`. For budget vs actual cells where the value is always positive (budgeted amount), pass the raw positive value — `AmountCell` will color it green automatically.

- [ ] **Step 4: Apply button sx to `EditAmountDialog` and any other dialogs**

- [ ] **Step 5: Verify and commit**

```bash
git add HusfelagJS/src/controlers/BudgetPage.js
git commit -m "feat: BudgetPage — three-zone anatomy, AmountCell, button sx"
```

---

## Task 13: Apply design system to ReportPage

**Files:**
- Modify: `src/controlers/ReportPage.js`

- [ ] **Step 1: Add imports**

```js
import { ghostButtonSx } from '../ui/buttons';
import { AmountCell } from './tableUtils';
```

- [ ] **Step 2: Apply three-zone anatomy**

```jsx
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Typography variant="h5">Skýrslur</Typography>
        {/* no primary action */}
    </Box>
    {/* Zone 2: Toolbar — year selector */}
    <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Select size="small" value={year} onChange={e => setYear(e.target.value)} sx={{ minWidth: 90 }}>
            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </Select>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
```

- [ ] **Step 3: Replace inline HEAD_SX/HEAD_CELL_SX definitions**

`ReportPage.js` currently defines its own `HEAD_SX` and `HEAD_CELL_SX` at the top (lines 20–21). Delete those two lines and use the ones from `tableUtils.js` (already imported or add to import).

- [ ] **Step 4: Replace amount cells in all three tables with `AmountCell`**

Income table, expense table (actual + budgeted + variance columns), category drill dialog, and month drill dialog — all `<TableCell>` with `fmtAmount` → `<AmountCell value={...} />`.

For the variance column, the sign is meaningful (positive variance = under budget = green). Pass the raw variance value — `AmountCell` will color correctly.

For the net result row at the bottom (`Niðurstaða`), the `AmountCell` component uses `TableCell` which won't work inline in the dark navy row. Keep that cell as a custom `<TableCell>` with explicit color logic.

- [ ] **Step 5: Apply `ghostButtonSx` to "Loka" buttons in dialogs**

```jsx
<Button sx={ghostButtonSx} onClick={closeDrill}>Loka</Button>
<Button sx={ghostButtonSx} onClick={closeCatDrill}>Loka</Button>
```

- [ ] **Step 6: Verify and commit**

```bash
git add HusfelagJS/src/controlers/ReportPage.js
git commit -m "feat: ReportPage — three-zone anatomy, AmountCell, shared HEAD_SX, button sx"
```

---

## Task 14: Apply design system to CategorisationRulesPage

**Files:**
- Modify: `src/controlers/CategorisationRulesPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

- [ ] **Step 2: Apply three-zone anatomy**

```jsx
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    {/* Zone 1: Header */}
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Box>
            <Typography variant="h5">Flokkunarreglur</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Reglur sem nota lykilorð til að flokka færslur sjálfkrafa við innflutning
            </Typography>
        </Box>
        <Button variant="contained" sx={primaryButtonSx} onClick={() => openCreate(false)}>
            + Ný regla
        </Button>
    </Box>
    {/* Zone 3: Content */}
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3, maxWidth: 800 }}>
```

- [ ] **Step 3: Apply button sx throughout**

- The `+ Almenn regla` button (superadmin only): `variant="outlined" sx={secondaryButtonSx}`
- Dialog "Vista": `variant="contained" sx={primaryButtonSx}`
- Dialog "Hætta við": `sx={ghostButtonSx}`
- Delete dialog "Eyða": `variant="contained" color="error"` → `sx={destructiveButtonSx}` (or keep as contained error for emphasis — destructive confirmation dialogs may keep contained red)

- [ ] **Step 4: Verify and commit**

```bash
git add HusfelagJS/src/controlers/CategorisationRulesPage.js
git commit -m "feat: CategorisationRulesPage — three-zone anatomy, button sx"
```

---

## Task 15: Apply design system to SuperAdminPage

**Files:**
- Modify: `src/controlers/SuperAdminPage.js`

- [ ] **Step 1: Add imports**

```js
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
```

- [ ] **Step 2: Apply header anatomy**

SuperAdminPage uses a flat `<Box sx={{ p: 4 }}>` wrapper with a `<Typography variant="h5">` + `<Divider>`. Apply the header zone:

```jsx
<Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
    <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
        <Typography variant="h5">Kerfisstjóri</Typography>
    </Box>
    <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <Grid container spacing={4}>
            {/* existing panels unchanged */}
        </Grid>
    </Box>
</Box>
```

- [ ] **Step 3: Apply button sx to all panels**

Go through each panel (`CreateAssociationPanel`, `ImpersonatePanel`, `GlobalCategoriesPanel`, `GlobalAccountingKeysPanel`, `GlobalCategoryRulesPanel`) and replace:
- `color="secondary" sx={{ color: '#fff' }}` → `sx={primaryButtonSx}`
- `variant="outlined" color="secondary"` → `variant="outlined" sx={secondaryButtonSx}`
- `color="error"` → `sx={destructiveButtonSx}` (or keep contained for confirm dialogs)
- Cancel buttons → `sx={ghostButtonSx}`
- Text toggle buttons ("Óvirkir flokkar", "Óvirkir lyklar") → `sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}`

- [ ] **Step 4: Verify and commit**

```bash
git add HusfelagJS/src/controlers/SuperAdminPage.js
git commit -m "feat: SuperAdminPage — header anatomy, button sx"
```

---

## Task 16: Final pass — verify consistency

- [ ] **Step 1: Search for any remaining old button patterns**

```bash
grep -r "color=\"secondary\" sx={{ color: '#fff'" HusfelagJS/src/controlers/
grep -r "color=\"secondary\"" HusfelagJS/src/controlers/ | grep -v "//\|Chip\|CircularProgress\|color="
```
Expected: no results (or only Chip/CircularProgress uses of secondary colour).

- [ ] **Step 2: Search for remaining inline HEAD_SX definitions**

```bash
grep -n "backgroundColor.*rgba(29,54" HusfelagJS/src/controlers/
grep -n "backgroundColor.*#f5f5f5" HusfelagJS/src/controlers/ | grep -v tableUtils
```
Expected: no results outside tableUtils.js.

- [ ] **Step 3: Search for remaining double `kr.`**

```bash
grep -n "fmtAmount.*) kr\." HusfelagJS/src/controlers/
```
Expected: no results.

- [ ] **Step 4: Smoke-test all pages**

Visit each page and confirm:
- `/husfelag` — header zone, budget name shown
- `/ibudir` — dialog on "+ Bæta við íbúð"
- `/eigendur` — dialog on "+ Bæta við eiganda"
- `/flokkar` — dialog on "+ Bæta við flokk"
- `/faerslur` — toolbar with filters, dialog on "+ Ný færsla", StatusChips, green/red amounts
- `/innheimta` — StatusChips, green/red amounts
- `/aaetlun` — AmountCell in table
- `/skyrslur` — year in toolbar, AmountCell
- `/flokkunarreglur` — header zone, buttons navy
- `/superadmin` — header zone, buttons navy

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: design system — final consistency pass"
```

- [ ] **Step 6: Push and open PR**

```bash
git push origin HEAD
gh pr create --title "feat: consistent UI design system across all pages" \
  --body "Applies three-zone page anatomy, shared button hierarchy, AmountCell, StatusChip, and inline-form-to-dialog conversions across all 10 pages. Spec: docs/superpowers/specs/2026-04-02-ui-design-system.md" \
  --base main
```
