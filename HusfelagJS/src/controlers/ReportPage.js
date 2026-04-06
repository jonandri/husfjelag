import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper, Select, MenuItem,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button,
    IconButton, Tooltip as MuiTooltip, Grid,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import { useHelp } from '../ui/HelpContext';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';
import { ghostButtonSx } from '../ui/buttons';
import { HEAD_SX, HEAD_CELL_SX, AmountCell } from './tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maí', 'Jún', 'Júl', 'Ágú', 'Sep', 'Okt', 'Nóv', 'Des'];
const MONTH_NAMES_FULL = ['Janúar', 'Febrúar', 'Mars', 'Apríl', 'Maí', 'Júní', 'Júlí', 'Ágúst', 'September', 'Október', 'Nóvember', 'Desember'];

const VARIANCE_COLOR = (budgeted, actual) => {
    const diff = parseFloat(budgeted) - parseFloat(actual);
    if (diff > 0) return '#2e7d32';   // under budget — green
    if (diff < 0) return '#c62828';   // over budget — red
    return '#888';                     // exact
};

function SectionHeading({ label, color }) {
    return (
        <Typography sx={{
            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
            color, mb: 1, mt: 3,
        }}>
            {label}
        </Typography>
    );
}

function TotalsRow({ cells }) {
    return (
        <TableFooter>
            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                {cells}
            </TableRow>
        </TableFooter>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtSsn(s) {
    const d = String(s || '').replace(/\D/g, '');
    return d.length === 10 ? `${d.slice(0, 6)}-${d.slice(6)}` : d || '—';
}

function stmtFmt(n) {
    // Format as Icelandic integer, parentheses for negatives
    const num = parseFloat(n) || 0;
    const abs = Math.round(Math.abs(num)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return num < 0 ? `(${abs})` : abs;
}

// ─── Annual Statement Dialog ─────────────────────────────────────────────────

function AnnualStatementDialog({ open, onClose, year, userId, assocParam }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setData(null);
        setError('');
        const qs = assocParam ? `${assocParam}&year=${year}` : `?year=${year}`;
        apiFetch(`${API_URL}/AnnualStatement/${userId}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { setError('Villa við að sækja ársskýrslu.'); setLoading(false); });
    }, [open, year, userId, assocParam]);

    const handlePrint = () => {
        if (!data) return;
        const hasPrev = !!data.previous_year;
        const prev = data.previous_year;
        const a = data.association;

        const fmt = (n) => {
            const num = parseFloat(n) || 0;
            const abs = Math.round(Math.abs(num)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return num < 0 ? `(${abs})` : abs;
        };
        const fmtSsnLocal = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 6)}-${d.slice(6)}` : d; };

        const yearCol = hasPrev ? `<th class="num">${year}</th><th class="num prev">${year - 1}</th>` : `<th class="num">${year}</th>`;

        const incomeRows = (rows, uncat, isP) => {
            let html = (rows || []).map(r => `<tr>
                <td><span class="acct">${r.account_number}</span>${r.account_name}</td>
                <td class="num">${fmt(r.amount)}</td>
                ${hasPrev ? `<td class="num prev">${isP ? '—' : fmt(r.amount)}</td>` : ''}
            </tr>`).join('');
            if (parseFloat(uncat) > 0) html += `<tr class="sub"><td><em>Óflokkað</em></td><td class="num">${fmt(uncat)}</td>${hasPrev ? `<td class="num prev">0</td>` : ''}</tr>`;
            return html;
        };

        const expRows = (rows, uncat, prevRows, prevUncat) => {
            const prevMap = {};
            if (prevRows) prevRows.forEach(r => { prevMap[r.account_number] = r.amount; });
            let html = (rows || []).map(r => `<tr>
                <td><span class="acct">${r.account_number}</span>${r.account_name}</td>
                <td class="num">${fmt(r.amount)}</td>
                ${hasPrev ? `<td class="num prev">${fmt(prevMap[r.account_number] || 0)}</td>` : ''}
            </tr>`).join('');
            if (parseFloat(uncat) > 0) html += `<tr class="sub"><td><em>Óflokkað</em></td><td class="num">${fmt(uncat)}</td>${hasPrev ? `<td class="num prev">${fmt(prevUncat || 0)}</td>` : ''}</tr>`;
            return html;
        };

        const assetRows = data.assets.map((ba, i) => {
            const prevAmt = prev?.assets?.[i]?.amount;
            return `<tr>
                <td>${ba.account_number ? `<span class="acct">${ba.account_number}</span>` : ''}${ba.label}${ba.account_name && ba.account_name !== ba.label ? ` · ${ba.account_name}` : ''}</td>
                <td class="num">${fmt(ba.amount)}</td>
                ${hasPrev ? `<td class="num prev">${prevAmt != null ? fmt(prevAmt) : '—'}</td>` : ''}
            </tr>`;
        }).join('');

        const netColor = parseFloat(data.net) >= 0 ? '#2e7d32' : '#c62828';

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Ársskýrsla ${year}</title>
        <style>
            *{box-sizing:border-box;margin:0;padding:0}
            body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;padding:32px 48px;max-width:860px;margin:0 auto}
            .title{text-align:center;font-size:22px;font-weight:700;margin-bottom:28px}
            .meta p{font-size:10.5px;color:#555;line-height:1.6}
            .meta{margin-bottom:28px}
            h2{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#111;margin:28px 0 8px;padding-bottom:5px;border-bottom:2px solid #111}
            h3{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#888;margin:16px 0 4px}
            table{width:100%;border-collapse:collapse;margin-bottom:2px}
            td,th{padding:3.5px 6px;font-size:10.5px;text-align:left}
            th{font-weight:700;color:#555;font-size:9px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #ccc;padding-bottom:4px}
            th.num,td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;width:100px}
            td.prev,th.prev{color:#aaa}
            tr.total td{font-weight:700;border-top:1.5px solid #111;padding-top:5px}
            tr.net td{font-weight:700;font-size:12px;border-top:2px solid #111;border-bottom:2px solid #111;padding:5px 6px}
            tr.sub td{color:#777;font-style:italic}
            tr:nth-child(even) td{background:#fafafa}
            .acct{color:#999;font-size:9px;margin-right:5px}
            @page{margin:16mm;size:A4}
            @media print{body{padding:0}}
        </style></head><body>
        <div class="title">Ársskýrsla ${year}</div>
        <div class="meta">
            <p><strong>${a.name}</strong></p>
            <p>Kennitala: ${fmtSsnLocal(a.ssn)}</p>
            <p>${a.address}${a.postal_code ? `, ${a.postal_code}` : ''}${a.city ? ` ${a.city}` : ''}</p>
        </div>

        <h2>Rekstrarreikningur</h2>

        <h3>Tekjur</h3>
        <table>
            <thead><tr><th>Flokkur</th>${yearCol}</tr></thead>
            <tbody>
                ${incomeRows(data.income, data.income_uncategorised, false)}
                <tr class="total">
                    <td>Samtals tekjur</td>
                    <td class="num">${fmt(data.total_income)}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(prev.total_income)}</td>` : ''}
                </tr>
            </tbody>
        </table>

        <h3>Gjöld</h3>
        <table>
            <thead><tr><th>Flokkur</th>${yearCol}</tr></thead>
            <tbody>
                ${expRows(data.expenses, data.expenses_uncategorised, prev?.expenses, prev?.expenses_uncategorised)}
                <tr class="total">
                    <td>Samtals gjöld</td>
                    <td class="num">(${fmt(data.total_expenses)})</td>
                    ${hasPrev ? `<td class="num prev">(${fmt(prev.total_expenses)})</td>` : ''}
                </tr>
            </tbody>
        </table>

        <table style="margin-top:6px">
            <tbody>
                <tr class="net">
                    <td>Hagnaður / Tap</td>
                    <td class="num" style="color:${netColor}">${fmt(data.net)}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(prev.net)}</td>` : ''}
                </tr>
            </tbody>
        </table>

        <h2 style="margin-top:36px">Efnahagsreikningur</h2>

        <h3>Eignir</h3>
        <table>
            <thead><tr><th>Bankareikningur</th>${yearCol}</tr></thead>
            <tbody>
                ${assetRows}
                <tr class="total">
                    <td>Samtals eignir</td>
                    <td class="num">${fmt(data.total_assets)}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(prev.total_assets)}</td>` : ''}
                </tr>
            </tbody>
        </table>

        <h3 style="margin-top:16px">Skuldir og eigið fé</h3>
        <table>
            <tbody>
                <tr class="total">
                    <td>Eigið fé (eignir − hagnaður/tap)</td>
                    <td class="num">${fmt(parseFloat(data.total_assets) - parseFloat(data.net))}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(parseFloat(prev.total_assets) - parseFloat(prev.net))}</td>` : ''}
                </tr>
                <tr>
                    <td>Hagnaður / Tap ársins</td>
                    <td class="num" style="color:${netColor}">${fmt(data.net)}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(prev.net)}</td>` : ''}
                </tr>
                <tr class="net">
                    <td>Samtals skuldir og eigið fé</td>
                    <td class="num">${fmt(data.total_assets)}</td>
                    ${hasPrev ? `<td class="num prev">${fmt(prev.total_assets)}</td>` : ''}
                </tr>
            </tbody>
        </table>
        </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 300);
    };

    const prev = data?.previous_year;

    const ColHeader = () => (
        <tr>
            <th style={{ textAlign: 'left' }}>Flokkur</th>
            <th style={{ textAlign: 'right' }}>{year}</th>
            {prev && <th style={{ textAlign: 'right' }}>{year - 1}</th>}
        </tr>
    );

    const numSx = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
    const renderRows = (rows, uncatAmt, prevRows, prevUncat) => {
        const prevMap = {};
        if (prev && prevRows) prevRows.forEach(r => { prevMap[r.account_number] = r.amount; });
        return (
            <>
                {rows.map(r => (
                    <TableRow key={r.account_number}>
                        <TableCell><span style={{ color: '#999', fontSize: 9.5, marginRight: 4 }}>{r.account_number}</span>{r.account_name}</TableCell>
                        <TableCell align="right" sx={numSx}>{stmtFmt(r.amount)}</TableCell>
                        {prev && <TableCell align="right" sx={{ ...numSx, color: '#aaa' }}>{stmtFmt(prevMap[r.account_number] || 0)}</TableCell>}
                    </TableRow>
                ))}
                {parseFloat(uncatAmt) > 0 && (
                    <TableRow>
                        <TableCell sx={{ color: '#888', fontStyle: 'italic' }}>Óflokkað</TableCell>
                        <TableCell align="right" sx={{ ...numSx, color: '#888' }}>{stmtFmt(uncatAmt)}</TableCell>
                        {prev && <TableCell align="right" sx={{ ...numSx, color: '#aaa' }}>{stmtFmt(prevUncat || 0)}</TableCell>}
                    </TableRow>
                )}
            </>
        );
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Ársskýrsla {year}
                <MuiTooltip title="Loka">
                    <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
                </MuiTooltip>
            </DialogTitle>

            <DialogContent sx={{ pt: '8px !important' }}>
                {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress color="secondary" /></Box>}
                {error && <Alert severity="error">{error}</Alert>}

                {data && (
                    <Box id="annual-statement-content">
                        {/* Header */}
                        <Box sx={{ mb: 3 }}>
                            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{data.association.name}</Typography>
                            <Typography sx={{ fontSize: 11, color: '#666' }}>Kennitala: {fmtSsn(data.association.ssn)}</Typography>
                            <Typography sx={{ fontSize: 11, color: '#666' }}>{data.association.address}{data.association.postal_code ? `, ${data.association.postal_code}` : ''}{data.association.city ? ` ${data.association.city}` : ''}</Typography>
                        </Box>

                        {/* Income Statement */}
                        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#555', borderBottom: '2px solid #111', pb: 0.5, mb: 1 }}>
                            Rekstrarreikningur
                        </Typography>

                        <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#888', mt: 1.5, mb: 0.5 }}>Tekjur</Typography>
                        <Table size="small">
                            <TableHead sx={{ '& th': { py: 0.5, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', borderBottom: '1px solid #ccc' } }}>
                                <TableRow>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell align="right">{year}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#aaa !important' }}>{year - 1}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {renderRows(data.income, data.income_uncategorised, prev?.income, prev?.income_uncategorised)}
                                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '1.5px solid #111', pt: 0.75 } }}>
                                    <TableCell>Samtals tekjur</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(data.total_income)}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(prev.total_income)}</TableCell>}
                                </TableRow>
                            </TableBody>
                        </Table>

                        <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#888', mt: 2.5, mb: 0.5 }}>Gjöld</Typography>
                        <Table size="small">
                            <TableHead sx={{ '& th': { py: 0.5, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', borderBottom: '1px solid #ccc' } }}>
                                <TableRow>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell align="right">{year}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#aaa !important' }}>{year - 1}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {renderRows(data.expenses, data.expenses_uncategorised, prev?.expenses, prev?.expenses_uncategorised)}
                                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '1.5px solid #111', pt: 0.75 } }}>
                                    <TableCell>Samtals gjöld</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>({stmtFmt(data.total_expenses)})</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>({stmtFmt(prev.total_expenses)})</TableCell>}
                                </TableRow>
                            </TableBody>
                        </Table>

                        {/* Net result */}
                        <Table size="small">
                            <TableBody>
                                <TableRow sx={{ '& td': { fontWeight: 700, fontSize: 13, borderTop: '2px solid #111', borderBottom: '2px solid #111', py: 0.75 } }}>
                                    <TableCell>Hagnaður / Tap</TableCell>
                                    <TableCell align="right" sx={{ ...numSx, color: parseFloat(data.net) >= 0 ? '#2e7d32' : '#c62828' }}>{stmtFmt(data.net)} kr.</TableCell>
                                    {prev && <TableCell align="right" sx={{ ...numSx, color: '#aaa' }}>{stmtFmt(prev.net)} kr.</TableCell>}
                                </TableRow>
                            </TableBody>
                        </Table>

                        {/* Balance Sheet */}
                        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#555', borderBottom: '2px solid #111', pb: 0.5, mb: 1, mt: 4 }}>
                            Efnahagsreikningur
                        </Typography>

                        <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#888', mt: 1.5, mb: 0.5 }}>Eignir</Typography>
                        <Table size="small">
                            <TableHead sx={{ '& th': { py: 0.5, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', borderBottom: '1px solid #ccc' } }}>
                                <TableRow>
                                    <TableCell>Bankareikningur</TableCell>
                                    <TableCell align="right">{year}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#aaa !important' }}>{year - 1}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.assets.map((a, i) => {
                                    const prevAmt = prev?.assets?.[i]?.amount;
                                    return (
                                        <TableRow key={i}>
                                            <TableCell>
                                                {a.account_number && <span style={{ color: '#999', fontSize: 9.5, marginRight: 4 }}>{a.account_number}</span>}
                                                {a.label}{a.account_name && a.account_name !== a.label ? ` · ${a.account_name}` : ''}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(a.amount)}</TableCell>
                                            {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{prevAmt != null ? stmtFmt(prevAmt) : '—'}</TableCell>}
                                        </TableRow>
                                    );
                                })}
                                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '1.5px solid #111', pt: 0.75 } }}>
                                    <TableCell>Samtals eignir</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(data.total_assets)}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(prev.total_assets)}</TableCell>}
                                </TableRow>
                            </TableBody>
                        </Table>

                        <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#888', mt: 2.5, mb: 0.5 }}>Skuldir og eigið fé</Typography>
                        <Table size="small">
                            <TableBody>
                                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '1.5px solid #111', pt: 0.75 } }}>
                                    <TableCell>Eigið fé (eignir − hagnaður/tap)</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(parseFloat(data.total_assets) - parseFloat(data.net))}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(parseFloat(prev.total_assets) - parseFloat(prev.net))}</TableCell>}
                                </TableRow>
                                <TableRow sx={{ '& td': { fontWeight: 700 } }}>
                                    <TableCell>Hagnaður / Tap ársins</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: parseFloat(data.net) >= 0 ? '#2e7d32' : '#c62828' }}>{stmtFmt(data.net)}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(prev.net)}</TableCell>}
                                </TableRow>
                                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '2px solid #111', borderBottom: '2px solid #111', py: 0.75 } }}>
                                    <TableCell>Samtals skuldir og eigið fé</TableCell>
                                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(data.total_assets)}</TableCell>
                                    {prev && <TableCell align="right" sx={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{stmtFmt(prev.total_assets)}</TableCell>}
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
                <Button sx={{ textTransform: 'none', color: '#555', fontWeight: 400 }} onClick={onClose}>Loka</Button>
                {data && (
                    <Button
                        variant="contained"
                        startIcon={<PrintIcon />}
                        onClick={handlePrint}
                        sx={{ backgroundColor: '#1D366F', color: '#fff', textTransform: 'none', fontWeight: 500, '&:hover': { backgroundColor: '#162d5e' } }}
                    >
                        Prenta sem PDF
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

// ─── Report Page ─────────────────────────────────────────────────────────────

function ReportPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState(undefined);
    const [budgetTotal, setBudgetTotal] = useState(null);
    const [budgetName, setBudgetName] = useState(null);
    const [monthlyTotal, setMonthlyTotal] = useState(null);
    const [unpaidTotal, setUnpaidTotal] = useState(null);
    const [bankBalance, setBankBalance] = useState(null);
    const [error, setError] = useState('');
    const [annualStmtOpen, setAnnualStmtOpen] = useState(false);
    const [drillMonth, setDrillMonth] = useState(null);
    const [drillData, setDrillData] = useState(null);
    const [drillLoading, setDrillLoading] = useState(false);
    const [drillError, setDrillError] = useState('');
    const [catDrill, setCatDrill] = useState(null); // { category_id, category_name }
    const [catTxs, setCatTxs] = useState([]);
    const [catLoading, setCatLoading] = useState(false);
    const [catError, setCatError] = useState('');

    useEffect(() => {
        if (!user) return;
        Promise.all([
            apiFetch(`${API_URL}/Budget/${user.id}${assocParam}`),
            apiFetch(`${API_URL}/Collection/${user.id}${assocParam}`),
            apiFetch(`${API_URL}/BankAccount/${user.id}${assocParam}`),
        ]).then(async ([budgetResp, collResp, bankResp]) => {
            if (budgetResp.ok) {
                const budget = await budgetResp.json();
                if (budget?.items) {
                    setBudgetTotal(budget.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0));
                    if (budget.name) setBudgetName(budget.name);
                }
            }
            if (collResp.ok) {
                const col = await collResp.json();
                if (col?.rows) setMonthlyTotal(col.rows.reduce((s, r) => s + parseFloat(r.monthly || 0), 0));
                if (col?.pending_total !== undefined) setUnpaidTotal(parseFloat(col.pending_total));
            }
            if (bankResp.ok) {
                const accounts = await bankResp.json();
                const total = accounts
                    .filter(a => a.asset_account?.number === 1200 || a.asset_account?.number === '1200')
                    .reduce((s, a) => s + (a.current_balance != null ? parseFloat(a.current_balance) : 0), 0);
                setBankBalance(accounts.some(a => a.asset_account?.number === 1200 || a.asset_account?.number === '1200') ? total : null);
            }
        }).catch(() => {});
    }, [user, assocParam]);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        setData(undefined);
        setError('');
        const qs = assocParam ? `${assocParam}&year=${year}` : `?year=${year}`;
        apiFetch(`${API_URL}/Report/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setData)
            .catch(() => {
                setError('Villa við að sækja skýrslugögn.');
                setData(null);
            });
    }, [user, assocParam, year]);

    const openDrill = (month) => {
        if (!user) return;
        setDrillMonth(month);
        setDrillData(null);
        setDrillLoading(true);
        setDrillError('');
        const qs = assocParam
            ? `${assocParam}&year=${year}&month=${month}`
            : `?year=${year}&month=${month}`;
        apiFetch(`${API_URL}/Report/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setDrillData(d); setDrillLoading(false); })
            .catch(() => { setDrillLoading(false); setDrillError('Villa við að sækja mánaðargögn.'); });
    };

    const closeDrill = () => { setDrillMonth(null); setDrillData(null); setDrillError(''); };

    const openCatDrill = (categoryId, categoryName) => {
        setCatDrill({ category_id: categoryId, category_name: categoryName });
        setCatTxs([]);
        setCatLoading(true);
        setCatError('');
        const params = new URLSearchParams({ year });
        const qs = assocParam ? `${assocParam}&${params}` : `?${params}`;
        apiFetch(`${API_URL}/Transaction/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(txs => {
                setCatTxs(txs.filter(tx => tx.category?.id === categoryId));
                setCatLoading(false);
            })
            .catch(() => { setCatLoading(false); setCatError('Villa við að sækja færslur.'); });
    };
    const closeCatDrill = () => { setCatDrill(null); setCatTxs([]); setCatError(''); };

    if (data === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const income = data?.income ?? [];
    const incomeUncat = parseFloat(data?.income_uncategorised ?? 0);
    const expenses = data?.expenses ?? [];
    const expenseUncat = parseFloat(data?.expenses_uncategorised ?? 0);
    const monthly = data?.monthly ?? [];

    const totalIncome = income.reduce((s, r) => s + parseFloat(r.actual), 0) + incomeUncat;
    const totalExpenseBudgeted = expenses.reduce((s, r) => s + parseFloat(r.budgeted), 0);
    const totalExpenseActual = expenses.reduce((s, r) => s + parseFloat(r.actual), 0) + expenseUncat;
    const net = totalIncome - totalExpenseActual;

    const chartData = monthly.map((m) => ({
        month: MONTH_LABELS[m.month - 1],
        income: parseFloat(m.income),
        expenses: parseFloat(m.expenses),
        isFuture: parseFloat(m.income) === 0 && parseFloat(m.expenses) === 0,
    }));

    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 4; y--) yearOptions.push(y);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="h5">Yfirlit</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {year < currentYear && (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                                onClick={() => setAnnualStmtOpen(true)}
                                sx={{ textTransform: 'none', fontSize: 13, borderColor: '#1D366F', color: '#1D366F', fontWeight: 500, '&:hover': { background: '#eef1f8', borderColor: '#1D366F' } }}
                            >
                                Ársskýrsla
                            </Button>
                        )}
                        <MuiTooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('yfirlit')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </MuiTooltip>
                    </Box>
                </Box>
                {/* Zone 2: Toolbar — year selector */}
                <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Select size="small" value={year} onChange={e => setYear(e.target.value)} sx={{ minWidth: 90, fontSize: 13 }}>
                        {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </Select>
                </Box>
                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* Financial KPIs */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                        { label: 'Innstæður í bönkum', value: bankBalance !== null ? fmtAmount(bankBalance) : '—', alert: false },
                        { label: 'Ógreidd innheimta', value: unpaidTotal !== null ? fmtAmount(unpaidTotal) : '—', alert: unpaidTotal > 0 },
                        { label: budgetName || `Áætlun ${year}`, value: budgetTotal !== null ? fmtAmount(budgetTotal) : '—', alert: false },
                        { label: 'Mánaðarleg innheimta', value: monthlyTotal !== null ? fmtAmount(monthlyTotal) : '—', alert: false },
                    ].map(({ label, value, alert }) => (
                        <Grid item xs={12} sm={3} key={label} sx={{ display: 'flex' }}>
                            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 100 }}>
                                <Typography variant="h6" sx={{ fontWeight: 400, lineHeight: 1.2, color: alert ? '#c62828' : 'secondary.main' }}>
                                    {value}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {label}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                {/* Monthly bar chart */}
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px', color: '#888', mb: 1.5 }}>
                        MÁNAÐARLEG HREYFING
                    </Typography>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart
                            data={chartData}
                            barGap={2}
                            barCategoryGap="30%"
                            onClick={(payload) => {
                                if (payload && payload.activeLabel) {
                                    const idx = MONTH_LABELS.indexOf(payload.activeLabel);
                                    if (idx !== -1) openDrill(idx + 1);
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip
                                formatter={(value, name) => [fmtAmount(value), name === 'income' ? 'Tekjur' : 'Gjöld']}
                                labelFormatter={label => label}
                            />
                            <Bar dataKey="income" name="Tekjur" radius={[2, 2, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={index} fill={entry.isFuture ? '#e0e0e0' : '#08C076'} />
                                ))}
                            </Bar>
                            <Bar dataKey="expenses" name="Gjöld" radius={[2, 2, 0, 0]}>
                                {chartData.map((entry, index) => (
                                    <Cell key={index} fill={entry.isFuture ? '#e0e0e0' : '#e57373'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                        Smelltu á mánuð til að sjá sundurliðun
                    </Typography>
                </Paper>

                {/* Income section */}
                <SectionHeading label="TEKJUR" color="#08C076" />
                <Paper variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Raun</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {income.map(row => (
                                <TableRow key={row.category_id} hover sx={{ cursor: 'pointer' }}
                                    onClick={() => openCatDrill(row.category_id, row.category_name)}>
                                    <TableCell>{row.category_name}</TableCell>
                                    <AmountCell value={row.actual} />
                                </TableRow>
                            ))}
                            {incomeUncat > 0 && (
                                <TableRow hover>
                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                    <AmountCell value={incomeUncat} />
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals tekjur</TableCell>,
                            <AmountCell key="val" value={totalIncome} />,
                        ]} />
                    </Table>
                </Paper>

                {/* Expense section */}
                <SectionHeading label="GJÖLD" color="#c62828" />
                <Paper variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right', display: { xs: 'none', sm: 'table-cell' } }}>Áætlun</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Raun</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right', display: { xs: 'none', sm: 'table-cell' } }}>Frávik</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right', display: { xs: 'none', sm: 'table-cell' } }}>%</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {expenses.map(row => {
                                const budgeted = parseFloat(row.budgeted);
                                const actual = parseFloat(row.actual);
                                const variance = budgeted - actual;
                                const pct = budgeted > 0 ? (actual / budgeted) * 100 : null;
                                const color = VARIANCE_COLOR(budgeted, actual);
                                return (
                                    <TableRow key={row.category_id} hover sx={{ cursor: 'pointer' }}
                                        onClick={() => openCatDrill(row.category_id, row.category_name)}>
                                        <TableCell>{row.category_name}</TableCell>
                                        <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#888', display: { xs: 'none', sm: 'table-cell' } }}>
                                            {budgeted > 0 ? fmtAmount(-budgeted) : <span style={{ color: '#ccc' }}>—</span>}
                                        </TableCell>
                                        <AmountCell value={actual > 0 ? -actual : actual} />
                                        {budgeted > 0
                                            ? <AmountCell value={variance} sx={{ display: { xs: 'none', sm: 'table-cell' } }} />
                                            : <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><span style={{ color: '#ccc' }}>—</span></TableCell>
                                        }
                                        <TableCell align="right" sx={{ color, display: { xs: 'none', sm: 'table-cell' } }}>
                                            {pct !== null ? `${Math.round(pct)}%` : <span style={{ color: '#ccc' }}>—</span>}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {expenseUncat > 0 && (
                                <TableRow hover>
                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><span style={{ color: '#ccc' }}>—</span></TableCell>
                                    <AmountCell value={-expenseUncat} />
                                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><span style={{ color: '#ccc' }}>—</span></TableCell>
                                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><span style={{ color: '#ccc' }}>—</span></TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TotalsRow cells={[
                            <TableCell key="lbl">Samtals gjöld</TableCell>,
                            <TableCell key="bud" align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#888', display: { xs: 'none', sm: 'table-cell' } }}>
                                {fmtAmount(-totalExpenseBudgeted)}
                            </TableCell>,
                            <AmountCell key="act" value={-totalExpenseActual} />,
                            <AmountCell key="var" value={totalExpenseBudgeted - totalExpenseActual} sx={{ display: { xs: 'none', sm: 'table-cell' } }} />,
                            <TableCell key="pct" align="right"
                                sx={{ color: VARIANCE_COLOR(totalExpenseBudgeted, totalExpenseActual), display: { xs: 'none', sm: 'table-cell' } }}
                            >
                                {totalExpenseBudgeted > 0
                                    ? `${Math.round((totalExpenseActual / totalExpenseBudgeted) * 100)}%`
                                    : '—'
                                }
                            </TableCell>,
                        ]} />
                    </Table>
                </Paper>

                {/* Net result */}
                <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                    <Table size="small">
                        <TableBody>
                            <TableRow sx={{ backgroundColor: '#1D366F' }}>
                                <TableCell sx={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                                    Niðurstaða (Tekjur − Gjöld)
                                </TableCell>
                                <TableCell align="right" sx={{ fontFamily: 'monospace', color: net >= 0 ? '#a5d6a7' : '#ef9a9a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {fmtAmount(net)}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Paper>

                {/* Category transactions dialog */}
                <Dialog open={catDrill !== null} onClose={closeCatDrill} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ color: '#1D366F', fontWeight: 600 }}>
                        {catDrill?.category_name}
                    </DialogTitle>
                    <DialogContent>
                        {catLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress color="secondary" />
                            </Box>
                        )}
                        {catError && <Alert severity="error">{catError}</Alert>}
                        {!catLoading && !catError && catTxs.length === 0 && (
                            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                                Engar færslur fundust.
                            </Typography>
                        )}
                        {!catLoading && catTxs.length > 0 && (() => {
                            const total = catTxs.reduce((s, tx) => s + parseFloat(tx.amount), 0);
                            return (
                                <Table size="small">
                                    <TableHead sx={HEAD_SX}>
                                        <TableRow>
                                            <TableCell sx={HEAD_CELL_SX}>Dagsetning</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Lýsing</TableCell>
                                            <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Upphæð</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {catTxs.map(tx => {
                                            const amt = parseFloat(tx.amount);
                                            const dateStr = new Date(tx.date).toLocaleDateString('is-IS', { day: 'numeric', month: 'long' });
                                            return (
                                                <TableRow key={tx.id}>
                                                    <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{dateStr}</TableCell>
                                                    <TableCell>{tx.description}</TableCell>
                                                    <AmountCell value={amt} />
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                    <TotalsRow cells={[
                                        <TableCell key="lbl" colSpan={2}>Samtals</TableCell>,
                                        <TableCell key="val" align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                            {fmtAmount(total)}
                                        </TableCell>,
                                    ]} />
                                </Table>
                            );
                        })()}
                    </DialogContent>
                    <DialogActions sx={{ px: 2 }}>
                        <Button sx={ghostButtonSx} onClick={closeCatDrill}>Loka</Button>
                    </DialogActions>
                </Dialog>

                {/* Annual Statement dialog */}
                <AnnualStatementDialog
                    open={annualStmtOpen}
                    onClose={() => setAnnualStmtOpen(false)}
                    year={year}
                    userId={user.id}
                    assocParam={assocParam}
                />

                {/* Month drill-down dialog */}
                <Dialog open={drillMonth !== null} onClose={closeDrill} maxWidth="sm" fullWidth>
                    <DialogTitle sx={{ color: '#1D366F', fontWeight: 600 }}>
                        {drillMonth !== null ? `${MONTH_NAMES_FULL[drillMonth - 1]} ${year}` : ''}
                    </DialogTitle>
                    <DialogContent>
                        {drillLoading && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                <CircularProgress color="secondary" />
                            </Box>
                        )}
                        {drillError && !drillLoading && (
                            <Alert severity="error" sx={{ mt: 1 }}>{drillError}</Alert>
                        )}
                        {drillData && !drillLoading && (() => {
                            const dIncome = drillData.income ?? [];
                            const dIncUncat = parseFloat(drillData.income_uncategorised ?? 0);
                            const dExpenses = drillData.expenses ?? [];
                            const dExpUncat = parseFloat(drillData.expenses_uncategorised ?? 0);
                            const dTotalInc = dIncome.reduce((s, r) => s + parseFloat(r.actual), 0) + dIncUncat;
                            const dTotalExp = dExpenses.reduce((s, r) => s + parseFloat(r.actual), 0) + dExpUncat;
                            const dNet = dTotalInc - dTotalExp;
                            return (
                                <>
                                    <SectionHeading label="TEKJUR" color="#08C076" />
                                    <Table size="small" sx={{ mb: 2 }}>
                                        <TableBody>
                                            {dIncome.map(r => (
                                                <TableRow key={r.category_id}>
                                                    <TableCell>{r.category_name}</TableCell>
                                                    <AmountCell value={r.actual} />
                                                </TableRow>
                                            ))}
                                            {dIncUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <AmountCell value={dIncUncat} />
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <AmountCell value={dTotalInc} />
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <SectionHeading label="GJÖLD" color="#c62828" />
                                    <Table size="small" sx={{ mb: 2 }}>
                                        <TableBody>
                                            {dExpenses.map(r => (
                                                <TableRow key={r.category_id}>
                                                    <TableCell>{r.category_name}</TableCell>
                                                    <AmountCell value={r.actual} />
                                                </TableRow>
                                            ))}
                                            {dExpUncat > 0 && (
                                                <TableRow>
                                                    <TableCell sx={{ color: '#aaa', fontStyle: 'italic' }}>Óflokkað</TableCell>
                                                    <AmountCell value={dExpUncat} />
                                                </TableRow>
                                            )}
                                            <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '1px solid rgba(0,0,0,0.12)' } }}>
                                                <TableCell>Samtals</TableCell>
                                                <AmountCell value={dTotalExp} />
                                            </TableRow>
                                        </TableBody>
                                    </Table>

                                    <Box sx={{
                                        backgroundColor: '#1D366F', borderRadius: 1, px: 2, py: 1,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>
                                            Niðurstaða {MONTH_NAMES_FULL[drillMonth - 1]}
                                        </Typography>
                                        <Typography sx={{
                                            color: dNet >= 0 ? '#80cbc4' : '#ef9a9a',
                                            fontWeight: 600, fontSize: '0.85rem',
                                        }}>
                                            {fmtAmount(dNet)}
                                        </Typography>
                                    </Box>
                                </>
                            );
                        })()}
                    </DialogContent>
                    <DialogActions sx={{ px: 2 }}>
                        <Button sx={ghostButtonSx} onClick={closeDrill}>Loka</Button>
                    </DialogActions>
                </Dialog>

                </Box>{/* Zone 3 end */}
            </Box>{/* flex column end */}
        </div>
    );
}

export default ReportPage;
