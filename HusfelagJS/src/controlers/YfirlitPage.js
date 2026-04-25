// HusfelagJS/src/controlers/YfirlitPage.js
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Button,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import AssignmentIcon from '@mui/icons-material/Assignment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';
import { secondaryButtonSx } from '../ui/buttons';
import Eyebrow from '../ui/Eyebrow';
import AnnualStatementDialog from '../ui/AnnualStatementDialog';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const NAVY     = '#1D366F';
const GREEN    = '#08C076'; // used in Task 4
const BORDER   = '#e8e8e8';
const BORDER_ROW = '#f2f2f2'; // used in Task 4
const POSITIVE = '#2e7d32';
const NEGATIVE = '#c62828';
const WARNING  = '#e65100';
const monoSx = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' };

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Maí', 'Jún', 'Júl', 'Ágú', 'Sep', 'Okt', 'Nóv', 'Des'];

export default function YfirlitPage() {
    const navigate = useNavigate();
    const { user, assocParam, currentAssociation } = React.useContext(UserContext);

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
        // assocParam already starts with '?' when set (e.g. '?as=5')
        const bankQs  = assocParam || '';
        const collQs  = assocParam ? `${assocParam}&month=${month}&year=${year}` : `?month=${month}&year=${year}`;
        const repQs   = assocParam ? `${assocParam}&year=${year}` : `?year=${year}`;

        Promise.all([
            apiFetch(`${API_URL}/BankAccount/${user.id}${bankQs}`).then(r => r.ok ? r.json() : []),
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
    // eslint-disable-next-line no-unused-vars
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
