import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Divider, Paper, Grid,
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, Button, Alert, Autocomplete, TextField,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import HouseAssociationForm from './HouseAssociation';
import { fmtAmount, fmtKennitala } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function AssociationPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [association, setAssociation] = useState(undefined);
    const [owners, setOwners] = useState([]);
    const [budgetTotal, setBudgetTotal] = useState(null);
    const [monthlyTotal, setMonthlyTotal] = useState(null);
    const [error, setError] = useState('');
    const [roleDialog, setRoleDialog] = useState(null);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user]);

    const loadAll = async () => {
        try {
            const [assocResp, ownersResp, budgetResp, collectionResp] = await Promise.all([
                fetch(`${API_URL}/Association/${user.id}${assocParam}`),
                fetch(`${API_URL}/Owner/${user.id}${assocParam}`),
                fetch(`${API_URL}/Budget/${user.id}${assocParam}`),
                fetch(`${API_URL}/Collection/${user.id}${assocParam}`),
            ]);

            if (assocResp.ok) setAssociation(await assocResp.json());
            else { setError('Villa við að sækja húsfélag.'); setAssociation(null); }

            if (ownersResp.ok) {
                const all = await ownersResp.json();
                const seen = new Set();
                setOwners(all.filter(o => !o.deleted && !seen.has(o.user_id) && seen.add(o.user_id)));
            }

            if (budgetResp.ok) {
                const budget = await budgetResp.json();
                if (budget?.items) {
                    setBudgetTotal(budget.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0));
                }
            }

            if (collectionResp.ok) {
                const col = await collectionResp.json();
                if (col?.rows) {
                    setMonthlyTotal(col.rows.reduce((s, r) => s + parseFloat(r.monthly || 0), 0));
                }
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
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                {/* Header */}
                <Typography variant="h5" gutterBottom sx={{ mb: 0.5 }}>
                    {association.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {subtitle}
                </Typography>
                <Divider sx={{ mb: 3 }} />

                {/* Row 1: association stats */}
                <Grid container spacing={2} sx={{ alignItems: 'stretch', mb: 2 }}>
                    <KpiCard label="Íbúðir skráðar" value={association.apartment_count} />
                    <KpiCard label="Eigendur skráðir" value={association.owner_count} />
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

                {/* Row 2: financials */}
                <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
                    <KpiCard
                        label={`Áætlun ${new Date().getFullYear()}`}
                        value={budgetTotal !== null ? fmtAmount(budgetTotal) : '—'}
                        small
                    />
                    <KpiCard
                        label="Mánaðarleg innheimta"
                        value={monthlyTotal !== null ? fmtAmount(monthlyTotal) : '—'}
                        small
                    />
                </Grid>

                {error && <Typography color="error" sx={{ mt: 3 }}>{error}</Typography>}
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

function KpiCard({ label, value, small }) {
    return (
        <Grid item xs={12} sm={6} md={3} lg={2} sx={{ display: 'flex' }}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 110 }}>
                <Typography
                    variant={small ? 'h6' : 'h4'}
                    color="secondary.main"
                    sx={{ fontWeight: small ? 400 : 300, lineHeight: 1.2 }}
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
                <Button onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={!selected || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default AssociationPage;
