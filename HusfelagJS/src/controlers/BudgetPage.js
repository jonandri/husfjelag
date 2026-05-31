import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Button, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';
import { primaryButtonSx, ghostButtonSx, secondaryButtonSx } from '../ui/buttons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_META = {
    SHARED: { label: 'Sameiginlegt', bg: '#e8f5e9', fg: '#2e7d32', dot: '#08C076' },
    SHARE2: { label: 'Hiti',         bg: '#e0f2f1', fg: '#00838f', dot: '#26c6da' },
    SHARE3: { label: 'Lóð',          bg: '#fff3e0', fg: '#e65100', dot: '#f59e0b' },
    EQUAL:  { label: 'Jafnskipt',    bg: '#f3e5f5', fg: '#7b1fa2', dot: '#ab47bc' },
};
const TYPE_ORDER = ['SHARED', 'SHARE2', 'SHARE3', 'EQUAL'];
const MONO = '"JetBrains Mono", "Courier New", monospace';

function TegundChip({ type }) {
    const cfg = TYPE_META[type] || { label: type, bg: '#f3f4f6', fg: '#555' };
    return (
        <Box component="span" sx={{
            display: 'inline-flex', alignItems: 'center',
            px: 1.25, py: '2px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 600,
            background: cfg.bg, color: cfg.fg, whiteSpace: 'nowrap',
        }}>{cfg.label}</Box>
    );
}

