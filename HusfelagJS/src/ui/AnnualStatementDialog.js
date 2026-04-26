import React, { useEffect, useState } from 'react';
import {
    Box, Typography, CircularProgress, Alert,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    IconButton, Tooltip as MuiTooltip,
    Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

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

export default function AnnualStatementDialog({ open, onClose, year, userId, assocParam }) {
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
