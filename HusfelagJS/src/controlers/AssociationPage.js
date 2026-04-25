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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import RuleIcon from '@mui/icons-material/Rule';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import HouseAssociationForm from './HouseAssociation';
import { fmtKennitala, fmtAmount } from '../format';
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx, destructiveButtonSx } from '../ui/buttons';
import { LabelChip } from '../ui/chips';
import { HEAD_SX, HEAD_CELL_SX } from './tableUtils';
import { useHelp } from '../ui/HelpContext';
import Eyebrow from '../ui/Eyebrow';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function AssociationPage() {
    const navigate = useNavigate();
    const { user, assocParam, currentAssociation } = React.useContext(UserContext);
    const { openHelp } = useHelp();
    const [association, setAssociation] = useState(undefined);
    const [owners, setOwners] = useState([]);
    const [error, setError] = useState('');
    const [roleDialog, setRoleDialog] = useState(null);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [rules, setRules] = useState([]);
    const [collections, setCollections] = useState([]);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam]);

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

    if (!isSetup) {
        return <UppsetningView
            association={association}
            setupSteps={setupSteps}
            setupComplete={setupComplete}
            owners={owners}
            onNavigate={(path) => navigate(path)}
        />;
    }

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
                                        { name: association.chair, role: 'Formaður', initBg: '#e8f5e9', initColor: '#2e7d32' },
                                        { name: association.cfo,   role: 'Gjaldkeri', initBg: '#eef1f8', initColor: NAVY },
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
                                        { value: association.owner_count != null ? association.owner_count : owners.length, label: 'Eigendur' },
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
            const resp = await apiFetch(`${API_URL}/Association/roles/${userId}${assocParam}`, {
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
            const resp = await apiFetch(`${API_URL}/BankAccount${assocParam}`, {
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

function BankAccountsPanel({ user, assocParam, currentAssociation, bankAccounts, onReload }) {
    const navigate = useNavigate();
    const [accountingKeys, setAccountingKeys] = React.useState([]);
    const [error, setError] = React.useState('');
    const [showForm, setShowForm] = React.useState(false);

    const canManageBank = ['Formaður', 'Gjaldkeri', 'Kerfisstjóri'].includes(currentAssociation?.role);

    React.useEffect(() => {
        apiFetch(`${API_URL}/AccountingKey/list`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setAccountingKeys(data.filter(k => k.type === 'ASSET')))
            .catch(() => {});
    }, [assocParam]);

    return (
        <Paper variant="outlined" sx={{ p: 3, mt: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Bankareikningar</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {canManageBank && (
                        <Button
                            variant="outlined" sx={secondaryButtonSx}
                            onClick={() => navigate('/bank-settings')}
                        >
                            Tengja banka
                        </Button>
                    )}
                    <Button
                        variant="contained" sx={primaryButtonSx}
                        onClick={() => setShowForm(true)}
                    >
                        + Bæta við reikning
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
                                    onSaved={onReload}
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
            const resp = await apiFetch(`${API_URL}/BankAccount/update/${bankAccount.id}${assocParam}`, {
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
            const resp = await apiFetch(`${API_URL}/BankAccount/delete/${bankAccount.id}${assocParam}`, {
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

function AssociationRulesPanel({ user, assocParam, rules, onReload }) {
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

    React.useEffect(() => {
        setLoading(true);
        apiFetch(`${API_URL}/Category/list`)
            .then(r => r.ok ? r.json() : [])
            .then(cats => setCategories(cats || []))
            .catch(() => setError('Gat ekki sótt flokka.'))
            .finally(() => setLoading(false));
    }, [assocParam]);

    const openCreate = () => { setEditRule(null); setKeyword(''); setCategoryId(''); setSaveError(''); setDialogOpen(true); };
    const openEdit = (rule) => { setEditRule(rule); setKeyword(rule.keyword); setCategoryId(rule.category.id); setSaveError(''); setDialogOpen(true); };

    const handleSave = async () => {
        if (!keyword.trim() || !categoryId) { setSaveError('Lykilorð og flokkur eru nauðsynleg.'); return; }
        setSaving(true); setSaveError('');
        try {
            const resp = editRule
                ? await apiFetch(`${API_URL}/CategoryRule/update/${editRule.id}${assocParam}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId }),
                })
                : await apiFetch(`${API_URL}/CategoryRule${assocParam}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId, is_global: false }),
                });
            if (resp.ok) { setDialogOpen(false); onReload(); }
            else { const data = await resp.json(); setSaveError(data.detail || 'Villa við vistun.'); }
        } catch { setSaveError('Tenging við þjón mistókst.'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteRule) return;
        setDeleting(true);
        try {
            const resp = await apiFetch(`${API_URL}/CategoryRule/delete/${deleteRule.id}${assocParam}`, {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) { setDeleteRule(null); onReload(); }
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

// Design tokens (file-level, reused across components)
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

export default AssociationPage;