function BudgetPage() {
    const navigate = useNavigate();
    const { user, assocParam, currentAssociation } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [budget, setBudget] = useState(undefined);
    const [error, setError] = useState('');
    const [bankClaimMode, setBankClaimMode] = useState(null);
    const [notifyBudgetSending, setNotifyBudgetSending] = useState(false);
    const [notifyMessage, setNotifyMessage] = useState(null);
    const year = new Date().getFullYear();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadBudget();
        loadBankSettings();
    }, [user, assocParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadBudget = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/Budget/${user.id}${assocParam}`);
            if (resp.ok) setBudget(await resp.json());
            else if (resp.status === 404) setBudget(null);
            else { setError('Villa við að sækja áætlun.'); setBudget(null); }
        } catch { setError('Tenging við þjón mistókst.'); setBudget(null); }
    };

    const loadBankSettings = async () => {
        if (!currentAssociation?.id) return;
        try {
            const resp = await apiFetch(`${API_URL}/associations/${currentAssociation.id}/bank/settings`);
            if (resp.ok) {
                const s = await resp.json();
                setBankClaimMode(s.claim_mode || null);
            }
        } catch { /* bank settings are optional */ }
    };

    const handleNotifyBudget = async () => {
        if (!currentAssociation?.id || !budget?.year) return;
        setNotifyBudgetSending(true);
        setNotifyMessage(null);
        try {
            const resp = await apiFetch(
                `${API_URL}/associations/${currentAssociation.id}/bank/notify-budget?year=${budget.year}`,
                { method: 'POST' },
            );
            const d = await resp.json().catch(() => ({}));
            if (resp.ok) {
                setNotifyMessage({ type: 'success', text: d.detail || 'Áætlun send til Landsbankans.' });
            } else {
                setNotifyMessage({ type: 'error', text: d.detail || `Villa við sendingu (${resp.status}).` });
            }
        } catch {
            setNotifyMessage({ type: 'error', text: 'Tenging við þjón mistókst.' });
        } finally {
            setNotifyBudgetSending(false);
        }
    };

    const groups = useMemo(() => {
        if (!budget?.items) return {};
        const g = {};
        budget.items.forEach(item => {
            const t = item.category_type;
            (g[t] = g[t] || []).push(item);
        });
        return g;
    }, [budget]);

    const groupTotals = useMemo(() => {
        const t = {};
        Object.entries(groups).forEach(([k, items]) => {
            t[k] = items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
        });
        return t;
    }, [groups]);

    const total = useMemo(() => Object.values(groupTotals).reduce((s, v) => s + v, 0), [groupTotals]);

    if (budget === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const activeGroups = TYPE_ORDER.filter(k => groups[k]);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h5">
                                {budget ? `Áætlun ${budget.year}` : `Áætlun ${year}`}
                            </Typography>
                            {budget?.is_active && (
                                <Box component="span" sx={{
                                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                                    textTransform: 'uppercase', color: '#08C076',
                                    background: '#e8f5e9', px: 1, py: '3px', borderRadius: '4px',
                                }}>
                                    Virk{budget.version > 1 ? ` · útgáfa ${budget.version}` : ''}
                                </Box>
                            )}
                        </Box>
                        {budget && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                Gildir til 31.12.{budget.year}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        {budget?.is_active && bankClaimMode === 'BANK_SERVICE' && (
                            <Button
                                variant="outlined"
                                size="small"
                                sx={secondaryButtonSx}
                                onClick={handleNotifyBudget}
                                disabled={notifyBudgetSending}
                            >
                                {notifyBudgetSending ? 'Sendir...' : 'Senda áætlun til Landsbankans'}
                            </Button>
                        )}
                        <Button variant="contained" sx={primaryButtonSx} onClick={() => navigate('/aaetlun/nyr')}>
                            + Ný áætlun
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('aaetlun')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {notifyMessage && (
                        <Alert severity={notifyMessage.type} sx={{ mb: 2 }} onClose={() => setNotifyMessage(null)}>
                            {notifyMessage.text}
                        </Alert>
                    )}

                    {budget === null && !error && (
                        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Typography color="text.secondary">Engin áætlun hefur verið stofnuð.</Typography>
                            <Button variant="contained" sx={primaryButtonSx} onClick={() => navigate('/aaetlun/nyr')}>
                                Stofna áætlun
                            </Button>
                        </Box>
                    )}

                    {budget && budget.items.length === 0 && (
                        <Typography color="text.secondary" sx={{ mt: 4 }}>
                            Áætlun er til en engir flokkar eru skráðir.
                        </Typography>
                    )}

                    {budget && budget.items.length > 0 && (
                        <>
                            {/* KPI strip */}
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: '1.2fr 1fr 1.8fr',
                                border: '1px solid #e8e8e8',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                mb: 2,
                            }}>
                                <Box sx={{ p: '16px 20px', borderRight: '1px solid #e8e8e8' }}>
                                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#888', mb: 0.5 }}>
                                        Heildartala á ári
                                    </Typography>
                                    <Typography sx={{ fontFamily: MONO, fontSize: 26, fontWeight: 300, color: '#1D366F', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                                        {fmtAmount(total)}
                                    </Typography>
                                    <Typography sx={{ fontSize: 12, color: '#555', mt: 0.5 }}>
                                        {fmtAmount(Math.round(total / 12))}/mán
                                    </Typography>
                                </Box>
                                <Box sx={{ p: '16px 20px', borderRight: '1px solid #e8e8e8' }}>
                                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#888', mb: 0.5 }}>
                                        Flokkar
                                    </Typography>
                                    <Typography sx={{ fontFamily: MONO, fontSize: 22, fontWeight: 400, mt: 0.5 }}>
                                        {budget.items.length}
                                    </Typography>
                                    <Typography sx={{ fontSize: 12, color: '#555', mt: 0.5 }}>
                                        í {activeGroups.length} tegundum
                                    </Typography>
                                </Box>
                                <Box sx={{ p: '16px 20px' }}>
                                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#888', mb: 1.25 }}>
                                        Skipting eftir tegund
                                    </Typography>
                                    <Box sx={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: '#f3f4f6', mb: 1 }}>
                                        {activeGroups.map(k => (
                                            <Box key={k} sx={{ width: `${(groupTotals[k] / total) * 100}%`, background: TYPE_META[k].dot }} />
                                        ))}
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                                        {activeGroups.map(k => (
                                            <Box key={k} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 11, color: '#555' }}>
                                                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '2px', background: TYPE_META[k].dot, display: 'inline-block' }} />
                                                {TYPE_META[k].label}
                                                <Box component="span" sx={{ fontFamily: MONO, color: '#111', fontWeight: 500 }}>
                                                    {Math.round((groupTotals[k] / total) * 100)}%
                                                </Box>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            </Box>

                            {/* Grouped table */}
                            <Box sx={{ border: '1px solid #e8e8e8', borderRadius: '8px', overflow: 'hidden' }}>
                                {/* Table head */}
                                <Box sx={{
                                    display: 'grid', gridTemplateColumns: '1fr 160px 120px 44px',
                                    px: '18px', py: '10px',
                                    background: '#f5f5f5', borderBottom: '1px solid #e8e8e8',
                                    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
                                    textTransform: 'uppercase', color: '#888',
                                }}>
                                    <div>Flokkur</div>
                                    <Box sx={{ textAlign: 'right' }}>Upphæð á ári</Box>
                                    <Box sx={{ textAlign: 'right' }}>Á mánuði</Box>
                                    <div />
                                </Box>

                                {activeGroups.map((k, gi) => (
                                    <React.Fragment key={k}>
                                        {/* Group header row */}
                                        <Box sx={{
                                            display: 'grid', gridTemplateColumns: '1fr 160px 120px 44px',
                                            px: '18px', py: '8px',
                                            background: '#fff',
                                            borderTop: gi > 0 ? '1px solid #e8e8e8' : 'none',
                                            borderBottom: '1px solid #f2f2f2',
                                            alignItems: 'center',
                                        }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <TegundChip type={k} />
                                                <Typography sx={{ fontSize: 12, color: '#555' }}>
                                                    {groups[k].length} {groups[k].length === 1 ? 'flokkur' : 'flokkar'}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ textAlign: 'right', fontFamily: MONO, color: '#555', fontWeight: 500, fontSize: 12 }}>
                                                {fmtAmount(groupTotals[k])}
                                            </Box>
                                            <Box sx={{ textAlign: 'right', fontFamily: MONO, color: '#888', fontSize: 11.5 }}>
                                                {fmtAmount(Math.round(groupTotals[k] / 12))}
                                            </Box>
                                            <div />
                                        </Box>

                                        {/* Item rows */}
                                        {groups[k].map((item) => (
                                            <BudgetItemRow
                                                key={item.id}
                                                item={item}
                                                typeKey={k}
                                                onSaved={loadBudget}
                                            />
                                        ))}
                                    </React.Fragment>
                                ))}

                                {/* Totals footer */}
                                <Box sx={{
                                    display: 'grid', gridTemplateColumns: '1fr 160px 120px 44px',
                                    px: '18px', py: '14px',
                                    borderTop: '2px solid rgba(0,0,0,0.12)',
                                    background: '#fafafa',
                                    fontWeight: 600, fontSize: 14,
                                }}>
                                    <div>Samtals</div>
                                    <Box sx={{ textAlign: 'right', fontFamily: MONO }}>{fmtAmount(total)}</Box>
                                    <Box sx={{ textAlign: 'right', fontFamily: MONO, fontWeight: 500, color: '#555', fontSize: 12 }}>
                                        {fmtAmount(Math.round(total / 12))}
                                    </Box>
                                    <div />
                                </Box>
                            </Box>
                        </>
                    )}
                </Box>
            </Box>
        </div>
    );
}

function BudgetItemRow({ item, typeKey, onSaved }) {
    const [editOpen, setEditOpen] = useState(false);
    const amount = parseFloat(item.amount || 0);
    const dot = TYPE_META[typeKey]?.dot || '#ccc';

    return (
        <>
            <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 160px 120px 44px',
                px: '18px', py: '12px',
                borderBottom: '1px solid #f2f2f2',
                alignItems: 'center', fontSize: 13.5,
                '&:last-child': { borderBottom: 'none' },
                '&:hover': { background: 'rgba(0,0,0,0.015)' },
            }}>
                <Box sx={{ pl: 2.25, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 3, height: 16, borderRadius: '2px', background: dot, flexShrink: 0 }} />
                    {item.category_name}
                </Box>
                <Box sx={{ textAlign: 'right', fontFamily: MONO, fontWeight: 500 }}>
                    {fmtAmount(amount)}
                </Box>
                <Box sx={{ textAlign: 'right', fontFamily: MONO, color: '#555', fontSize: 12.5 }}>
                    {fmtAmount(Math.round(amount / 12))}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Tooltip title="Breyta upphæð">
                        <IconButton size="small" onClick={() => setEditOpen(true)} sx={{ color: '#bbb', '&:hover': { color: '#1D366F', background: 'rgba(29,54,111,0.06)' } }}>
                            <EditIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            <EditAmountDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                item={item}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditAmountDialog({ open, onClose, item, onSaved }) {
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const cfg = TYPE_META[item.category_type] || {};

    React.useEffect(() => {
        if (open) { setAmount(String(Math.round(parseFloat(item.amount || 0)))); setError(''); }
    }, [open, item]);

    const isValid = !isNaN(parseInt(amount)) && parseInt(amount) >= 0;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8010'}/BudgetItem/update/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: parseInt(amount) }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch { setError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>Breyta upphæð</DialogTitle>
            <DialogContent sx={{ pt: '8px !important' }}>
                <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box component="span" sx={{ width: 8, height: 8, borderRadius: '2px', background: cfg.dot, flexShrink: 0 }} />
                        <Typography fontWeight={500}>{item.category_name}</Typography>
                    </Box>
                    {cfg.label && (
                        <Box component="span" sx={{ fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.fg, px: 1.25, py: '2px', borderRadius: 999, mt: 0.5, display: 'inline-block' }}>
                            {cfg.label}
                        </Box>
                    )}
                </Box>
                <TextField
                    label="Upphæð á ári (kr.)"
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    size="small"
                    inputProps={{ inputMode: 'numeric', style: { textAlign: 'right', fontFamily: MONO } }}
                    fullWidth
                    autoFocus
                    onFocus={e => e.target.select()}
                    helperText={isValid && parseInt(amount) > 0 ? `${fmtAmount(Math.round(parseInt(amount) / 12))}/mán` : ' '}
                />
                {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" sx={primaryButtonSx}
                    disabled={!isValid || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default BudgetPage;
