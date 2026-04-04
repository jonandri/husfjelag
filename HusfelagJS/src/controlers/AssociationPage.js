import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper, Grid,
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText,
    DialogActions, Button, Alert, Autocomplete, TextField,
    Table, TableHead, TableRow, TableCell, TableBody,
    FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import HouseAssociationForm from './HouseAssociation';
import { fmtKennitala, fmtAmount } from '../format';
import { primaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import { LabelChip } from '../ui/chips';
import { HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useHelp } from '../ui/HelpContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function AssociationPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [association, setAssociation] = useState(undefined);
    const [owners, setOwners] = useState([]);
    const [error, setError] = useState('');
    const [roleDialog, setRoleDialog] = useState(null);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam]);

    const loadAll = async () => {
        try {
            const [assocResp, ownersResp] = await Promise.all([
                fetch(`${API_URL}/Association/${user.id}${assocParam}`),
                fetch(`${API_URL}/Owner/${user.id}${assocParam}`),
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

    if (association === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    if (!association) {
        return (
            <div className="dashboard">
                <SideBar />
                <HouseAssociationForm onCreated={() => setAssociation(undefined)} />
            </div>
        );
    }

    const subtitle = [
        `Kennitala: ${fmtKennitala(association.ssn)}`,
        `${association.address}, ${association.postal_code} ${association.city}`,
    ].join('  ·  ');

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Header zone */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h5">{association.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="Hjálp">
                            <IconButton size="small" onClick={() => openHelp('husfelag')}>
                                <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Scrollable content zone */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
                    {/* Row 1: association stats */}
                    <Grid container spacing={2} sx={{ alignItems: 'stretch', mb: 3 }}>
                        <KpiCard label="Íbúðir" value={association.apartment_count} />
                        <KpiCard label="Eigendur" value={association.owner_count} />
                        <RoleCard
                            label="Formaður"
                            value={association.chair || '—'}
                            onEdit={() => setRoleDialog({ role: 'CHAIR', label: 'Formaður', currentName: association.chair })}
                        />
                        <RoleCard
                            label="Gjaldkeri"
                            value={association.cfo || '—'}
                            onEdit={() => setRoleDialog({ role: 'CFO', label: 'Gjaldkeri', currentName: association.cfo })}
                        />
                    </Grid>

                    {error && <Typography color="error" sx={{ mt: 3 }}>{error}</Typography>}

                    <BankAccountsPanel user={user} assocParam={assocParam} />
                    <AssociationRulesPanel user={user} assocParam={assocParam} />
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
}

function KpiCard({ label, value, small, alert }) {
    return (
        <Grid item xs={12} sm={6} md={3} lg={2} sx={{ display: 'flex' }}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 110 }}>
                <Typography
                    variant={small ? 'h6' : 'h4'}
                    sx={{ fontWeight: small ? 400 : 300, lineHeight: 1.2, color: alert ? '#c62828' : 'secondary.main' }}
                >
                    {value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {label}
                </Typography>
            </Paper>
        </Grid>
    );
}

function RoleCard({ label, value, onEdit }) {
    return (
        <Grid item xs={12} sm={6} md={3} lg={2} sx={{ display: 'flex' }}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 110 }}>
                <Tooltip title={`Breyta ${label}`}>
                    <IconButton
                        size="small"
                        onClick={onEdit}
                        sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.4, '&:hover': { opacity: 1 } }}
                    >
                        <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
                <Typography variant="h6" color="secondary.main" sx={{ fontWeight: 300, lineHeight: 1.3 }}>
                    {value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {label}
                </Typography>
            </Paper>
        </Grid>
    );
}

