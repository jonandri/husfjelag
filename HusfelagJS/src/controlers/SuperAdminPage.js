import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Divider, Paper, TextField, Button,
    CircularProgress, Alert, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableHead, TableRow, TableCell, TableBody,
    Collapse, IconButton, Tooltip,
    MenuItem, Select, FormControl, InputLabel,
    DialogContentText,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtKennitala } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const CATEGORY_TYPES = [
    { value: 'SHARED', label: 'Sameiginlegt' },
    { value: 'SHARE2', label: 'Hiti' },
    { value: 'SHARE3', label: 'Lóð' },
    { value: 'EQUAL',  label: 'Jafnskipt' },
];
const typeLabel = (type) => CATEGORY_TYPES.find(t => t.value === type)?.label || type;

const ACCOUNTING_KEY_TYPES = [
    { value: 'ASSET',     label: 'Eign' },
    { value: 'LIABILITY', label: 'Skuld' },
    { value: 'EQUITY',    label: 'Eigið fé' },
    { value: 'INCOME',    label: 'Tekjur' },
    { value: 'EXPENSE',   label: 'Gjöld' },
];
const keyTypeLabel = (type) => ACCOUNTING_KEY_TYPES.find(t => t.value === type)?.label || type;

function SuperAdminPage() {
    const navigate = useNavigate();
    const { user, setCurrentAssociation } = React.useContext(UserContext);

    React.useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (!user.is_superadmin) { navigate('/husfelag'); }
    }, [user]);

    if (!user?.is_superadmin) return null;

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <Typography variant="h5" gutterBottom>Kerfisstjóri</Typography>
                <Divider sx={{ mb: 4 }} />
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <CreateAssociationPanel user={user} onCreated={(assoc) => setCurrentAssociation(assoc)} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ImpersonatePanel user={user} onSelect={(assoc) => setCurrentAssociation(assoc)} />
                    </Grid>
                    <Grid item xs={12}>
                        <GlobalCategoriesPanel user={user} />
                    </Grid>
                    <Grid item xs={12}>
                        <GlobalAccountingKeysPanel user={user} />
                    </Grid>
                </Grid>
            </Box>
        </div>
    );
}

const HOUSING_ISAT = '94.99.1';

