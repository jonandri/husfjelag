import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Button, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    TextField, Alert, IconButton, Tooltip,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_META = {
    SHARED: { label: 'Sameiginlegt', color: '#08C076' },
    SHARE2: { label: 'Hiti',         color: '#7dd3d3' },
    SHARE3: { label: 'Lóð',          color: '#ffaa00' },
    EQUAL:  { label: 'Jafnskipt',    color: '#cc88ff' },
};

function BudgetWizardPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [categories, setCategories] = useState([]);
    const [previousBudget, setPreviousBudget] = useState(null);
    const [hasPrevious, setHasPrevious] = useState(false);
    const [amounts, setAmounts] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const year = new Date().getFullYear();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        Promise.all([
            fetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : Promise.reject('categories')),
            fetch(`${API_URL}/Budget/${user.id}${assocParam}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]).then(([cats, budget]) => {
            setCategories(cats);
            if (budget && budget.items && budget.items.length > 0) {
                setPreviousBudget(budget);
                setHasPrevious(true);
            }
            const init = {};
            cats.forEach(c => { init[c.id] = 0; });
            setAmounts(init);
            setLoading(false);
        }).catch(() => {
            setError('Villa við að sækja flokka. Reyndu aftur.');
            setLoading(false);
        });
    }, [user, assocParam, navigate]);

    const handleCopyPrevious = () => {
        const filled = {};
        categories.forEach(c => { filled[c.id] = 0; });
        if (previousBudget) {
            previousBudget.items.forEach(item => {
                filled[item.category_id] = Math.round(parseFloat(item.amount || 0));
            });
        }
        setAmounts(filled);
        setStep(2);
    };

    const handleStartFresh = () => {
        const blank = {};
        categories.forEach(c => { blank[c.id] = 0; });
        setAmounts(blank);
        setStep(2);
    };

    const totals = React.useMemo(() => {
        const t = { SHARED: 0, SHARE2: 0, SHARE3: 0, EQUAL: 0 };
        categories.forEach(c => {
            if (t[c.type] !== undefined) t[c.type] += (parseInt(amounts[c.id]) || 0);
        });
        return t;
    }, [amounts, categories]);

    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    const handleConfirm = async () => {
        setSubmitError('');
        setSubmitting(true);
        const items = categories
            .map(c => ({ category_id: c.id, amount: parseInt(amounts[c.id]) || 0 }))
            .filter(i => i.amount > 0);
        try {
            const resp = await fetch(`${API_URL}/Budget/wizard${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id, items }),
            });
            if (resp.ok) {
                navigate('/aaetlun');
            } else {
                const data = await resp.json();
                setSubmitError(data.detail || 'Villa við að vista áætlun. Reyndu aftur.');
            }
        } catch {
            setSubmitError('Villa við að vista áætlun. Reyndu aftur.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Box>
                        <Button
                            size="small" variant="text" color="inherit"
                            sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0, mb: 0.5 }}
                            onClick={() => navigate('/aaetlun')}
                        >
                            ← Áætlun
                        </Button>
                        <Typography variant="h5">Ný áætlun</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('aaetlun-wizard')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {step === 1 && (
                    <Step1
                        year={year}
                        hasPrevious={hasPrevious}
                        previousBudget={previousBudget}
                        onCopy={handleCopyPrevious}
                        onFresh={handleStartFresh}
                    />
                )}
                {step === 2 && (
                    <Step2
                        hasPrevious={hasPrevious}
                        categories={categories}
                        amounts={amounts}
                        setAmounts={setAmounts}
                        totals={totals}
                        grandTotal={grandTotal}
                        onBack={() => hasPrevious ? setStep(1) : navigate('/aaetlun')}
                        onNext={() => setStep(3)}
                    />
                )}
                {step === 3 && (
                    <Step3
                        year={year}
                        hasPrevious={hasPrevious}
                        totals={totals}
                        grandTotal={grandTotal}
                        categories={categories}
                        submitting={submitting}
                        error={submitError}
                        onBack={() => setStep(2)}
                        onConfirm={handleConfirm}
                    />
                )}
            </Box>
            </Box>
        </div>
    );
}

function Step1({ year, hasPrevious, previousBudget, onCopy, onFresh }) {
    return (
        <Box sx={{ maxWidth: 480 }}>
            <Typography variant="caption" color="text.secondary">
                {hasPrevious ? 'Skref 1 af 3' : ''}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 2 }}>Ný áætlun {year}</Typography>
            {hasPrevious ? (
                <>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Viltu nota fyrri áætlun sem grunn?
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2, cursor: 'pointer',
                                borderColor: 'secondary.main',
                                '&:hover': { bgcolor: 'rgba(8,192,118,0.05)' },
                            }}
                            onClick={onCopy}
                        >
                            <Typography fontWeight={500} color="secondary.main">
                                ↩ Afrita frá áætlun {previousBudget?.year}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Byrja með sömu upphæðir og í fyrri áætlun — breyta þar sem þarf
                            </Typography>
                        </Paper>
                        <Paper
                            variant="outlined"
                            sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' } }}
                            onClick={onFresh}
                        >
                            <Typography fontWeight={500}>✦ Byrja frá grunni</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                Slá inn allar upphæðir af nýju
                            </Typography>
                        </Paper>
                    </Box>
                </>
            ) : (
                <>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Engin fyrri áætlun er til. Settu inn upphæðir fyrir hvern flokk í næsta skrefi.
                    </Typography>
                    <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={onFresh}>
                        Áfram →
                    </Button>
                </>
            )}
        </Box>
    );
}