function RoleDialog({ open, role, label, currentName, owners, userId, assocParam, onClose, onSaved }) {
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const inputLabel = role === 'CHAIR' ? 'Kennitala nýs formanns' : 'Kennitala nýs gjaldkera';

    const handleSave = async () => {
        if (!selected) return;
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Association/roles/${userId}${assocParam}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, kennitala: selected.kennitala }),
            });
            if (resp.ok) {
                onSaved(await resp.json());
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við vistun.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Breyta {label}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                    {label}: <strong>{currentName || '—'}</strong>
                </Typography>
                <Autocomplete
                    options={owners}
                    getOptionLabel={o => `${o.name} — ${fmtKennitala(o.kennitala)}`}
                    filterOptions={(opts, { inputValue }) => {
                        const q = inputValue.toLowerCase();
                        return opts.filter(o =>
                            o.name.toLowerCase().includes(q) || o.kennitala.includes(q)
                        );
                    }}
                    value={selected}
                    onChange={(_, val) => setSelected(val)}
                    renderInput={params => (
                        <TextField {...params} label={inputLabel} size="small" autoFocus />
                    )}
                    noOptionsText="Enginn eigandi fannst"
                />
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" sx={primaryButtonSx}
                    disabled={!selected || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function BankAccountDialog({ open, onClose, userId, assocParam, accountingKeys, onCreated }) {
    const [name, setName] = React.useState('');
    const [accountNumber, setAccountNumber] = React.useState('');
    const [assetAccountId, setAssetAccountId] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (!open) {
            setName('');
            setAccountNumber('');
            setAssetAccountId('');
            setDescription('');
            setError('');
            setSaving(false);
        }
    }, [open]);

    const isValid = name.trim() && accountNumber.trim();

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: name.trim(),
                    account_number: accountNumber.trim(),
                    asset_account_id: assetAccountId || null,
                    description: description.trim(),
                }),
            });
            if (resp.ok) {
                onClose();
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
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ pb: 0.5 }}>
                Nýr bankareikningur
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
                    Tengdu bankareikning við húsfélagið
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label="Heiti reiknings" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
                <TextField
                    label="Reikningsnúmer" value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                    size="small" fullWidth placeholder="0101-26-123456"
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>Bókhaldslykill (EIGN)</InputLabel>
                    <Select
                        value={assetAccountId}
                        label="Bókhaldslykill (EIGN)"
                        onChange={e => setAssetAccountId(e.target.value)}
                    >
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {accountingKeys.map(k => (
                            <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <TextField
                    label="Lýsing (valfrjálst)" value={description}
                    onChange={e => setDescription(e.target.value)}
                    size="small" fullWidth
                />
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

function BankAccountsPanel({ user, assocParam }) {
    const [bankAccounts, setBankAccounts] = React.useState(undefined);
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);

    React.useEffect(() => {
        loadBankAccounts();
        fetch(`${API_URL}/AccountingKey/list`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setAccountingKeys(data.filter(k => k.type === 'ASSET')))
            .catch(() => {});
    }, [assocParam]);

    const loadBankAccounts = async () => {
        try {
            const resp = await fetch(`${API_URL}/BankAccount/${user.id}${assocParam}`);
            if (resp.ok) setBankAccounts(await resp.json());
            else { setError('Villa við að sækja bankareikninga.'); setBankAccounts([]); }
        } catch {
            setError('Tenging við þjón mistókst.');
            setBankAccounts([]);
        }
    };

    if (bankAccounts === undefined) {
        return (
            <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Bankareikningar</Typography>
                <Button
                    variant="contained" sx={primaryButtonSx}
                    onClick={() => setShowForm(true)}
                >
                    + Bæta við reikning
                </Button>
            </Box>

            <BankAccountDialog
                open={showForm}
                onClose={() => setShowForm(false)}
                userId={user.id}
                assocParam={assocParam}
                accountingKeys={accountingKeys}
                onCreated={loadBankAccounts}
            />

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

            {bankAccounts.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Enginn bankareikningur skráður.</Typography>
            ) : (
                <Paper variant="outlined" sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead sx={HEAD_SX}>
                            <TableRow>
                                <TableCell sx={HEAD_CELL_SX}>Heiti</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Reikningsnúmer</TableCell>
                                <TableCell sx={HEAD_CELL_SX}>Bókhaldslykill</TableCell>
                                <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>Staða</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {bankAccounts.map(b => (
                                <BankAccountRow
                                    key={b.id}
                                    bankAccount={b}
                                    userId={user.id}
                                    assocParam={assocParam}
                                    accountingKeys={accountingKeys}
                                    onSaved={loadBankAccounts}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
        </Paper>
    );
}

function BankAccountRow({ bankAccount, userId, assocParam, accountingKeys, onSaved }) {
    const [editOpen, setEditOpen] = React.useState(false);
    return (
        <>
            <TableRow hover>
                <TableCell>{bankAccount.name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{bankAccount.account_number}</TableCell>
                <TableCell>
                    {bankAccount.asset_account
                        ? <LabelChip label={`${bankAccount.asset_account.number} · ${bankAccount.asset_account.name}`} />
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {bankAccount.current_balance != null
                        ? fmtAmount(bankAccount.current_balance)
                        : <Typography variant="body2" color="text.disabled">—</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title="Breyta">
                        <IconButton size="small" onClick={() => setEditOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
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
}

function BankAccountEditDialog({ open, onClose, bankAccount, userId, assocParam, accountingKeys, onSaved }) {
    const [name, setName] = React.useState(bankAccount.name);
    const [accountNumber, setAccountNumber] = React.useState(bankAccount.account_number);
    const [assetAccountId, setAssetAccountId] = React.useState(bankAccount.asset_account?.id || '');
    const [description, setDescription] = React.useState(bankAccount.description || '');
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (open) {
            setName(bankAccount.name);
            setAccountNumber(bankAccount.account_number);
            setAssetAccountId(bankAccount.asset_account?.id || '');
            setDescription(bankAccount.description || '');
            setError('');
        }
    }, [open, bankAccount]);

    const isValid = name.trim() && accountNumber.trim();

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount/update/${bankAccount.id}${assocParam}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: name.trim(),
                    account_number: accountNumber.trim(),
                    asset_account_id: assetAccountId || null,
                    description: description.trim(),
                }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við uppfærslu.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const resp = await fetch(`${API_URL}/BankAccount/delete/${bankAccount.id}${assocParam}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            if (resp.ok) { setConfirmDelete(false); onSaved(); }
            else { const data = await resp.json(); setError(data.detail || 'Villa.'); setConfirmDelete(false); }
        } catch {
            setError('Tenging við þjón mistókst.'); setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
                <DialogTitle>Breyta bankareikningi</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField label="Heiti reiknings" value={name} onChange={e => setName(e.target.value)} size="small" fullWidth />
                    <TextField
                        label="Reikningsnúmer" value={accountNumber}
                        onChange={e => setAccountNumber(e.target.value)}
                        size="small" fullWidth
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Bókhaldslykill (EIGN)</InputLabel>
                        <Select
                            value={assetAccountId}
                            label="Bókhaldslykill (EIGN)"
                            onChange={e => setAssetAccountId(e.target.value)}
                        >
                            <MenuItem value=""><em>Enginn</em></MenuItem>
                            {accountingKeys.map(k => (
                                <MenuItem key={k.id} value={k.id}>{k.number} · {k.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="Lýsing (valfrjálst)" value={description}
                        onChange={e => setDescription(e.target.value)}
                        size="small" fullWidth
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
                    <Button sx={destructiveButtonSx} onClick={() => setConfirmDelete(true)}>
                        Eyða reikningi
                    </Button>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button sx={ghostButtonSx} onClick={onClose}>Hætta við</Button>
                        <Button
                            variant="contained" sx={primaryButtonSx}
                            disabled={!isValid || saving} onClick={handleSave}
                        >
                            {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs">
                <DialogTitle>Eyða bankareikningi?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Bankareikningurinn verður fjarlægður. Færslur tengdar reikningnum haldast.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button sx={ghostButtonSx} onClick={() => setConfirmDelete(false)}>Hætta við</Button>
                    <Button sx={destructiveButtonSx} onClick={handleDelete} disabled={deleting}>
                        {deleting ? <CircularProgress size={18} color="inherit" /> : 'Eyða'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function AssociationRulesPanel({ user, assocParam }) {
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

    React.useEffect(() => { load(); }, [assocParam]);

    const load = () => {
        if (!user?.id) return;
        setLoading(true);
        Promise.all([
            fetch(`${API_URL}/CategoryRule/${user.id}${assocParam}`).then(r => r.ok ? r.json() : null),
            fetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : []),
        ]).then(([rulesData, cats]) => {
            if (rulesData) setRules(rulesData.association_rules || []);
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
                ? await fetch(`${API_URL}/CategoryRule/update/${editRule.id}${assocParam}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId }),
                })
                : await fetch(`${API_URL}/CategoryRule${assocParam}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId, is_global: false }),
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
            const resp = await fetch(`${API_URL}/CategoryRule/delete/${deleteRule.id}${assocParam}`, {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) { setDeleteRule(null); load(); }
        } catch {}
        finally { setDeleting(false); }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Flokkunarreglur</Typography>
                <Button variant="contained" sx={primaryButtonSx} onClick={openCreate}>
                    + Ný regla
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
                        <Typography color="text.secondary">Engar reglur skráðar.</Typography>
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
                <DialogTitle>{editRule ? 'Breyta reglu' : 'Ný regla'}</DialogTitle>
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

export default AssociationPage;