function CreateAssociationPanel({ user, onCreated }) {
    const navigate = useNavigate();
    const [assocSsn, setAssocSsn] = useState('');
    const [chairSsn, setChairSsn] = useState('');
    const [looking, setLooking] = useState(false);
    const [lookupError, setLookupError] = useState('');
    const [preview, setPreview] = useState(null);
    const [isatWarningOpen, setIsatWarningOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [success, setSuccess] = useState(null);

    const handleLookup = async () => {
        setLookupError(''); setPreview(null);
        setLooking(true);
        try {
            const resp = await fetch(`${API_URL}/Association/lookup?ssn=${assocSsn.replace(/-/g, '')}`);
            const data = await resp.json();
            if (resp.ok) {
                setPreview(data);
                if (data.isat_code && data.isat_code !== HOUSING_ISAT) {
                    setIsatWarningOpen(true);
                } else {
                    setConfirmOpen(true);
                }
            } else {
                setLookupError(data.detail || 'Villa við leit.');
            }
        } catch {
            setLookupError('Tenging við þjón mistókst.');
        } finally {
            setLooking(false);
        }
    };

    const handleCreate = async () => {
        setSaveError(''); setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/admin/Association`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    admin_user_id: user.id,
                    association_ssn: assocSsn.replace(/-/g, ''),
                    chair_ssn: chairSsn.replace(/-/g, ''),
                }),
            });
            const data = await resp.json();
            if (resp.ok) {
                setConfirmOpen(false);
                setSuccess(data);
                setAssocSsn(''); setChairSsn(''); setPreview(null);
            } else {
                setSaveError(data.detail || 'Villa við stofnun.');
            }
        } catch {
            setSaveError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Stofna húsfélag</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Upplýsingar húsfélags eru sóttar sjálfkrafa á skatturinn.is.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="Kennitala húsfélags"
                    value={assocSsn}
                    onChange={e => { setAssocSsn(e.target.value.replace(/[^0-9-]/g, '')); setLookupError(''); }}
                    size="small" fullWidth
                    placeholder="000000-0000"
                />
                <TextField
                    label="Kennitala formanns"
                    value={chairSsn}
                    onChange={e => setChairSsn(e.target.value.replace(/[^0-9-]/g, ''))}
                    size="small" fullWidth
                    placeholder="000000-0000"
                />
                {lookupError && <Alert severity="error">{lookupError}</Alert>}
                {success && (
                    <Alert severity="success" action={
                        <Button size="small" onClick={() => { onCreated(success); navigate('/husfelag'); }}>
                            Fara á síðu
                        </Button>
                    }>
                        {success.name} stofnað.
                    </Alert>
                )}
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={assocSsn.replace(/-/g,'').length !== 10 || chairSsn.replace(/-/g,'').length !== 10 || looking}
                    onClick={handleLookup}
                >
                    {looking ? <CircularProgress size={18} color="inherit" /> : 'Fletta upp og stofna'}
                </Button>
            </Box>

            {/* ÍSAT warning — shown before confirmation if code is unexpected */}
            <Dialog open={isatWarningOpen} onClose={() => setIsatWarningOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon color="warning" /> ÍSAT flokkur er ekki rétt
                </DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
                    <Typography variant="body2" gutterBottom>
                        Skráður ÍSAT flokkur er <strong>{preview?.isat_code}</strong>, ekki <strong>94.99.1</strong> (Starfsemi húsfélaga íbúðareigenda).
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {preview?.isat_label}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 2 }}>
                        Ertu viss um að þetta sé húsfélag sem á að skrá?
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setIsatWarningOpen(false)}>Hætta við</Button>
                    <Button
                        variant="contained" color="warning"
                        onClick={() => { setIsatWarningOpen(false); setConfirmOpen(true); }}
                    >
                        Já, halda áfram
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Staðfesta stofnun húsfélags</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <InfoRow label="Nafn" value={preview?.name} />
                        <InfoRow label="Kennitala" value={fmtKennitala(preview?.ssn)} />
                        <InfoRow label="Heimilisfang" value={preview?.address} />
                        <InfoRow label="Póstnúmer" value={preview?.postal_code} />
                        <InfoRow label="Staður" value={preview?.city} />
                        {preview?.isat_code && (
                            <InfoRow label="ÍSAT" value={`${preview.isat_code} – ${preview.isat_label}`} />
                        )}
                    </Box>
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setConfirmOpen(false); setSaveError(''); }}>Hætta við</Button>
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        onClick={handleCreate}
                        disabled={saving}
                    >
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Stofna'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

function InfoRow({ label, value }) {
    return (
        <Box sx={{ display: 'flex', gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>{label}:</Typography>
            <Typography variant="body2">{value || '—'}</Typography>
        </Box>
    );
}

function ImpersonatePanel({ user, onSelect }) {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    React.useEffect(() => {
        if (q.length < 2) { setResults([]); return; }
        setSearching(true);
        fetch(`${API_URL}/admin/Association?user_id=${user.id}&q=${encodeURIComponent(q)}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { setResults(data); setSearching(false); })
            .catch(() => setSearching(false));
    }, [q]);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Opna húsfélag</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Leita að húsfélagi og opna það sem kerfisstjóri.
            </Typography>
            <TextField
                label="Leita eftir nafni eða kennitölu"
                value={q}
                onChange={e => setQ(e.target.value)}
                size="small" fullWidth
                InputProps={{ endAdornment: searching ? <CircularProgress size={14} /> : null }}
            />
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {results.map(a => (
                    <Box
                        key={a.id}
                        sx={{
                            p: 1.5, borderRadius: 1, border: '1px solid rgba(0,0,0,0.1)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                    >
                        <Box>
                            <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{fmtKennitala(a.ssn)}</Typography>
                        </Box>
                        <Button
                            size="small" variant="outlined" color="secondary"
                            onClick={() => { onSelect(a); navigate('/husfelag'); }}
                        >
                            Opna
                        </Button>
                    </Box>
                ))}
                {q.length >= 2 && results.length === 0 && !searching && (
                    <Typography variant="body2" color="text.secondary">Ekkert húsfélag fannst.</Typography>
                )}
            </Box>
        </Paper>
    );
}

