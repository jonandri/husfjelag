import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Button, TextField, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { useSort, HEAD_SX, HEAD_CELL_SX, TOTALS_ROW_SX, AmountCell } from './tableUtils';
import { primaryButtonSx, ghostButtonSx } from '../ui/buttons';
import { LabelChip } from '../ui/chips';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_LABELS = {
    SHARED: 'Sameiginlegt',
    SHARE2: 'Hiti',
    SHARE3: 'Lóð',
    EQUAL:  'Jafnskipt',
};

function BudgetPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [budget, setBudget] = useState(undefined);  // undefined = loading, null = none
    const [error, setError] = useState('');
    const year = new Date().getFullYear();
    const { sort, lbl } = useSort('category_name');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadBudget();
    }, [user, assocParam]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadBudget = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/Budget/${user.id}${assocParam}`);
            if (resp.ok) setBudget(await resp.json());
            else if (resp.status === 404) setBudget(null);  // no budget yet — show empty state
            else { setError('Villa við að sækja áætlun.'); setBudget(null); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setBudget(null);
        }
    };

    const handleCreate = () => navigate('/aaetlun/nyr');

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

    const budgetTitle = budget
        ? `Áætlun ${budget.year}${budget.version > 1 ? ` v${budget.version}` : ''}`
        : `Áætlun ${year}`;

    const total = budget
        ? budget.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0)
        : 0;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Box>
                        <Typography variant="h5">{budgetTitle}</Typography>
                        {budget && (
                            <Typography variant="body2" color="text.secondary">
                                {budget.year}
                                {budget.version > 1 ? ` — útgáfa ${budget.version}` : ''}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Button variant="contained" sx={primaryButtonSx} onClick={handleCreate}>
                            + Ný áætlun
                        </Button>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('aaetlun')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {budget === null && !error && (
                        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Typography color="text.secondary">Engin áætlun hefur verið stofnuð.</Typography>
                            <Button variant="contained" sx={primaryButtonSx} onClick={handleCreate}>
                                Stofna áætlun
                            </Button>
                        </Box>
                    )}

                    {budget && (budget.items.length === 0 ? (
                        <Typography color="text.secondary" sx={{ mt: 4 }}>
                            Áætlun er til en engir flokkar eru skráðir.
                        </Typography>
                    ) : (
                        <Paper variant="outlined" sx={{ mt: 2 }}>
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('category_name', 'Flokkur')}</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>{lbl('category_type', 'Tegund')}</TableCell>
                                        <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('amount', 'Upphæð')}</TableCell>
                                        <TableCell sx={{ width: 48 }} />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sort(budget.items).map(item => (
                                        <BudgetItemRow
                                            key={item.id}
                                            item={item}
                                            onSaved={loadBudget}
                                        />
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow sx={TOTALS_ROW_SX}>
                                        <TableCell>Samtals</TableCell>
                                        <TableCell />
                                        <AmountCell value={-total} />
                                        <TableCell />
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </Paper>
                    ))}
                </Box>
            </Box>
        </div>
    );
}

function BudgetItemRow({ item, onSaved }) {
    const [editOpen, setEditOpen] = useState(false);
    return (
        <>
            <TableRow hover>
                <TableCell>{item.category_name}</TableCell>
                <TableCell><LabelChip label={TYPE_LABELS[item.category_type] || item.category_type} /></TableCell>
                <AmountCell value={-parseFloat(item.amount || 0)} />
                <TableCell align="right">
                    <Tooltip title="Breyta upphæð">
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
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
    const [amount, setAmount] = useState(String(item.amount));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) { setAmount(String(Math.round(parseFloat(item.amount || 0)))); setError(''); }
    }, [open, item]);

    const isValid = parseFloat(amount) >= 0 && !isNaN(parseFloat(amount));

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/BudgetItem/update/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: parseFloat(amount) }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Breyta upphæð</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Box>
                    <Typography variant="body1" fontWeight={500}>{item.category_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {TYPE_LABELS[item.category_type] || item.category_type}
                    </Typography>
                </Box>
                <TextField
                    label="Upphæð"
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    size="small"
                    type="number"
                    inputProps={{ min: 0, step: 1 }}
                    fullWidth
                    autoFocus
                    onFocus={e => e.target.select()}
                />
                {error && <Alert severity="error">{error}</Alert>}
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
