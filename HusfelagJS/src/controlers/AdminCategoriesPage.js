import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Paper, TextField, Button,
    CircularProgress, Alert, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
    Table, TableHead, TableRow, TableCell, TableBody,
    Collapse, IconButton, Tooltip,
    MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import { HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import { LabelChip } from '../ui/chips';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const CATEGORY_TYPES = [
    { value: 'SHARED', label: 'Sameiginlegt' },
    { value: 'SHARE2', label: 'Hiti' },
    { value: 'SHARE3', label: 'Lóð' },
    { value: 'EQUAL',  label: 'Jafnskipt' },
    { value: 'INCOME', label: 'Tekjur' },
];
const typeLabel = (type) => CATEGORY_TYPES.find(t => t.value === type)?.label || type;

export default function AdminCategoriesPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    React.useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (!user.is_superadmin) { navigate('/dashboard'); }
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user?.is_superadmin) return null;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Typography variant="h5">Flokkar og flokkunarreglur</Typography>
                </Box>
                {/* Zone 2: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12}>
                            <GlobalCategoriesPanel user={user} />
                        </Grid>
                        <Grid item xs={12}>
                            <GlobalCategoryRulesPanel user={user} />
                        </Grid>
                    </Grid>
                </Box>
            </Box>
        </div>
    );
}

function GlobalCategoriesPanel({ user }) {
    const [categories, setCategories] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadCategories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadCategories = async () => {
        try {
            const resp = await apiFetch(`${API_URL}/Category/${user.id}`);
            if (resp.ok) setCategories(await resp.json());
            else { setError('Villa við að sækja flokka.'); setCategories([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setCategories([]);
        }
    };

    if (categories === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    const active = categories.filter(c => !c.deleted);
    const disabled = categories.filter(c => c.deleted);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Flokkar</Typography>
                    <Typography variant="body2" color="text.secondary">Gildir fyrir öll húsfélög</Typography>
                </Box>
                <Button variant="contained" sx={primaryButtonSx} startIcon={<AddIcon />} onClick={() => setShowForm(true)}>
                    Bæta við flokk
                </Button>
            </Box>

            <GlobalCreateCategoryDialog
                open={showForm}
                onClose={() => setShowForm(false)}
                userId={user.id}
                onCreated={() => { setShowForm(false); loadCategories(); }}
            />

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn flokkur skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Nafn</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Tegund</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Bókhaldsreikningur</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(c => (
                                <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories}
                                    onUpdated={updated => setCategories(cats => cats.map(cat => cat.id === updated.id ? updated : cat))} />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {disabled.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Button size="small" variant="text" sx={{ ...ghostButtonSx, p: 0, minWidth: 0 }}
                        onClick={() => setShowDisabled(v => !v)}
                    >
                        {showDisabled ? '▲' : '▼'} Óvirkir flokkar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={HEAD_CELL_SX}>Nafn</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>Tegund</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>Bókhaldsreikningur</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(c => (
                                        <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories} isDisabled
                                            onUpdated={updated => setCategories(cats => cats.map(cat => cat.id === updated.id ? updated : cat))} />
                                    ))}
                                </TableBody>
                            </Table>
                        </Paper>
                    </Collapse>
                </Box>
            )}
        </Paper>
    );
}

function GlobalCreateCategoryDialog({ open, onClose, userId, onCreated }) {
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [expenseAccountId, setExpenseAccountId] = React.useState('');
    const [incomeAccountId, setIncomeAccountId] = React.useState('');
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) {
            setName(''); setType(''); setExpenseAccountId(''); setIncomeAccountId(''); setError('');
            apiFetch(`${API_URL}/AccountingKey/list`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAccountingKeys(data))
                .catch(() => {});
        }
    }, [open]);

    const isValid = name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Category`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name: name.trim(), type, expense_account_id: expenseAccountId || null, income_account_id: incomeAccountId || null }),
            });
            if (resp.ok) { onCreated(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa við skráningu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Nýr flokkur</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '20px !important' }}>
                <TextField label="Nafn flokks" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth autoFocus />
                <FormControl size="small" fullWidth>
                    <InputLabel>Tegund</InputLabel>
                    <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                        {CATEGORY_TYPES.map(t => (
                            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                    <InputLabel>Bókhaldsreikningur (valfrjálst)</InputLabel>
                    <Select value={expenseAccountId} label="Bókhaldsreikningur (valfrjálst)" onChange={e => setExpenseAccountId(e.target.value)}>
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
                            <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                    <InputLabel>Tekjureikningur (valfrjálst)</InputLabel>
                    <Select value={incomeAccountId} label="Tekjureikningur (valfrjálst)" onChange={e => setIncomeAccountId(e.target.value)}>
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {accountingKeys.filter(k => k.type === 'INCOME').map(k => (
                            <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSubmit}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista flokk'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function GlobalCategoryRow({ category, userId, onSaved, onUpdated, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    const accountLabel = category.expense_account_number
        ? `${category.expense_account_number} · ${category.expense_account_name}`
        : category.income_account_number
            ? `${category.income_account_number} · ${category.income_account_name}`
            : '—';
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{category.name}</TableCell>
                <TableCell><LabelChip label={typeLabel(category.type)} /></TableCell>
                <TableCell>{accountLabel !== '—' ? <LabelChip label={accountLabel} /> : <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <GlobalEditCategoryDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                category={category}
                userId={userId}
                isDisabled={isDisabled}
                onSaved={(updated) => { setEditOpen(false); if (updated) onUpdated(updated); onSaved(); }}
            />
        </>
    );
}

function GlobalEditCategoryDialog({ open, onClose, category, userId, isDisabled, onSaved }) {
    const [name, setName] = React.useState(category.name);
    const [type, setType] = React.useState(category.type);
    const [saving, setSaving] = React.useState(false);
    const [disabling, setDisabling] = React.useState(false);
    const [confirmDisable, setConfirmDisable] = React.useState(false);
    const [error, setError] = React.useState('');
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [expenseAccountId, setExpenseAccountId] = React.useState(category.expense_account_id || '');
    const [incomeAccountId, setIncomeAccountId] = React.useState(category.income_account_id || '');

    React.useEffect(() => {
        if (open) {
            setName(category.name);
            setType(category.type);
            setError('');
            setExpenseAccountId(category.expense_account_id || '');
            setIncomeAccountId(category.income_account_id || '');
            apiFetch(`${API_URL}/AccountingKey/list`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAccountingKeys(data))
                .catch(() => {});
        }
    }, [open, category]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/Category/update/${category.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type, expense_account_id: expenseAccountId || null, income_account_id: incomeAccountId || null }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                if (isDisabled) {
                    await apiFetch(`${API_URL}/Category/enable/${category.id}?user_id=${userId}`, { method: 'PATCH' });
                }
                onSaved(updated);
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við uppfærslu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async () => {
        setDisabling(true);
        try {
            const resp = await apiFetch(`${API_URL}/Category/delete/${category.id}?user_id=${userId}`, { method: 'DELETE' });
            if (resp.ok) { setConfirmDisable(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa.'); setConfirmDisable(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDisable(false);
        } finally {
            setDisabling(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>{isDisabled ? 'Óvirkur flokkur' : 'Breyta flokk'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '20px !important' }}>
                    <TextField label="Nafn flokks" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {CATEGORY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Bókhaldsreikningur (valfrjálst)</InputLabel>
                        <Select value={expenseAccountId} label="Bókhaldsreikningur (valfrjálst)"
                            onChange={e => setExpenseAccountId(e.target.value)}>
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
                                <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tekjureikningur (valfrjálst)</InputLabel>
                        <Select value={incomeAccountId} label="Tekjureikningur (valfrjálst)"
                            onChange={e => setIncomeAccountId(e.target.value)}>
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {accountingKeys.filter(k => k.type === 'INCOME').map(k => (
                                <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button onClick={() => setConfirmDisable(true)}
                                sx={{ ...destructiveButtonSx, fontSize: '0.8rem' }}>
                                Óvirkja flokk
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                        <Button variant="contained" sx={primaryButtonSx} disabled={!isValid || saving} onClick={handleSave}>
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja flokk' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs">
                <DialogTitle>Óvirkja flokk?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Flokkurinn verður falinn í áætlunargerð. Núverandi áætlanir haldast óbreyttar.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostButtonSx} onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button sx={destructiveButtonSx} onClick={handleDisable} disabled={disabling}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function GlobalCategoryRulesPanel({ user }) {
    const [rules, setRules] = React.useState([]);
    const [categories, setCategories] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editRule, setEditRule] = React.useState(null);
    const [keyword, setKeyword] = React.useState('');
    const [categoryId, setCategoryId] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState('');
    const [deleteRule, setDeleteRule] = React.useState(null);
    const [deleting, setDeleting] = React.useState(false);

    React.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const load = () => {
        if (!user?.id) return;
        setLoading(true);
        Promise.all([
            apiFetch(`${API_URL}/CategoryRule/${user.id}`).then(r => r.ok ? r.json() : null),
            apiFetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : []),
        ]).then(([rulesData, cats]) => {
            if (rulesData) setRules(rulesData.global_rules || []);
            setCategories(cats || []);
        }).catch(() => setError('Gat ekki sótt reglur.'))
        .finally(() => setLoading(false));
    };

    const openCreate = () => { setEditRule(null); setKeyword(''); setCategoryId(''); setSaveError(''); setDialogOpen(true); };
    const openEdit = (rule) => { setEditRule(rule); setKeyword(rule.keyword); setCategoryId(rule.category.id); setSaveError(''); setDialogOpen(true); };

    const handleSave = async () => {
        if (!keyword.trim() || !categoryId) { setSaveError('Lykilorð og flokkur eru nauðsynleg.'); return; }
        setSaving(true); setSaveError('');
        try {
            const resp = editRule
                ? await apiFetch(`${API_URL}/CategoryRule/update/${editRule.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId }),
                })
                : await apiFetch(`${API_URL}/CategoryRule`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId, is_global: true }),
                });
            if (resp.ok) { setDialogOpen(false); load(); }
            else { const data = await resp.json(); setSaveError(data.detail || 'Villa við vistun.'); }
        } catch { setSaveError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteRule) return;
        setDeleting(true);
        try {
            const resp = await apiFetch(`${API_URL}/CategoryRule/delete/${deleteRule.id}`, {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) { setDeleteRule(null); load(); }
        } catch {}
        finally { setDeleting(false); }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Flokkunarreglur</Typography>
                    <Typography variant="body2" color="text.secondary">Almennar reglur — gilda fyrir öll húsfélög</Typography>
                </Box>
                <Button variant="contained" sx={primaryButtonSx} startIcon={<AddIcon />} onClick={openCreate}>
                    Ný regla
                </Button>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            ) : (
                <>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {rules.length === 0 ? (
                        <Typography color="text.secondary">Engar almennar reglur skráðar.</Typography>
                    ) : (
                        <Paper variant="outlined">
                            <Table size="small">
                                <TableHead sx={HEAD_SX}>
                                    <TableRow>
                                        <TableCell sx={HEAD_CELL_SX}>Lykilorð</TableCell>
                                        <TableCell sx={HEAD_CELL_SX}>Flokkur</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rules.map(rule => (
                                        <TableRow key={rule.id} hover>
                                            <TableCell>{rule.keyword}</TableCell>
                                            <TableCell><LabelChip label={rule.category.name} /></TableCell>
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
                        </Paper>
                    )}
                </>
            )}

            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editRule ? 'Breyta reglu' : 'Ný almenn regla'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField label="Lykilorð" value={keyword} size="small" fullWidth autoFocus onChange={e => setKeyword(e.target.value)} />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Flokkur</InputLabel>
                        <Select value={categoryId} label="Flokkur" onChange={e => setCategoryId(e.target.value)}>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button sx={ghostButtonSx} onClick={() => setDialogOpen(false)}>Hætta við</Button>
                    <Button variant="contained" sx={primaryButtonSx} onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!deleteRule} onClose={() => setDeleteRule(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Eyða reglu</DialogTitle>
                <DialogContent>
                    <Typography>Ertu viss um að þú viljir eyða reglunni <strong>"{deleteRule?.keyword}"</strong>?</Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button sx={ghostButtonSx} onClick={() => setDeleteRule(null)}>Hætta við</Button>
                    <Button sx={destructiveButtonSx} onClick={handleDelete} disabled={deleting}>
                        {deleting ? <CircularProgress size={18} color="inherit" /> : 'Eyða'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}
