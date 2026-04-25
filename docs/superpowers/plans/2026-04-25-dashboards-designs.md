# Dashboard Designs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two redesigned screens from `docs/design/design_handoff_husfjelag_redesign/` — Yfirlit (financial dashboard) and Húsfélag (association main page with onboarding + post-setup states).

**Architecture:** Frontend-only changes. Two pages are rewritten using existing API endpoints (`/BankAccount`, `/Collection`, `/Report`, `/CategoryRule`, `/Transaction`). YfirlitPage is a new file replacing ReportPage at `/yfirlit`. AssociationPage is redesigned in-place with lifted data fetching and two render paths driven by a `setupComplete` boolean. All existing dialogs (RoleDialog, BankAccountDialog, etc.) are preserved unchanged.

**Tech Stack:** React 17, MUI v5 (Box/Typography/Table/Paper/IconButton), existing `apiFetch`, `fmtAmount` from `src/format.js`, existing button/chip patterns from `src/ui/`.

**Design reference:** `docs/design/design_handoff_husfjelag_redesign/` — treat the `.jsx` source files as high-fidelity specs. CSS token variables in `source/ds/colors_and_type.css` are the canonical color reference.

---

## File Map

**Files to create:**
- `HusfelagJS/src/ui/Eyebrow.js` — shared eyebrow label component (green/navy/muted variants)
- `HusfelagJS/src/ui/AnnualStatementDialog.js` — extracted from ReportPage so YfirlitPage can reuse it
- `HusfelagJS/src/controlers/YfirlitPage.js` — new Yfirlit financial dashboard

**Files to modify:**
- `HusfelagJS/src/App.js:159` — change `/yfirlit` route from `ReportPage` to `YfirlitPage`
- `HusfelagJS/src/controlers/ReportPage.js` — remove inline `AnnualStatementDialog`, import from shared file
- `HusfelagJS/src/controlers/AssociationPage.js` — complete redesign (layout + data lifting; all dialog components preserved)

---

## Key constants and helpers used throughout

```javascript
// Design tokens (as inline sx values — no CSS var needed)
const NAVY    = '#1D366F';
const GREEN   = '#08C076';
const BORDER  = '#e8e8e8';
const BORDER_ROW = '#f2f2f2';
const BG_SOFT = '#f3f4f6';
const POSITIVE = '#2e7d32';
const NEGATIVE = '#c62828';
const WARNING  = '#e65100';

// Mono sx for amounts / account numbers
const monoSx = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' };

// Section title (h2 equivalent in design)
// <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#111' }}>…</Typography>
```

---

## Task 1: Eyebrow shared component

**Files:**
- Create: `HusfelagJS/src/ui/Eyebrow.js`

- [ ] **Step 1: Create the file**

```javascript
// HusfelagJS/src/ui/Eyebrow.js
import React from 'react';
import { Box } from '@mui/material';

/**
 * Eyebrow label — uppercase, tracked, small.
 * variant: 'green' | 'navy' | 'muted'
 */
export default function Eyebrow({ children, variant = 'green', sx = {} }) {
    const color = variant === 'navy' ? '#1D366F' : variant === 'muted' ? '#888' : '#08C076';
    return (
        <Box component="span" sx={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color,
            ...sx,
        }}>
            {children}
        </Box>
    );
}
```

- [ ] **Step 2: Verify build is clean**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -5
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/ui/Eyebrow.js
git commit -m "feat: add Eyebrow shared label component"
```

---

## Task 2: Extract AnnualStatementDialog

Move the annual statement print dialog from ReportPage into a shared file so YfirlitPage can use it.

**Files:**
- Create: `HusfelagJS/src/ui/AnnualStatementDialog.js`
- Modify: `HusfelagJS/src/controlers/ReportPage.js`

The `AnnualStatementDialog` function currently starts at approximately line 73 of `ReportPage.js`. Read the file to find the exact bounds — it ends before the `SectionHeading` and `TotalsRow` helpers are used in the main `ReportPage` component. The component accepts props: `{ open, onClose, year, userId, assocParam }`.

- [ ] **Step 1: Read ReportPage.js to find the exact AnnualStatementDialog bounds**

The component starts with:
```javascript
function AnnualStatementDialog({ open, onClose, year, userId, assocParam }) {
```

Find where it ends (the closing `}` for that function, before `function ReportPage`).

- [ ] **Step 2: Create `src/ui/AnnualStatementDialog.js`**

Copy the entire `AnnualStatementDialog` function plus its required imports into the new file:

```javascript
// HusfelagJS/src/ui/AnnualStatementDialog.js
import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Alert, CircularProgress, Typography,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import CloseIcon from '@mui/icons-material/Close';
import { apiFetch } from '../api';
import { ghostButtonSx } from './buttons';
import { HEAD_SX, HEAD_CELL_SX } from '../controlers/tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