function GlobalCategoriesPanel({ user }) {
    const [categories, setCategories] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadCategories(); }, []);

    const loadCategories = async () => {
        try {
            const resp = await fetch(`${API_URL}/Category/${user.id}`);
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
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : '+ Bæta við flokk'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <GlobalAddCategoryForm
                    userId={user.id}
                    onCreated={() => { setShowForm(false); loadCategories(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                    Enginn flokkur skráður.
                </Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                <TableCell>Nafn</TableCell>
                                <TableCell>Tegund</TableCell>
                                <TableCell>Reikningur</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(c => (
                                <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories} />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {disabled.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Button
                        size="small" variant="text" color="inherit"
                        sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
                        onClick={() => setShowDisabled(v => !v)}
                    >
                        {showDisabled ? '▲' : '▼'} Óvirkir flokkar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                        <TableCell>Nafn</TableCell>
                                        <TableCell>Tegund</TableCell>
                                        <TableCell>Reikningur</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(c => (
                                        <GlobalCategoryRow key={c.id} category={c} userId={user.id} onSaved={loadCategories} isDisabled />
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

function GlobalAddCategoryForm({ userId, onCreated }) {
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Category`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, name: name.trim(), type }),
            });
            if (resp.ok) {
                setName(''); setType('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <TextField
                label="Nafn flokks" value={name}
                onChange={e => setName(e.target.value)}
                size="small" fullWidth
            />
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {CATEGORY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista flokk'}
            </Button>
        </Paper>
    );
}

function GlobalCategoryRow({ category, userId, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell>{category.name}</TableCell>
                <TableCell>{typeLabel(category.type)}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>
                    {category.expense_account_number || '—'}
                </TableCell>
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
                onSaved={() => { setEditOpen(false); onSaved(); }}
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

    React.useEffect(() => {
        if (open) {
            setName(category.name);
            setType(category.type);
            setError('');
            setExpenseAccountId(category.expense_account_id || '');
            fetch(`${API_URL}/AccountingKey/list`)
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
            const resp = await fetch(`${API_URL}/Category/update/${category.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type, expense_account_id: expenseAccountId || null }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    await fetch(`${API_URL}/Category/enable/${category.id}?user_id=${userId}`, { method: 'PATCH' });
                }
                onSaved();
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
            const resp = await fetch(`${API_URL}/Category/delete/${category.id}?user_id=${userId}`, { method: 'DELETE' });
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
                    <TextField
                        label="Nafn flokks" value={name}
                        onChange={e => setName(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {CATEGORY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Gjaldareikningur (valfrjálst)</InputLabel>
                        <Select
                            value={expenseAccountId}
                            label="Gjaldareikningur (valfrjálst)"
                            onChange={e => setExpenseAccountId(e.target.value)}
                        >
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {accountingKeys.filter(k => k.type === 'EXPENSE').map(k => (
                                <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button
                                onClick={() => setConfirmDisable(true)}
                                sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}
                            >
                                Óvirkja flokk
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            disabled={!isValid || saving}
                            onClick={handleSave}
                        >
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
                    <Button onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button
                        onClick={handleDisable}
                        color="error"
                        disabled={disabling}
                    >
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function GlobalAccountingKeysPanel({ user }) {
    const [keys, setKeys] = React.useState(undefined);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);
    const [showDisabled, setShowDisabled] = React.useState(false);

    React.useEffect(() => { loadKeys(); }, []);

    const loadKeys = async () => {
        try {
            const resp = await fetch(`${API_URL}/AccountingKey/${user.id}`);
            if (resp.ok) setKeys(await resp.json());
            else { setError('Villa við að sækja bókhaldslykla.'); setKeys([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setKeys([]);
        }
    };

    if (keys === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    const active = keys.filter(k => !k.deleted);
    const disabled = keys.filter(k => k.deleted);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                    <Typography variant="h6">Bókhaldslyklar</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Staðlað íslenskt bókhaldslykilkerfi — gilt fyrir öll húsfélög
                    </Typography>
                </Box>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    onClick={() => setShowForm(v => !v)}
                >
                    {showForm ? 'Loka' : '+ Bæta við lykli'}
                </Button>
            </Box>

            <Collapse in={showForm}>
                <GlobalAddAccountingKeyForm
                    userId={user.id}
                    onCreated={() => { setShowForm(false); loadKeys(); }}
                />
            </Collapse>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {active.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn bókhaldslykill skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                <TableCell sx={{ width: 80 }}>Númer</TableCell>
                                <TableCell>Heiti</TableCell>
                                <TableCell>Tegund</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {active.map(k => (
                                <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {disabled.length > 0 && (
                <Box sx={{ mt: 3 }}>
                    <Button
                        size="small" variant="text" color="inherit"
                        sx={{ color: 'text.secondary', textTransform: 'none', p: 0, minWidth: 0 }}
                        onClick={() => setShowDisabled(v => !v)}
                    >
                        {showDisabled ? '▲' : '▼'} Óvirkir lyklar ({disabled.length})
                    </Button>
                    <Collapse in={showDisabled}>
                        <Paper variant="outlined" sx={{ mt: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                        <TableCell sx={{ width: 80 }}>Númer</TableCell>
                                        <TableCell>Heiti</TableCell>
                                        <TableCell>Tegund</TableCell>
                                        <TableCell />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {disabled.map(k => (
                                        <GlobalAccountingKeyRow key={k.id} accountingKey={k} userId={user.id} onSaved={loadKeys} isDisabled />
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

function GlobalAddAccountingKeyForm({ userId, onCreated }) {
    const [number, setNumber] = React.useState('');
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    const isValid = number && name.trim() && type;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/AccountingKey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, number: parseInt(number, 10), name: name.trim(), type }),
            });
            if (resp.ok) {
                setNumber(''); setName(''); setType('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 480 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                    label="Númer" value={number}
                    onChange={e => setNumber(e.target.value.replace(/\D/g, ''))}
                    size="small" sx={{ width: 120 }}
                    inputProps={{ inputMode: 'numeric' }}
                />
                <TextField
                    label="Heiti lykils" value={name}
                    onChange={e => setName(e.target.value)}
                    size="small" sx={{ flex: 1 }}
                />
            </Box>
            <FormControl size="small" fullWidth>
                <InputLabel>Tegund</InputLabel>
                <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                    {ACCOUNTING_KEY_TYPES.map(t => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista lykil'}
            </Button>
        </Paper>
    );
}

function GlobalAccountingKeyRow({ accountingKey, userId, onSaved, isDisabled }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover sx={isDisabled ? { opacity: 0.55 } : {}}>
                <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{accountingKey.number}</TableCell>
                <TableCell>{accountingKey.name}</TableCell>
                <TableCell>{keyTypeLabel(accountingKey.type)}</TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title={isDisabled ? 'Virkja / breyta' : 'Breyta'}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <GlobalEditAccountingKeyDialog
                open={editOpen}
                onClose={() => setEditOpen(false)}
                accountingKey={accountingKey}
                userId={userId}
                isDisabled={isDisabled}
                onSaved={() => { setEditOpen(false); onSaved(); }}
            />
        </>
    );
}

function GlobalEditAccountingKeyDialog({ open, onClose, accountingKey, userId, isDisabled, onSaved }) {
    const [name, setName] = React.useState(accountingKey.name);
    const [type, setType] = React.useState(accountingKey.type);
    const [saving, setSaving] = React.useState(false);
    const [disabling, setDisabling] = React.useState(false);
    const [confirmDisable, setConfirmDisable] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) { setName(accountingKey.name); setType(accountingKey.type); setError(''); }
    }, [open, accountingKey]);

    const isValid = name.trim() && type;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/AccountingKey/update/${accountingKey.id}?user_id=${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), type }),
            });
            if (resp.ok) {
                if (isDisabled) {
                    await fetch(`${API_URL}/AccountingKey/enable/${accountingKey.id}?user_id=${userId}`, { method: 'PATCH' });
                }
                onSaved();
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
            const resp = await fetch(`${API_URL}/AccountingKey/delete/${accountingKey.id}?user_id=${userId}`, { method: 'DELETE' });
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
                <DialogTitle>{isDisabled ? 'Óvirkur lykill' : 'Breyta lykli'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField
                        label="Heiti lykils" value={name}
                        onChange={e => setName(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tegund</InputLabel>
                        <Select value={type} label="Tegund" onChange={e => setType(e.target.value)}>
                            {ACCOUNTING_KEY_TYPES.map(t => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Box>
                        {!isDisabled && (
                            <Button
                                onClick={() => setConfirmDisable(true)}
                                sx={{ color: 'text.disabled', textTransform: 'none', fontSize: '0.8rem', p: 0, minWidth: 0 }}
                            >
                                Óvirkja lykil
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            disabled={!isValid || saving}
                            onClick={handleSave}
                        >
                            {saving
                                ? <CircularProgress size={18} color="inherit" />
                                : isDisabled ? 'Virkja lykil' : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} maxWidth="xs">
                <DialogTitle>Óvirkja lykil?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Lykillinn verður falinn í flokkunarformi. Núverandi færslur haldast óbreyttar.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDisable(false)}>Hætta við</Button>
                    <Button onClick={handleDisable} color="error" disabled={disabling}>
                        {disabling ? <CircularProgress size={18} color="inherit" /> : 'Óvirkja'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default SuperAdminPage;