function Step2({ hasPrevious, categories, amounts, setAmounts, totals, grandTotal, onBack, onNext }) {
    const stepLabel = hasPrevious ? 'Skref 2 af 3' : 'Skref 1 af 2';
    return (
        <Box sx={{ maxWidth: 680 }}>
            <Typography variant="caption" color="text.secondary">{stepLabel}</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 3 }}>Upphæðir per flokk</Typography>

            {categories.length === 0 ? (
                <Alert severity="info">
                    Engir flokkar eru skilgreindir. Kerfisstjóri þarf að bæta við flokkum.
                </Alert>
            ) : (
                <>
                    <Paper variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell>Tegund</TableCell>
                                    <TableCell align="right">Upphæð á ári (kr.)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {categories.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell>{c.name}</TableCell>
                                        <TableCell sx={{ color: TYPE_META[c.type]?.color || 'text.secondary' }}>
                                            {TYPE_META[c.type]?.label || c.type}
                                        </TableCell>
                                        <TableCell align="right" sx={{ width: 150 }}>
                                            <TextField
                                                value={amounts[c.id] ? String(amounts[c.id]) : ''}
                                                onChange={e => {
                                                    const v = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                                    setAmounts(prev => ({ ...prev, [c.id]: v }));
                                                }}
                                                placeholder="0"
                                                size="small"
                                                inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                                                sx={{ width: 130 }}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>

                    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                        <Typography
                            variant="caption"
                            sx={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, color: 'text.secondary' }}
                        >
                            Samtals
                        </Typography>
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {Object.entries(totals).map(([type, total]) =>
                                total > 0 ? (
                                    <Box key={type} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: TYPE_META[type]?.color || 'text.primary' }}>
                                            {TYPE_META[type]?.label || type}
                                        </Typography>
                                        <Typography variant="body2">{fmtAmount(total)}</Typography>
                                    </Box>
                                ) : null
                            )}
                            <Box sx={{
                                display: 'flex', justifyContent: 'space-between',
                                borderTop: '1px solid rgba(0,0,0,0.12)', pt: 0.75, mt: 0.5,
                            }}>
                                <Typography variant="body2" fontWeight={600}>Heildartala</Typography>
                                <Typography variant="body2" fontWeight={600}>{fmtAmount(grandTotal)}</Typography>
                            </Box>
                        </Box>
                    </Paper>
                </>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button variant="outlined" onClick={onBack}>← Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={onNext}
                    disabled={categories.length === 0}
                >
                    Áfram →
                </Button>
            </Box>
        </Box>
    );
}

function Step3({ year, hasPrevious, totals, grandTotal, categories, submitting, error, onBack, onConfirm }) {
    const stepLabel = hasPrevious ? 'Skref 3 af 3' : 'Skref 2 af 2';
    const typesWithAmount = Object.entries(totals).filter(([, v]) => v > 0);
    return (
        <Box sx={{ maxWidth: 520 }}>
            <Typography variant="caption" color="text.secondary">{stepLabel}</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, mb: 1 }}>Yfirlit og staðfesting</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                Áætlun {year} — yfirlit eftir tegund
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {typesWithAmount.map(([type, total]) => {
                    const count = categories.filter(c => c.type === type).length;
                    const meta = TYPE_META[type] || { label: type, color: 'inherit' };
                    return (
                        <Box
                            key={type}
                            sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                p: 1.5, borderRadius: 1,
                                border: `1px solid ${meta.color}44`,
                                bgcolor: `${meta.color}18`,
                            }}
                        >
                            <Box>
                                <Typography fontWeight={600} sx={{ color: meta.color, fontSize: '0.9rem' }}>
                                    {meta.label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {count} {count === 1 ? 'flokkur' : 'flokkar'}
                                </Typography>
                            </Box>
                            <Typography fontWeight={600}>{fmtAmount(total)}</Typography>
                        </Box>
                    );
                })}
                <Box sx={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '2px solid rgba(0,0,0,0.12)', pt: 1.5, mt: 0.5,
                }}>
                    <Typography fontWeight={600}>Heildartala</Typography>
                    <Typography fontWeight={700} sx={{ fontSize: '1.05rem' }}>{fmtAmount(grandTotal)}</Typography>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button variant="outlined" onClick={onBack}>← Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={submitting || grandTotal === 0}
                    onClick={onConfirm}
                >
                    {submitting
                        ? <CircularProgress size={18} color="inherit" />
                        : '✓ Staðfesta og virkja áætlun'}
                </Button>
            </Box>
        </Box>
    );
}

export default BudgetWizardPage;