// These helpers are local to this file (copied from ReportPage)
function stmtFmt(n) {
    const num = parseFloat(n) || 0;
    const abs = Math.round(Math.abs(num)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return num < 0 ? `(${abs})` : abs;
}

function fmtSsn(s) {
    const d = String(s || '').replace(/\D/g, '');
    return d.length === 10 ? `${d.slice(0, 6)}-${d.slice(6)}` : d || '—';
}

// [PASTE the full AnnualStatementDialog function body here — copy from ReportPage.js verbatim]
export default function AnnualStatementDialog({ open, onClose, year, userId, assocParam }) {
    // ... copy the entire function body from ReportPage.js
}
```

**Important:** Copy the full function body verbatim from ReportPage.js. Do not rewrite it — this avoids introducing bugs. The only changes are: add `export default` before `function`, and ensure the helpers `stmtFmt` and `fmtSsn` are defined above it in the new file.

- [ ] **Step 3: Update ReportPage.js to import from the shared file**

In `ReportPage.js`:
1. Remove the `AnnualStatementDialog` function definition (and the `stmtFmt` / `fmtSsn` helpers if they are only used by that dialog — verify this first).
2. Add import at the top:
   ```javascript
   import AnnualStatementDialog from '../ui/AnnualStatementDialog';
   ```

- [ ] **Step 4: Build and verify**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors. If errors appear, check that helpers used inside `AnnualStatementDialog` that aren't in the new file are added there.

- [ ] **Step 5: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/ui/AnnualStatementDialog.js src/controlers/ReportPage.js
git commit -m "refactor: extract AnnualStatementDialog to shared ui file"
```

---

## Task 3: YfirlitPage — data fetching + hero KPI band

**Files:**
- Create: `HusfelagJS/src/controlers/YfirlitPage.js`

This task creates the page with all data fetching and the hero KPI band. Tasks 4 wires up the route.

The page fetches three sources in parallel:
1. `GET /BankAccount/{user.id}{assocParam}` → bank balances
2. `GET /Collection/{user.id}?month={month}&year={year}{assocParam}` → current-month collections
3. `GET /Report/{user.id}?year={year}{assocParam}` → budget categories with `budgeted`/`actual`

**Report API shape** (from `ReportView` in the backend):
```javascript
{
  expenses: [{ category_id, category_name, budgeted: "1200000.00", actual: "980000.00" }],
  income: [{ category_id, category_name, actual: "..." }],
  total_income: "...",
  total_expenses: "...",
  net: "...",
  year: 2026,
  association: { name, ssn, address, ... }
}
```

**Collection API shape** (from `CollectionView._month_mode`):
```javascript
{
  rows: [{ collection_id, anr, payer_name, payer_kennitala, amount_total, status, ... }],
  unmatched: [...],
  month: 4, year: 2026,
  bank_settings_configured: true,
}
```

**BankAccount API shape:**
```javascript
[{ id, name, account_number, current_balance: "4823000.00", ... }]
```

- [ ] **Step 1: Create the file with data fetching and loading state**

```javascript
// HusfelagJS/src/controlers/YfirlitPage.js
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Button, IconButton, Tooltip,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Paper,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import AssignmentIcon from '@mui/icons-material/Assignment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';
import { ghostButtonSx, secondaryButtonSx } from '../ui/buttons';
import { HEAD_SX, HEAD_CELL_SX, AmountCell } from './tableUtils';
import Eyebrow from '../ui/Eyebrow';
import AnnualStatementDialog from '../ui/AnnualStatementDialog';
import { useHelp } from '../ui/HelpContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const NAVY    = '#1D366F';
const GREEN   = '#08C076';
const BORDER  = '#e8e8e8';
const BORDER_ROW = '#f2f2f2';
const POSITIVE = '#2e7d32';
const NEGATIVE = '#c62828';
const WARNING  = '#e65100';
const monoSx = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' };

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Maí', 'Jún', 'Júl', 'Ágú', 'Sep', 'Okt', 'Nóv', 'Des'];

export default function YfirlitPage() {
    const navigate = useNavigate();
    const { user, assocParam, currentAssociation } = React.useContext(UserContext);
    const { openHelp } = useHelp();

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const [loading, setLoading] = useState(true);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [collections, setCollections] = useState([]);
    const [reportData, setReportData] = useState(null);
    const [annualOpen, setAnnualOpen] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        if (!user) return;
        setLoading(true);
        setError('');
        const qs = assocParam ? `${assocParam}` : '';
        const collQs = assocParam ? `${assocParam}&month=${month}&year=${year}` : `?month=${month}&year=${year}`;
        const repQs  = assocParam ? `${assocParam}&year=${year}` : `?year=${year}`;

        Promise.all([
            apiFetch(`${API_URL}/BankAccount/${user.id}${qs}`).then(r => r.ok ? r.json() : []),
            apiFetch(`${API_URL}/Collection/${user.id}${collQs}`).then(r => r.ok ? r.json() : { rows: [] }),
            apiFetch(`${API_URL}/Report/${user.id}${repQs}`).then(r => r.ok ? r.json() : null),
        ]).then(([banks, coll, report]) => {
            setBankAccounts(banks || []);
            setCollections((coll?.rows) || []);
            setReportData(report);
        }).catch(() => setError('Villa við að sækja gögn.'))
        .finally(() => setLoading(false));
    }, [user, assocParam, month, year]);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        load();
    }, [user, load, navigate]);

    if (loading) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    // ── Derived KPIs ──────────────────────────────────────────────────────────
    const totalBankBalance = bankAccounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0);
    const unpaidRows = collections.filter(r => r.status !== 'PAID');
    const unpaidAmount = unpaidRows.reduce((s, r) => s + parseFloat(r.amount_total || 0), 0);
    const unpaidCount = unpaidRows.length;
    const totalMonthly = collections.reduce((s, r) => s + parseFloat(r.amount_total || 0), 0);

    const expenses = reportData?.expenses || [];
    const totalBudget = expenses.reduce((s, e) => s + parseFloat(e.budgeted || 0), 0);
    const totalActual = expenses.reduce((s, e) => s + parseFloat(e.actual || 0), 0);
    const budgetPct = totalBudget > 0 ? Math.round(totalActual / totalBudget * 100) : 0;

    // ── Næstu skref (upcoming events) ─────────────────────────────────────────
    const nextMonth  = month === 12 ? 1 : month + 1;
    const upcoming = [
        {
            dateDay: '1', dateMon: MONTH_NAMES_SHORT[nextMonth - 1].toUpperCase(),
            icon: <EventRepeatIcon sx={{ fontSize: 18, color: NAVY }} />, bg: '#eef1f8',
            title: 'Innheimta', meta: totalMonthly > 0 ? `${fmtAmount(totalMonthly)} áætlað` : 'Engin innheimta stillt',
        },
        {
            dateDay: '15', dateMon: 'JÚN',
            icon: <AssignmentIcon sx={{ fontSize: 18, color: NAVY }} />, bg: '#eef1f8',
            title: 'Ársreikningur', meta: 'Skiladag 15. júní',
        },
        {
            dateDay: '31', dateMon: 'DES',
            icon: <WarningAmberIcon sx={{ fontSize: 18, color: WARNING }} />, bg: '#fff8e1',
            title: 'Skattframtal', meta: 'Árslokauppgjör',
        },
    ];

    const assocName = reportData?.association?.name || currentAssociation?.name || '';

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h5">Yfirlit</Typography>
                        {assocName && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                {assocName} · {year}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, gap: 0.5 }}
                            onClick={() => setAnnualOpen(true)}
                            startIcon={<DownloadIcon sx={{ fontSize: 17 }} />}
                        >
                            Sækja ársskýrslu
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('yfirlit')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: '28px 32px' }}>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

                    {/* ── Hero KPI band ─────────────────────────────────────── */}
                    <Box sx={{
                        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                        border: `1px solid ${BORDER}`, borderRadius: '6px', overflow: 'hidden',
                    }}>
                        {/* Cell 1: Bank balance with sparkline */}
                        <Box sx={{ p: '22px 24px', background: 'linear-gradient(135deg, #1D366F 0%, #0d2154 100%)', color: '#fff' }}>
                            <Eyebrow variant="muted" sx={{ color: 'rgba(255,255,255,0.7)' }}>STAÐA Í BÖNKUM</Eyebrow>
                            <Typography sx={{ ...monoSx, fontSize: 30, fontWeight: 500, mt: 1, color: '#fff' }}>
                                {fmtAmount(totalBankBalance)}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', mt: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <span style={{ color: '#7ed8b1' }}>▲</span> síðustu 30 daga
                            </Typography>
                            {/* Static sparkline */}
                            <Box component="svg" viewBox="0 0 200 40" sx={{ width: '100%', height: 36, mt: 1.5, display: 'block' }}>
                                <path d="M0,30 L20,28 L40,25 L60,26 L80,22 L100,24 L120,18 L140,15 L160,12 L180,10 L200,8" stroke="#08C076" strokeWidth="2" fill="none" />
                                <path d="M0,30 L20,28 L40,25 L60,26 L80,22 L100,24 L120,18 L140,15 L160,12 L180,10 L200,8 L200,40 L0,40 Z" fill="rgba(8,192,118,0.15)" />
                            </Box>
                        </Box>

                        {/* Cell 2: Unpaid */}
                        <Box sx={{ p: '22px 24px', borderLeft: `1px solid ${BORDER}` }}>
                            <Eyebrow variant="muted">ÓGREIDD INNHEIMTA</Eyebrow>
                            <Typography sx={{ ...monoSx, fontSize: 24, fontWeight: 500, mt: 1, color: NEGATIVE }}>
                                {fmtAmount(unpaidAmount)}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.75 }}>
                                {unpaidCount} íbúð{unpaidCount === 1 ? '' : 'ir'} í vanskilum
                            </Typography>
                        </Box>

                        {/* Cell 3: Budget % */}
                        <Box sx={{ p: '22px 24px', borderLeft: `1px solid ${BORDER}` }}>
                            <Eyebrow variant="muted">RAUN VS ÁÆTLUN</Eyebrow>
                            <Typography sx={{ ...monoSx, fontSize: 24, fontWeight: 500, mt: 1 }}>
                                {budgetPct}%
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.75 }}>nýtt af áætlun ársins</Typography>
                            <Box sx={{ height: 4, background: '#eee', borderRadius: 1, mt: 1, overflow: 'hidden' }}>
                                <Box sx={{ width: `${Math.min(100, budgetPct)}%`, height: '100%', background: NAVY }} />
                            </Box>
                        </Box>

                        {/* Cell 4: Monthly collection */}
                        <Box sx={{ p: '22px 24px', borderLeft: `1px solid ${BORDER}` }}>
                            <Eyebrow variant="muted">MÁNAÐARLEG INNHEIMTA</Eyebrow>
                            <Typography sx={{ ...monoSx, fontSize: 24, fontWeight: 500, mt: 1, color: POSITIVE }}>
                                {fmtAmount(totalMonthly)}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.75 }}>
                                Næst: 1. {MONTH_NAMES_SHORT[nextMonth - 1].toLowerCase()}
                            </Typography>
                        </Box>
                    </Box>

                    {/* TODO: Næstu skref + Áætlun bars + Variance table — added in Task 4 */}

                </Box>
            </Box>

            <AnnualStatementDialog
                open={annualOpen}
                onClose={() => setAnnualOpen(false)}
                year={year}
                userId={user?.id}
                assocParam={assocParam}
            />
        </div>
    );
}
```

- [ ] **Step 2: Verify build is clean**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/YfirlitPage.js
git commit -m "feat: add YfirlitPage with data fetching and hero KPI band"
```

---

## Task 4: YfirlitPage — Næstu skref, Áætlun bars, variance table + App.js route

**Files:**
- Modify: `HusfelagJS/src/controlers/YfirlitPage.js` (add sections below hero)
- Modify: `HusfelagJS/src/App.js` (swap route)

- [ ] **Step 1: Replace the `{/* TODO */}` comment in YfirlitPage.js**

Find this comment in the content zone, after the hero KPI band:
```javascript
                    {/* TODO: Næstu skref + Áætlun bars + Variance table — added in Task 4 */}
```

Replace with the following (keep the hero KPI band above it unchanged):

```javascript
                    {/* ── Two-column row: Næstu skref + Áætlun bars ─────── */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 3, mt: 4 }}>

                        {/* Næstu skref */}
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Næstu skref</Typography>
                            </Box>
                            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '6px' }}>
                                {upcoming.map((u, i) => (
                                    <Box key={i} sx={{
                                        display: 'flex', gap: 1.75, p: '14px 16px', alignItems: 'center',
                                        borderBottom: i < upcoming.length - 1 ? `1px solid ${BORDER_ROW}` : 'none',
                                    }}>
                                        <Box sx={{ width: 42, textAlign: 'center', flexShrink: 0 }}>
                                            <Typography sx={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                                                {u.dateMon}
                                            </Typography>
                                            <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.1 }}>
                                                {u.dateDay}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ width: 32, height: 32, borderRadius: '8px', background: u.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {u.icon}
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{u.title}</Typography>
                                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.25 }}>{u.meta}</Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        {/* Áætlun vs raun — variance bars */}
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Áætlun vs raun · {year}</Typography>
                                <Typography sx={{ fontSize: 12, color: '#888' }}>Eftir flokki</Typography>
                            </Box>
                            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '6px', py: 0.75 }}>
                                {expenses.slice(0, 6).map((e, i) => {
                                    const b = parseFloat(e.budgeted || 0);
                                    const a = parseFloat(e.actual || 0);
                                    const pct = b > 0 ? Math.round(a / b * 100) : 0;
                                    const barColor = pct > 90 ? NEGATIVE : pct > 50 ? WARNING : NAVY;
                                    return (
                                        <Box key={e.category_id || i} sx={{ p: '10px 16px', display: 'grid', gridTemplateColumns: '140px 1fr 90px 44px', gap: 1.5, alignItems: 'center', fontSize: 13 }}>
                                            <Typography sx={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {e.category_name}
                                            </Typography>
                                            <Box sx={{ height: 6, background: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <Box sx={{ width: `${Math.min(100, pct)}%`, height: '100%', background: barColor, transition: 'width 200ms ease' }} />
                                            </Box>
                                            <Typography sx={{ ...monoSx, fontSize: 12, color: '#555', textAlign: 'right' }}>
                                                {fmtAmount(a)}
                                            </Typography>
                                            <Typography sx={{ ...monoSx, fontSize: 12, color: '#888', textAlign: 'right' }}>
                                                {pct}%
                                            </Typography>
                                        </Box>
                                    );
                                })}
                                {expenses.length === 0 && (
                                    <Typography sx={{ fontSize: 13, color: '#888', p: '12px 16px' }}>Engin áætlun skráð.</Typography>
                                )}
                                <Box sx={{ p: '10px 16px', borderTop: `1px solid ${BORDER}`, mt: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Samtals nýtt</Typography>
                                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                        <Typography sx={{ ...monoSx, fontSize: 13 }}>{fmtAmount(totalActual)} / {fmtAmount(totalBudget)}</Typography>
                                        <Box component="span" sx={{ background: '#e3e8f4', color: NAVY, fontSize: 11, fontWeight: 600, px: 1, py: 0.25, borderRadius: 3 }}>
                                            {budgetPct}%
                                        </Box>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    {/* ── Sundurliðun — full variance table ─────────────── */}
                    <Box sx={{ mt: 4 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Sundurliðun</Typography>
                        </Box>
                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '4px', overflow: 'hidden' }}>
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                        <TableCell align="right" sx={HEAD_CELL_SX}>Áætlun</TableCell>
                                        <TableCell align="right" sx={HEAD_CELL_SX}>Raun</TableCell>
                                        <TableCell align="right" sx={HEAD_CELL_SX}>Frávik</TableCell>
                                        <TableCell align="right" sx={{ ...HEAD_CELL_SX, width: 120 }}>Nýting</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {expenses.map((e, i) => {
                                        const b = parseFloat(e.budgeted || 0);
                                        const a = parseFloat(e.actual || 0);
                                        const variance = b - a;
                                        const pct = b > 0 ? Math.round(a / b * 100) : 0;
                                        const over = pct > 100;
                                        return (
                                            <TableRow key={e.category_id || i} hover>
                                                <TableCell>{e.category_name}</TableCell>
                                                <AmountCell value={b} />
                                                <AmountCell value={a} />
                                                <TableCell align="right" sx={{ ...monoSx, color: over ? NEGATIVE : POSITIVE, fontSize: 13 }}>
                                                    {fmtAmount(Math.abs(variance))}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                                                        <Box sx={{ width: 60, height: 5, background: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <Box sx={{ width: `${Math.min(100, pct)}%`, height: '100%', background: over ? NEGATIVE : NAVY, transition: 'width 200ms ease' }} />
                                                        </Box>
                                                        <Typography sx={{ ...monoSx, fontSize: 12, color: '#888', width: 32, textAlign: 'right' }}>
                                                            {pct}%
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {expenses.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} sx={{ color: '#888', textAlign: 'center' }}>Engin áætlun skráð.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                    <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                                        <TableCell>Samtals</TableCell>
                                        <AmountCell value={totalBudget} sx={{ fontWeight: 600 }} />
                                        <AmountCell value={totalActual} sx={{ fontWeight: 600 }} />
                                        <TableCell />
                                        <TableCell />
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </Box>
                    </Box>
```

- [ ] **Step 2: Update the `/yfirlit` route in App.js**

In `HusfelagJS/src/App.js`, add the import for YfirlitPage near the other import lines:
```javascript
import YfirlitPage from './controlers/YfirlitPage';
```

Then find:
```javascript
            <Route path="/yfirlit" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
```
Replace with:
```javascript
            <Route path="/yfirlit" element={<ProtectedRoute><YfirlitPage /></ProtectedRoute>} />
```

(ReportPage is still imported and still renders for any references, but no longer on this route. Keep the import and existing routes unchanged.)

- [ ] **Step 3: Build**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/YfirlitPage.js src/App.js
git commit -m "feat: complete YfirlitPage with variance table and wire up /yfirlit route"
```

---

## Task 5: AssociationPage — lift data fetching and derive setupComplete

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`

The goal of this task is to:
1. Add `bankAccounts`, `rules`, and `collections` to the main `loadAll()` in `AssociationPage`.
2. Derive a `setupComplete` count (0–6) from that data.
3. Pass `bankAccounts` and `rules` down to their respective panels as props so they don't re-fetch.
4. Keep everything rendering exactly the same as before (the layout changes come in Tasks 6–8).

The 6 setup steps and their completion criteria:
| # | Step | Criteria |
|---|------|----------|
| 1 | Stofna húsfélag | always `true` — association exists |
| 2 | Bæta við stjórn | `association.chair && association.cfo` |
| 3 | Skrá íbúðir | `association.apartment_count > 0` |
| 4 | Tengja banka | `bankAccounts.length > 0` |
| 5 | Setja flokkunarreglur | `rules.length > 0` |
| 6 | Hefja innheimtu | current-month `collections.length > 0` |

- [ ] **Step 1: Update loadAll() and state in the main AssociationPage function**

In `AssociationPage.js`, find the existing `useState` declarations at the top of `AssociationPage()`:
```javascript
    const [association, setAssociation] = useState(undefined);
    const [owners, setOwners] = useState([]);
    const [error, setError] = useState('');
    const [roleDialog, setRoleDialog] = useState(null);
```
Add three new state variables:
```javascript
    const [bankAccounts, setBankAccounts] = useState([]);
    const [rules, setRules] = useState([]);
    const [collections, setCollections] = useState([]);
```

- [ ] **Step 2: Update loadAll() to fetch bank accounts, rules, collections**

Find the existing `loadAll` function:
```javascript
    const loadAll = async () => {
        try {
            const [assocResp, ownersResp] = await Promise.all([
                apiFetch(`${API_URL}/Association/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/Owner/${user.id}${assocParam}`),
            ]);

            if (assocResp.ok) setAssociation(await assocResp.json());
            else { setError('Villa við að sækja húsfélag.'); setAssociation(null); }

            if (ownersResp.ok) {
                const all = await ownersResp.json();
                const seen = new Set();
                setOwners(all.filter(o => !o.deleted && !seen.has(o.user_id) && seen.add(o.user_id)));
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setAssociation(null);
        }
    };
```

Replace with:
```javascript
    const loadAll = async () => {
        const today = new Date();
        const month = today.getMonth() + 1;
        const year  = today.getFullYear();
        const collQs = assocParam ? `${assocParam}&month=${month}&year=${year}` : `?month=${month}&year=${year}`;
        try {
            const [assocResp, ownersResp, banksResp, rulesResp, collResp] = await Promise.all([
                apiFetch(`${API_URL}/Association/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/Owner/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/BankAccount/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/CategoryRule/${user.id}${assocParam}`),
                apiFetch(`${API_URL}/Collection/${user.id}${collQs}`),
            ]);

            if (assocResp.ok) setAssociation(await assocResp.json());
            else { setError('Villa við að sækja húsfélag.'); setAssociation(null); }

            if (ownersResp.ok) {
                const all = await ownersResp.json();
                const seen = new Set();
                setOwners(all.filter(o => !o.deleted && !seen.has(o.user_id) && seen.add(o.user_id)));
            }

            if (banksResp.ok) setBankAccounts(await banksResp.json());
            if (rulesResp.ok) {
                const rd = await rulesResp.json();
                setRules(rd.association_rules || []);
            }
            if (collResp.ok) {
                const cd = await collResp.json();
                setCollections(cd.rows || []);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setAssociation(null);
        }
    };
```

- [ ] **Step 3: Derive setupComplete below the loading guard**

Find the section after the loading guard (after `if (!association)` returns the form):
```javascript
    const subtitle = [
```

Insert above the `subtitle` line:
```javascript
    const setupSteps = [
        true,                                             // 1. Stofna húsfélag
        !!(association.chair && association.cfo),         // 2. Bæta við stjórn
        association.apartment_count > 0,                  // 3. Skrá íbúðir
        bankAccounts.length > 0,                          // 4. Tengja banka
        rules.length > 0,                                 // 5. Setja flokkunarreglur
        collections.length > 0,                           // 6. Hefja innheimtu
    ];
    const setupComplete = setupSteps.filter(Boolean).length;
    const isSetup = setupComplete >= 6;
```

- [ ] **Step 4: Pass bankAccounts and rules as props to sub-panels, remove their internal fetching**

In the render, update the `BankAccountsPanel` and `AssociationRulesPanel` calls:
```javascript
                    <BankAccountsPanel
                        user={user}
                        assocParam={assocParam}
                        currentAssociation={currentAssociation}
                        bankAccounts={bankAccounts}
                        onReload={loadAll}
                    />
                    <AssociationRulesPanel
                        user={user}
                        assocParam={assocParam}
                        rules={rules}
                        onReload={loadAll}
                    />
```

Then update the `BankAccountsPanel` function signature and remove its internal fetching:

Find `function BankAccountsPanel({ user, assocParam, currentAssociation })` and change to:
```javascript
function BankAccountsPanel({ user, assocParam, currentAssociation, bankAccounts, onReload }) {
```

Remove the `const [bankAccounts, setBankAccounts]` state, remove `loadBankAccounts` function, remove the `useEffect` that called it. Change `onCreated={loadBankAccounts}` to `onCreated={onReload}` in the `BankAccountDialog`. Change `onSaved={loadBankAccounts}` to `onSaved={onReload}` in `BankAccountRow`. Remove the loading spinner block that checked `bankAccounts === undefined` (it's now always an array).

Find `function AssociationRulesPanel({ user, assocParam })` and change to:
```javascript
function AssociationRulesPanel({ user, assocParam, rules, onReload }) {
```

Remove the `const [rules, setRules]` state. Remove the `load` function and its `useEffect`. Replace `load()` calls after CRUD with `onReload()`. Remove the internal loading spinner (rules is always an array now, loading is controlled by parent).

- [ ] **Step 5: Build and verify no regressions**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/AssociationPage.js
git commit -m "refactor: lift bank/rules/collections fetching to AssociationPage, derive setupComplete"
```

---

## Task 6: AssociationPage — Uppsetning (onboarding) view

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`

This task implements the onboarding view that renders when `isSetup === false`. Keep the existing post-setup layout code untouched for now (Tasks 7–8 will redesign it). Add an `if (!isSetup) return <UppsetningView ... />` before the current return.

**Design reference:** `docs/design/design_handoff_husfjelag_redesign/source/husfelag-v3.jsx`

The design shows:
- Page header with association name + kennitala subtitle + "Leiðbeiningar" ghost button
- Big setup hero: eyebrow "UPPSETNING · N AF 6 LOKIÐ", H2 with completion count, progress bar, 6-step grid, CTA button
- 2×2 grid below: Stjórn card (filled) + Íbúðir placeholder, Banka placeholder + Rules placeholder

- [ ] **Step 1: Add necessary MUI icon imports at the top of AssociationPage.js**

In the imports section, add these icons if not already imported:
```javascript
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RuleIcon from '@mui/icons-material/Rule';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
```

Also add `Eyebrow` import:
```javascript
import Eyebrow from '../ui/Eyebrow';
```

- [ ] **Step 2: Add the Uppsetning view return path**

After the `isSetup` derivation in the main `AssociationPage` function, and before the `const subtitle = [...]` line, add:

```javascript
    if (!isSetup) {
        return <UppsetningView
            association={association}
            setupSteps={setupSteps}
            setupComplete={setupComplete}
            owners={owners}
            onNavigate={(path) => navigate(path)}
        />;
    }
```

- [ ] **Step 3: Add the UppsetningView component at the bottom of the file (before `export default`)**

```javascript
const NAVY = '#1D366F';
const BORDER = '#e8e8e8';

const SETUP_STEP_DEFS = [
    { icon: <BusinessIcon sx={{ fontSize: 18 }} />, title: 'Stofna húsfélag', sub: 'Heiti, kennitala, heimilisfang', navPath: null },
    { icon: <GroupIcon sx={{ fontSize: 18 }} />, title: 'Bæta við stjórn', sub: 'Formaður og gjaldkeri', navPath: null },
    { icon: <HomeIcon sx={{ fontSize: 18 }} />, title: 'Skrá íbúðir', sub: 'Íbúðir + eignarhlutföll', navPath: '/ibudir/innflutningur' },
    { icon: <AccountBalanceIcon sx={{ fontSize: 18 }} />, title: 'Tengja banka', sub: 'Sjálfvirk afstemming', navPath: '/bank-settings' },
    { icon: <RuleIcon sx={{ fontSize: 18 }} />, title: 'Setja flokkunarreglur', sub: 'Sjálfvirk flokkun bankafærslna', navPath: '/husfelag' },
    { icon: <EventRepeatIcon sx={{ fontSize: 18 }} />, title: 'Hefja innheimtu', sub: 'Mánaðarlegar greiðslur', navPath: '/innheimta' },
];

function UppsetningView({ association, setupSteps, setupComplete, owners, onNavigate }) {
    const firstIncomplete = setupSteps.findIndex(done => !done);
    const nextPath = firstIncomplete >= 0 ? SETUP_STEP_DEFS[firstIncomplete].navPath : null;

    const chair = owners.find(o => o.role === 'CHAIR' || o.role === 'Formaður');
    const cfo   = owners.find(o => o.role === 'CFO'   || o.role === 'Gjaldkeri');

    const subtitle = `Kennitala ${fmtKennitala(association.ssn)}${association.address ? ` · ${association.address}` : ''}`;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h5">{association.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>
                    </Box>
                    <Button sx={ghostButtonSx} startIcon={<HelpOutlineIcon sx={{ fontSize: 17 }} />}>
                        Leiðbeiningar
                    </Button>
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: '28px 32px' }}>

                    {/* Setup hero */}
                    <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '8px', p: '28px 32px' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Eyebrow variant="green">UPPSETNING · {setupComplete} AF 6 LOKIÐ</Eyebrow>
                                <Typography sx={{ fontSize: 24, fontWeight: 300, mt: 0.75, mb: 0.5 }}>
                                    Settu upp húsfélagið —{' '}
                                    <Box component="span" sx={{ fontWeight: 600 }}>
                                        {6 - setupComplete} skref eftir
                                    </Box>
                                </Typography>
                                <Typography sx={{ fontSize: 13.5, color: '#555' }}>
                                    Eftir uppsetningu sér kerfið um innheimtu, afstemmingu og ársskýrslu.
                                </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 4 }}>
                                <Typography sx={{ fontSize: 28, fontWeight: 300, color: NAVY, fontFamily: '"JetBrains Mono", monospace' }}>
                                    {Math.round(setupComplete / 6 * 100)}%
                                </Typography>
                                <Typography sx={{ fontSize: 11, color: '#888', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                    LOKIÐ
                                </Typography>
                            </Box>
                        </Box>

                        {/* Progress bar */}
                        <Box sx={{ height: 5, background: '#f0f0f0', borderRadius: '3px', mt: 2.5, overflow: 'hidden' }}>
                            <Box sx={{ width: `${Math.round(setupComplete / 6 * 100)}%`, height: '100%', background: '#08C076', transition: 'width 300ms ease' }} />
                        </Box>

                        {/* Step grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mt: 2.5 }}>
                            {SETUP_STEP_DEFS.map((def, i) => {
                                const done = setupSteps[i];
                                const isPrimary = !done && setupSteps.slice(0, i).every(Boolean);
                                return (
                                    <Box key={i}
                                        onClick={() => def.navPath && onNavigate(def.navPath)}
                                        sx={{
                                            border: isPrimary ? `1.5px solid ${NAVY}` : `1px solid ${BORDER}`,
                                            background: done ? '#fafafa' : isPrimary ? '#eef1f8' : '#fff',
                                            borderRadius: '6px', p: '14px 16px',
                                            opacity: done ? 0.7 : 1,
                                            cursor: def.navPath && !done ? 'pointer' : 'default',
                                            '&:hover': def.navPath && !done ? { borderColor: NAVY } : {},
                                            transition: '150ms',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                            <Box sx={{ color: done ? '#2e7d32' : isPrimary ? NAVY : '#888', display: 'flex' }}>
                                                {done ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#2e7d32' }} /> : def.icon}
                                            </Box>
                                            <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: isPrimary ? NAVY : '#111' }}>
                                                {def.title}
                                            </Typography>
                                        </Box>
                                        <Typography sx={{ fontSize: 11.5, color: '#555', mt: 0.75, ml: 3.5 }}>
                                            {def.sub}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>

                        {/* CTA */}
                        {nextPath && (
                            <Box sx={{ mt: 3 }}>
                                <Button
                                    variant="contained"
                                    sx={primaryButtonSx}
                                    onClick={() => onNavigate(nextPath)}
                                >
                                    Halda áfram með uppsetningu →
                                </Button>
                            </Box>
                        )}
                    </Box>

                    {/* Stjórn + Íbúðir strip */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 3.5 }}>
                        <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '6px', p: '18px 20px' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Eyebrow variant="navy">STJÓRN</Eyebrow>
                            </Box>
                            {[
                                { person: chair, roleLabel: 'Formaður', initColor: { bg: '#e8f5e9', color: '#2e7d32' } },
                                { person: cfo,   roleLabel: 'Gjaldkeri', initColor: { bg: '#eef1f8', color: NAVY } },
                            ].map(({ person, roleLabel, initColor }) =>
                                person ? (
                                    <Box key={roleLabel} sx={{ display: 'flex', gap: 1.75, alignItems: 'center', py: 1 }}>
                                        <Box sx={{ width: 38, height: 38, borderRadius: '50%', background: initColor.bg, color: initColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                                            {person.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                                        </Box>
                                        <Box>
                                            <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{person.name}</Typography>
                                            <Typography sx={{ fontSize: 11.5, color: '#555' }}>{roleLabel}</Typography>
                                        </Box>
                                    </Box>
                                ) : (
                                    <Typography key={roleLabel} sx={{ fontSize: 12.5, color: '#888', py: 0.5 }}>
                                        {roleLabel}: —
                                    </Typography>
                                )
                            )}
                        </Box>

                        <Box sx={{ border: '1.5px dashed #c5cfe8', borderRadius: '6px', p: '18px 20px', background: '#fafbfd', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Eyebrow variant="navy">ÍBÚÐIR · NÆSTA SKREF</Eyebrow>
                            <Typography sx={{ fontSize: 14.5, fontWeight: 500, mt: 0.75, mb: 0.5 }}>
                                {association.apartment_count > 0 ? `${association.apartment_count} íbúðir skráðar` : 'Engar íbúðir skráðar enn'}
                            </Typography>
                            {association.apartment_count === 0 && (
                                <>
                                    <Typography sx={{ fontSize: 12.5, color: '#555', mb: 1.75 }}>
                                        Skráðu íbúðirnar svo eignarhlutföllin reiknist sjálfkrafa.
                                    </Typography>
                                    <Button variant="contained" sx={primaryButtonSx} onClick={() => onNavigate('/ibudir/innflutningur')} startIcon={<HomeIcon />}>
                                        Skrá íbúðir
                                    </Button>
                                </>
                            )}
                        </Box>
                    </Box>

                    {/* Bank + Rules placeholders */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
                        <Box sx={{ border: '1.5px dashed #c5cfe8', borderRadius: '6px', p: '22px', background: '#fafbfd', textAlign: 'center' }}>
                            <AccountBalanceIcon sx={{ fontSize: 32, color: NAVY }} />
                            <Typography sx={{ fontSize: 14.5, fontWeight: 500, mt: 1 }}>Tengja banka</Typography>
                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.5, mb: 1.75 }}>Bankafærslur birtast sjálfkrafa og afstemmast við innheimtur</Typography>
                            <Button variant="outlined" sx={secondaryButtonSx} onClick={() => onNavigate('/bank-settings')}>
                                Tengja Landsbanka
                            </Button>
                        </Box>
                        <Box sx={{ border: '1.5px dashed #c5cfe8', borderRadius: '6px', p: '22px', background: '#fafbfd', textAlign: 'center' }}>
                            <RuleIcon sx={{ fontSize: 32, color: NAVY }} />
                            <Typography sx={{ fontSize: 14.5, fontWeight: 500, mt: 1 }}>Engar flokkunarreglur</Typography>
                            <Typography sx={{ fontSize: 12, color: '#555', mt: 0.5, mb: 1.75 }}>Búðu til reglur til að flokka bankafærslur sjálfkrafa</Typography>
                            <Button variant="outlined" sx={secondaryButtonSx} onClick={() => onNavigate('/husfelag')}>
                                Búa til fyrstu reglu
                            </Button>
                        </Box>
                    </Box>

                </Box>
            </Box>
        </div>
    );
}
```

**Note:** The `fmtKennitala` import is already in AssociationPage.js. Also add `secondaryButtonSx` to the imports from `'../ui/buttons'` if not already there. Add the `Eyebrow` import from Task 5.

- [ ] **Step 4: Build**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/AssociationPage.js
git commit -m "feat: add Uppsetning onboarding view to AssociationPage"
```

---

## Task 7: AssociationPage — Daglegur rekstur: header + identity + action cards

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`

This task replaces the existing post-setup render (the current main `return (...)` in `AssociationPage`) with the new design. The existing `BankAccountsPanel` and `AssociationRulesPanel` sub-components are still called — their internal UI is redesigned in Task 8.

**Design reference:** `docs/design/design_handoff_husfjelag_redesign/source/husfelag-final.jsx`

The post-setup layout is: `display: 'grid', gridTemplateColumns: '1fr 320px', gap: '28px'` — main content on left, sticky Athugasemdir panel on right. The Athugasemdir panel is added in Task 8.

- [ ] **Step 1: Add missing icon imports**

Add to the imports at top of AssociationPage.js (if not already present):
```javascript
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EditIcon from '@mui/icons-material/Edit';
```

- [ ] **Step 2: Replace the main AssociationPage return**

Find the main `return (` in `AssociationPage` (the one after `if (!isSetup)` and after `const subtitle = [...]`). It currently starts with:
```javascript
    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, ...
```

Replace the entire return block with:

```javascript
    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>Húsfélag</Typography>
                        <Typography variant="h5">{association.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            Kennitala {fmtKennitala(association.ssn)}{association.address ? ` · ${association.address}` : ''}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button sx={ghostButtonSx} startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                            onClick={() => navigate('/husfelag')}
                        >
                            Breyta upplýsingum
                        </Button>
                        <Button variant="contained" sx={primaryButtonSx}
                            startIcon={<PersonAddIcon sx={{ fontSize: 17 }} />}
                            onClick={() => navigate('/eigendur')}
                        >
                            Skrá nýjan eiganda
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('husfelag')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone 3: Content grid (1fr + 320px) */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '28px', alignItems: 'start' }}>

                    {/* LEFT column */}
                    <Box>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                        {/* Identity strip: Stjórn + Eignarhald */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 2 }}>
                            {/* Stjórn card */}
                            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '6px', p: '18px 20px' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                    <Eyebrow variant="navy">STJÓRN</Eyebrow>
                                    <Button sx={{ ...ghostButtonSx, minHeight: 0, p: '4px 8px', fontSize: 12 }}
                                        startIcon={<SwapHorizIcon sx={{ fontSize: 15 }} />}
                                        onClick={() => setRoleDialog({ role: 'CHAIR', label: 'Formaður', currentName: association.chair })}
                                    >
                                        Breyta stjórn
                                    </Button>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {[
                                        { name: association.chair, role: 'Formaður · síðan jan 2024', initBg: '#e8f5e9', initColor: '#2e7d32' },
                                        { name: association.cfo,   role: 'Gjaldkeri · síðan jan 2024', initBg: '#eef1f8', initColor: NAVY },
                                    ].map(({ name, role, initBg, initColor }) => (
                                        <Box key={role} sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{ width: 42, height: 42, borderRadius: '50%', background: initBg, color: initColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                                                {name ? name.split(' ').map(w => w[0]).slice(0, 2).join('') : '—'}
                                            </Box>
                                            <Box>
                                                <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{name || '—'}</Typography>
                                                <Typography sx={{ fontSize: 11.5, color: '#555' }}>{role}</Typography>
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>

                            {/* Eignarhald card */}
                            <Box sx={{ border: `1px solid ${BORDER}`, borderRadius: '6px', p: '18px 20px' }}>
                                <Eyebrow variant="navy">EIGNARHALD</Eyebrow>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.25 }}>
                                    {[
                                        { value: association.apartment_count, label: 'Íbúðir' },
                                        { value: association.owner_count, label: 'Eigendur' },
                                    ].map(({ value, label }) => (
                                        <Box key={label}>
                                            <Typography sx={{ fontSize: 24, fontWeight: 300 }}>{value}</Typography>
                                            <Typography sx={{ fontSize: 11.5, color: '#555' }}>{label}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>

                        {/* Aðgerðir — 4 primary action cards */}
                        <Box sx={{ mt: 3 }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Aðgerðir</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
                                {[
                                    { icon: <SwapHorizIcon sx={{ fontSize: 20, color: NAVY }} />, title: 'Breyta stjórn', sub: 'Skipta um formann eða gjaldkera', onClick: () => setRoleDialog({ role: 'CHAIR', label: 'Formaður', currentName: association.chair }) },
                                    { icon: <PersonAddIcon sx={{ fontSize: 20, color: NAVY }} />, title: 'Skrá nýjan eiganda', sub: 'Tekur yfir fyrir fyrri eiganda íbúðar', onClick: () => navigate('/eigendur') },
                                    { icon: <AssessmentIcon sx={{ fontSize: 20, color: NAVY }} />, title: 'Uppfæra áætlun', sub: `Tekjur og gjöld ${new Date().getFullYear()}`, onClick: () => navigate('/aaetlun') },
                                    { icon: <EventRepeatIcon sx={{ fontSize: 20, color: NAVY }} />, title: 'Búa til innheimtu', sub: 'Mánaðargreiðslur eigenda', onClick: () => navigate('/innheimta') },
                                ].map((action, i) => (
                                    <Box key={i} onClick={action.onClick} sx={{
                                        border: `1px solid ${BORDER}`, borderRadius: '6px', p: '14px 16px',
                                        cursor: 'pointer', transition: '150ms ease',
                                        '&:hover': { borderColor: NAVY },
                                    }}>
                                        <Box sx={{ width: 36, height: 36, borderRadius: '8px', background: '#eef1f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {action.icon}
                                        </Box>
                                        <Typography sx={{ fontSize: 13.5, fontWeight: 500, mt: 1.5 }}>{action.title}</Typography>
                                        <Typography sx={{ fontSize: 11.5, color: '#555', mt: 0.25, lineHeight: 1.4 }}>{action.sub}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        {/* Bank accounts panel — redesigned in Task 8 */}
                        <BankAccountsPanel
                            user={user}
                            assocParam={assocParam}
                            currentAssociation={currentAssociation}
                            bankAccounts={bankAccounts}
                            onReload={loadAll}
                        />

                        {/* Rules panel — redesigned in Task 8 */}
                        <AssociationRulesPanel
                            user={user}
                            assocParam={assocParam}
                            rules={rules}
                            onReload={loadAll}
                        />
                    </Box>

                    {/* RIGHT column: Athugasemdir — added in Task 8 */}
                    <Box />

                </Box>
            </Box>

            {roleDialog && (
                <RoleDialog
                    open
                    role={roleDialog.role}
                    label={roleDialog.label}
                    currentName={roleDialog.currentName}
                    owners={owners}
                    userId={user.id}
                    assocParam={assocParam}
                    onClose={() => setRoleDialog(null)}
                    onSaved={(updated) => { setAssociation(updated); setRoleDialog(null); }}
                />
            )}
        </div>
    );
```

**Note:** Add `const BORDER = '#e8e8e8'; const NAVY = '#1D366F';` constants near the top of the file (just below the `const API_URL` line) if they aren't already there. Also ensure `Alert` is imported from MUI. Also add `EventRepeatIcon` import if not already done.

- [ ] **Step 3: Build**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/AssociationPage.js
git commit -m "feat: implement Daglegur rekstur header, identity strip, and action cards"
```

---

## Task 8: AssociationPage — Bankareikningar redesign + Flokkunarreglur redesign + Athugasemdir panel

**Files:**
- Modify: `HusfelagJS/src/controlers/AssociationPage.js`

This task:
1. Redesigns `BankAccountsPanel` rendering (keeps all dialog logic).
2. Redesigns `AssociationRulesPanel` rendering (keeps all dialog logic).
3. Adds `AthugasemdarPanel` component and wires it into the right column.

**Design references:**
- Bank accounts: `husfelag-final.jsx` — inline grid rows with status dot, mono account number, type chip, balance
- Rules: `husfelag-final.jsx` — table with keyword in mono, category chip, usage count
- Athugasemdir: `husfelag-final.jsx` — sticky card with 4 notification types

For Athugasemdir, the data is derived from `collections` and `bankAccounts` (already fetched). For unclassified transactions count, do an additional fetch inside the panel: `GET /Transaction/{user.id}?status=IMPORTED&year={year}{assocParam}`.

- [ ] **Step 1: Redesign BankAccountsPanel render**

In `BankAccountsPanel`, replace everything in the `return (...)` block that renders the panel UI (keep all the dialog components, BankAccountDialog, BankAccountEditDialog, etc. — only the panel outer shell changes):

```javascript
    return (
        <Box sx={{ mt: '28px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Bankareikningar</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {canManageBank && (
                        <Button variant="outlined" sx={{ ...secondaryButtonSx, py: '5px', px: 1.5, minHeight: 0, fontSize: 12.5 }}
                            onClick={() => navigate('/bank-settings')}
                        >
                            Tengja banka
                        </Button>
                    )}
                    <Button variant="contained" sx={{ ...primaryButtonSx, py: '5px', px: 1.5, minHeight: 0, fontSize: 12.5 }}
                        onClick={() => setShowForm(true)}
                    >
                        + Bæta við
                    </Button>
                </Box>
            </Box>

            <BankAccountDialog
                open={showForm}
                onClose={() => setShowForm(false)}
                userId={user.id}
                assocParam={assocParam}
                accountingKeys={accountingKeys}
                onCreated={onReload}
            />

            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

            {bankAccounts.length === 0 ? (
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>Enginn bankareikningur skráður.</Typography>
            ) : (
                <Box sx={{ border: `1px solid #e8e8e8`, borderRadius: '4px', overflow: 'hidden' }}>
                    {bankAccounts.map((a, i) => (
                        <Box key={a.id}>
                            <BankAccountRow
                                bankAccount={a}
                                userId={user.id}
                                assocParam={assocParam}
                                accountingKeys={accountingKeys}
                                onSaved={onReload}
                                showDivider={i < bankAccounts.length - 1}
                            />
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
```

Also update `BankAccountRow` render to the new visual design. Find `function BankAccountRow(...)` and replace its return:

```javascript
    return (
        <>
            <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 130px 180px 140px 40px',
                alignItems: 'center', p: '12px 18px', gap: 1.5,
                borderBottom: showDivider ? '1px solid #f2f2f2' : 'none',
            }}>
                <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{bankAccount.name}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: '#2e7d32', display: 'inline-block' }} />
                        <Typography sx={{ fontSize: 11.5, color: '#888' }}>Tengt</Typography>
                    </Box>
                </Box>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: '#555' }}>
                    {bankAccount.account_number}
                </Typography>
                <Box>
                    {bankAccount.asset_account
                        ? <LabelChip label={bankAccount.asset_account.name} />
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                </Box>
                <Typography sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14.5, fontWeight: 500, textAlign: 'right', color: '#111' }}>
                    {bankAccount.current_balance != null ? fmtAmount(bankAccount.current_balance) : '—'}
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tooltip title="Breyta">
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" sx={{ color: '#888' }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            <BankAccountEditDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                bankAccount={bankAccount}
                userId={userId}
                assocParam={assocParam}
                accountingKeys={accountingKeys}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
```

Note: add `showDivider` to `BankAccountRow` props: `function BankAccountRow({ bankAccount, userId, assocParam, accountingKeys, onSaved, showDivider })`.

- [ ] **Step 2: Redesign AssociationRulesPanel render**

In `AssociationRulesPanel`, replace its return block (keeping all dialog components — they are unchanged):

```javascript
    return (
        <Box sx={{ mt: '28px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Flokkunarreglur</Typography>
                    <Typography sx={{ fontSize: 12, color: '#555', mt: 0.25 }}>Sjálfvirk flokkun bankafærslna eftir lykilorðum</Typography>
                </Box>
                <Button variant="contained" sx={{ ...primaryButtonSx, py: '5px', px: 1.5, minHeight: 0, fontSize: 12.5 }}
                    onClick={openCreate}
                >
                    + Ný regla
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

            {rules.length === 0 ? (
                <Typography color="text.secondary" sx={{ fontSize: 13 }}>Engar reglur skráðar.</Typography>
            ) : (
                <Box sx={{ border: `1px solid #e8e8e8`, borderRadius: '4px', overflow: 'hidden' }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Skýring inniheldur</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                <TableCell align="right" sx={{ ...HEAD_CELL_SX, width: 100 }}>Notkun</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rules.map(rule => (
                                <TableRow key={rule.id} hover>
                                    <TableCell>
                                        <Typography component="span" sx={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
                                            "{rule.keyword}"
                                        </Typography>
                                    </TableCell>
                                    <TableCell><LabelChip label={rule.category.name} /></TableCell>
                                    <TableCell align="right" sx={{ fontSize: 12, color: '#555' }}>
                                        {rule.usage_count ?? '—'} færslur
                                    </TableCell>
                                    <TableCell align="right" sx={{ width: 80 }}>
                                        <Tooltip title="Breyta">
                                            <IconButton size="small" onClick={() => openEdit(rule)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Eyða">
                                            <IconButton size="small" sx={{ color: '#c62828' }} onClick={() => setDeleteRule(rule)}>
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            {/* Dialogs — unchanged */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                {/* ... keep existing dialog content unchanged ... */}
            </Dialog>
            <Dialog open={!!deleteRule} onClose={() => setDeleteRule(null)} maxWidth="xs" fullWidth>
                {/* ... keep existing dialog content unchanged ... */}
            </Dialog>
        </Box>
    );
```

**Important:** Do NOT replace the dialog contents — keep them exactly as they are. Only the outer panel box and table rendering changes.

The `rule.usage_count` field may not exist in the API response. If it doesn't, show `'—'`. The backend `CategoryRule` model may or may not include usage count — use optional chaining.

- [ ] **Step 3: Add AthugasemdarPanel component**

Add a new component at the bottom of `AssociationPage.js` (before `export default`):

```javascript
function AthugasemdarPanel({ collections, bankAccounts, userId, assocParam }) {
    const [unclassifiedCount, setUnclassifiedCount] = React.useState(0);
    const year = new Date().getFullYear();

    React.useEffect(() => {
        const qs = assocParam ? `${assocParam}&status=IMPORTED&year=${year}` : `?status=IMPORTED&year=${year}`;
        apiFetch(`${API_URL}/Transaction/${userId}${qs}`)
            .then(r => r.ok ? r.json() : [])
            .then(txns => setUnclassifiedCount(Array.isArray(txns) ? txns.length : 0))
            .catch(() => {});
    }, [userId, assocParam, year]);

    const pendingCount = collections.filter(r => r.status === 'PENDING').length;
    const hasBanks = bankAccounts.length > 0;

    const notifications = [];

    if (pendingCount > 0) {
        notifications.push({
            icon: <WarningAmberIcon sx={{ fontSize: 22, color: '#e65100', mt: '1px' }} />,
            text: `${pendingCount} íbúð${pendingCount === 1 ? '' : 'ir'} í vanskilum`,
            cta: { label: 'Senda áminningar →', href: '/innheimta' },
        });
    }

    if (unclassifiedCount > 0) {
        notifications.push({
            icon: <LinkOffIcon sx={{ fontSize: 22, color: '#777', mt: '1px' }} />,
            text: `${unclassifiedCount} óflokkuð bankafærsla${unclassifiedCount === 1 ? '' : 'r'}`,
            cta: { label: 'Flokka færslu →', href: '/faerslur' },
        });
    }

    if (hasBanks) {
        notifications.push({
            icon: <CheckCircleOutlineIcon sx={{ fontSize: 22, color: '#2e7d32', mt: '1px' }} />,
            text: 'Bankareikningar tengdir',
            cta: { label: 'Skoða →', href: '/bank-settings' },
        });
    }

    return (
        <Box sx={{ border: '1px solid #e8e8e8', borderRadius: '8px', p: '18px 20px', position: 'sticky', top: 0 }}>
            <Eyebrow variant="navy" sx={{ mb: 1.75 }}>ATHUGASEMDIR</Eyebrow>
            {notifications.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: '#888' }}>Ekkert að gera.</Typography>
            ) : (
                notifications.map((n, i) => (
                    <Box key={i} sx={{
                        display: 'flex', gap: 1.5, py: 1.5,
                        borderBottom: i < notifications.length - 1 ? '1px solid #f2f2f2' : 'none',
                    }}>
                        {n.icon}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13.5, lineHeight: 1.4 }}>{n.text}</Typography>
                            <AthugasemdarLink href={n.cta.href} label={n.cta.label} />
                        </Box>
                    </Box>
                ))
            )}
        </Box>
    );
}

function AthugasemdarLink({ href, label }) {
    const navigate = useNavigate();
    return (
        <Typography
            sx={{ fontSize: 12.5, color: '#1D366F', mt: 0.5, cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
            onClick={() => navigate(href)}
        >
            {label}
        </Typography>
    );
}
```

Also add the missing icon imports:
```javascript
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LinkOffIcon from '@mui/icons-material/LinkOff';
```

- [ ] **Step 4: Wire AthugasemdarPanel into the post-setup layout**

In the main `AssociationPage` return, find the right column placeholder:
```javascript
                    {/* RIGHT column: Athugasemdir — added in Task 8 */}
                    <Box />
```

Replace with:
```javascript
                    {/* RIGHT column: sticky Athugasemdir */}
                    <AthugasemdarPanel
                        collections={collections}
                        bankAccounts={bankAccounts}
                        userId={user.id}
                        assocParam={assocParam}
                    />
```

- [ ] **Step 5: Build**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Failed)" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jonandri/Developer/Digit/husfjelag/.worktrees/feature-dashboards-designs/HusfelagJS
git add src/controlers/AssociationPage.js
git commit -m "feat: redesign bank/rules panels and add Athugasemdir sticky rail"
```

---

## Self-Review

### Spec Coverage

| Design requirement | Task |
|---|---|
| Yfirlit hero KPI band (4 cells, gradient, sparkline) | Task 3 |
| Yfirlit Næstu skref upcoming list | Task 4 |
| Áætlun variance bars (color by %) | Task 4 |
| Sundurliðun variance table with utilization meters | Task 4 |
| Sækja ársskýrslu button → dialog | Task 2 + 3 |
| `/yfirlit` route wired up | Task 4 |
| Húsfélag Uppsetning setup hero with step grid + progress | Task 6 |
| Húsfélag Uppsetning ghosted placeholders (bank, rules) | Task 6 |
| Húsfélag Daglegur rekstur header | Task 7 |
| Húsfélag Stjórn card with initials + Breyta stjórn | Task 7 |
| Húsfélag Eignarhald stats | Task 7 |
| 4 primary Aðgerðir cards | Task 7 |
| Bankareikningar inline row design | Task 8 |
| Flokkunarreglur table redesign | Task 8 |
| Athugasemdir sticky right panel | Task 8 |
| setupComplete drives onboarding/post-setup split | Task 5 |

### Placeholder scan

No TBD or TODO items remain (the one temporary placeholder in Task 3 is replaced in Task 4 as designed).

### Type consistency

- `bankAccounts` prop: `array` — passed from parent state, received as prop in `BankAccountsPanel` ✓
- `rules` prop: `array` — passed from parent state, received as prop in `AssociationRulesPanel` ✓
- `collections` prop: `array` — passed from parent state, received as prop in `AthugasemdarPanel` ✓
- `onReload` callback: replaces `loadBankAccounts` / `load` in sub-panels ✓
- `setupSteps[i]` is boolean array indexed 0–5, `setupComplete` is integer 0–6 ✓
