import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    Button, TextField, Collapse, Chip, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Alert, Divider, Tooltip, DialogContentText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function ApartmentsPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);
    const [apartments, setApartments] = useState(undefined);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadApartments();
    }, [user]);

    const loadApartments = async () => {
        try {
            const resp = await fetch(`${API_URL}/Apartment/${user.id}`);
            if (resp.ok) {
                setApartments(await resp.json());
            } else {
                setError('Villa við að sækja íbúðir.');
                setApartments([]);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setApartments([]);
        }
    };

    if (apartments === undefined) {
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
            <Box sx={{ p: 4, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Íbúðir</Typography>
                    <Button
                        variant="contained"
                        color="secondary"
                        sx={{ color: '#fff' }}
                        onClick={() => setShowForm(v => !v)}
                    >
                        {showForm ? 'Loka skráningarformi' : '+ Bæta við íbúð'}
                    </Button>
                </Box>

                <Collapse in={showForm}>
                    <AddApartmentForm
                        userId={user.id}
                        apartments={apartments}
                        onCreated={(updated) => { setShowForm(false); setApartments(updated); }}
                    />
                </Collapse>

                {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

                {apartments.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4 }}>
                        Engar íbúðir skráðar. Smelltu á „+ Bæta við íbúð" til að hefja skráningu.
                    </Typography>
                ) : (
                    <Paper variant="outlined" sx={{ mt: 2 }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Merking</TableCell>
                                    <TableCell>Fastanúmer</TableCell>
                                    <TableCell>Matshlutfall (%)</TableCell>
                                    <TableCell>Matshlutfall hita (%)</TableCell>
                                    <TableCell>Matshlutfall lóðar (%)</TableCell>
                                    <TableCell>Jafnt hlutfall (%)</TableCell>
                                    <TableCell>Eigendur</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {apartments.map((apt) => (
                                    <ApartmentRow
                                        key={apt.id}
                                        apt={apt}
                                        apartments={apartments}
                                        onOwnersChanged={loadApartments}
                                        onSaved={loadApartments}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                )}
            </Box>
        </div>
    );
}

function ShareField({ label, value, onChange, helperText, error }) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
            size="small"
            type="number"
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            helperText={helperText}
            error={!!error}
            FormHelperTextProps={{ sx: { whiteSpace: 'normal' } }}
            fullWidth
        />
    );
}

function AddApartmentForm({ userId, apartments, onCreated }) {
    const [anr, setAnr] = useState('');
    const [fnr, setFnr] = useState('');
    const [share, setShare] = useState('');
    const [share2, setShare2] = useState('');
    const [share3, setShare3] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const n = apartments.length + 1;
    const shareEqPreview = (100 / n).toFixed(2);

    const existingShare = apartments.reduce((s, a) => s + parseFloat(a.share || 0), 0);
    const existingShare2 = apartments.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const existingShare3 = apartments.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const shareOver = parseFloat(share) > 0 && existingShare + parseFloat(share) > 100;
    const share2Over = parseFloat(share2) > 0 && existingShare2 + parseFloat(share2) > 100;
    const share3Over = parseFloat(share3) > 0 && existingShare3 + parseFloat(share3) > 100;

    const isValid = anr.trim() && fnr.trim() && parseFloat(share) >= 0 && parseFloat(share2) >= 0 && parseFloat(share3) >= 0 && !shareOver && !share2Over && !share3Over;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    anr,
                    fnr,
                    share: parseFloat(share) || 0,
                    share_2: parseFloat(share2) || 0,
                    share_3: parseFloat(share3) || 0,
                }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                setAnr(''); setFnr(''); setShare(''); setShare2(''); setShare3('');
                onCreated(updated);
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
        <Paper variant="outlined" sx={{ p: 3, mb: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600 }}>
            <Typography variant="subtitle1">Skrá nýja íbúð</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth />
            </Box>
            <ShareField
                label="Matshlutfall (%)"
                value={share}
                onChange={setShare}
                helperText="Matshluti hverrar íbúðar skv. eignaskiptasamningi"
                error={shareOver ? 'Heildarhlutfall fer yfir 100%' : ''}
            />
            {shareOver && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share) myndi fara yfir 100%</Alert>}
            <ShareField
                label="Matshlutfall hita (%)"
                value={share2}
                onChange={setShare2}
                helperText="Matshluti hita í sameign skv. eignaskiptasamningi"
                error={share2Over ? 'Heildarhlutfall fer yfir 100%' : ''}
            />
            {share2Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 2) myndi fara yfir 100%</Alert>}
            <ShareField
                label="Matshlutfall lóðar (%)"
                value={share3}
                onChange={setShare3}
                helperText="Matshluti lóðar skv. eignaskiptasamningi"
                error={share3Over ? 'Heildarhlutfall fer yfir 100%' : ''}
            />
            {share3Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 3) myndi fara yfir 100%</Alert>}
            <TextField
                label="Hlutfall í jafnskiptum kostnaði (%)"
                value={shareEqPreview}
                size="small"
                disabled
                helperText="Hlutfall í jafnskiptum kostnaði s.s. rafmagn í sameign"
                FormHelperTextProps={{ sx: { whiteSpace: 'normal' } }}
                fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista íbúð'}
            </Button>
        </Paper>
    );
}

function ApartmentRow({ apt, apartments, onOwnersChanged, onSaved }) {
    const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);

    return (
        <>
            <TableRow hover>
                <TableCell>{apt.anr}</TableCell>
                <TableCell>{apt.fnr}</TableCell>
                <TableCell>{apt.share}%</TableCell>
                <TableCell>{apt.share_2}%</TableCell>
                <TableCell>{apt.share_3}%</TableCell>
                <TableCell>{apt.share_eq}%</TableCell>
                <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {apt.owners.map(o => (
                            <Chip key={o.id} label={o.name} size="small" />
                        ))}
                        <Chip
                            label="+ Eigandi"
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onClick={() => setOwnerDialogOpen(true)}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Box>
                </TableCell>
                <TableCell align="right" sx={{ width: 48 }}>
                    <Tooltip title="Breyta">
                        <IconButton size="small" onClick={() => setEditDialogOpen(true)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>

            <OwnerDialog
                open={ownerDialogOpen}
                onClose={() => setOwnerDialogOpen(false)}
                apt={apt}
                onChanged={() => { setOwnerDialogOpen(false); onOwnersChanged(); }}
            />
            <EditApartmentDialog
                open={editDialogOpen}
                onClose={() => setEditDialogOpen(false)}
                apt={apt}
                apartments={apartments}
                onSaved={() => { setEditDialogOpen(false); onSaved(); }}
                onDeleted={() => { setEditDialogOpen(false); onSaved(); }}
            />
        </>
    );
}

function EditApartmentDialog({ open, onClose, apt, apartments, onSaved, onDeleted }) {
    const [anr, setAnr] = useState(apt.anr);
    const [fnr, setFnr] = useState(apt.fnr);
    const [share, setShare] = useState(String(apt.share));
    const [share2, setShare2] = useState(String(apt.share_2));
    const [share3, setShare3] = useState(String(apt.share_3));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) {
            setAnr(apt.anr); setFnr(apt.fnr);
            setShare(String(apt.share)); setShare2(String(apt.share_2)); setShare3(String(apt.share_3));
            setError('');
        }
    }, [open, apt]);

    const others = apartments.filter(a => a.id !== apt.id);
    const otherShare = others.reduce((s, a) => s + parseFloat(a.share || 0), 0);
    const otherShare2 = others.reduce((s, a) => s + parseFloat(a.share_2 || 0), 0);
    const otherShare3 = others.reduce((s, a) => s + parseFloat(a.share_3 || 0), 0);
    const shareOver = parseFloat(share) >= 0 && otherShare + parseFloat(share) > 100;
    const share2Over = parseFloat(share2) >= 0 && otherShare2 + parseFloat(share2) > 100;
    const share3Over = parseFloat(share3) >= 0 && otherShare3 + parseFloat(share3) > 100;

    const isValid = anr.trim() && fnr.trim() && parseFloat(share) >= 0 && parseFloat(share2) >= 0 && parseFloat(share3) >= 0 && !shareOver && !share2Over && !share3Over;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/update/${apt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anr, fnr, share: parseFloat(share) || 0, share_2: parseFloat(share2) || 0, share_3: parseFloat(share3) || 0 }),
            });
            if (resp.ok) {
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

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/delete/${apt.id}`, { method: 'DELETE' });
            if (resp.ok) {
                setConfirmDelete(false);
                onDeleted();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við eyðingu.');
                setConfirmDelete(false);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Breyta íbúð — {apt.anr}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <TextField label="Merking" value={anr} onChange={e => setAnr(e.target.value)} size="small" fullWidth />
                <TextField label="Fastanúmer" value={fnr} onChange={e => setFnr(e.target.value)} size="small" fullWidth />
                <ShareField
                    label="Matshlutfall (%)"
                    value={share}
                    onChange={setShare}
                    helperText="Matshluti hverrar íbúðar skv. eignaskiptasamningi"
                    error={shareOver}
                />
                {shareOver && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share) myndi fara yfir 100%</Alert>}
                <ShareField
                    label="Matshlutfall hita (%)"
                    value={share2}
                    onChange={setShare2}
                    helperText="Matshluti hita í sameign skv. eignaskiptasamningi"
                    error={share2Over}
                />
                {share2Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 2) myndi fara yfir 100%</Alert>}
                <ShareField
                    label="Matshlutfall lóðar (%)"
                    value={share3}
                    onChange={setShare3}
                    helperText="Matshluti lóðar skv. eignaskiptasamningi"
                    error={share3Over}
                />
                {share3Over && <Alert severity="error" sx={{ mt: -1 }}>Heildarhlutfall (share 3) myndi fara yfir 100%</Alert>}
                <TextField
                    label="Hlutfall í jafnskiptum kostnaði (%)"
                    value={apt.share_eq}
                    size="small"
                    disabled
                    helperText="Hlutfall í jafnskiptum kostnaði s.s. rafmagn í sameign"
                    FormHelperTextProps={{ sx: { whiteSpace: 'normal' } }}
                    fullWidth
                />
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button color="error" onClick={() => setConfirmDelete(true)}>Eyða íbúð</Button>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button onClick={onClose}>Hætta við</Button>
                    <Button
                        variant="contained" color="secondary" sx={{ color: '#fff' }}
                        disabled={!isValid || saving} onClick={handleSave}
                    >
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista breytingar'}
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>

        <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
            <DialogTitle>Eyða íbúð</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Ertu viss um að þú viljir eyða íbúð <strong>{apt.anr}</strong>? Þetta má ekki afturkalla.
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setConfirmDelete(false)}>Hætta við</Button>
                <Button color="error" variant="contained" disabled={deleting} onClick={handleDelete}>
                    {deleting ? <CircularProgress size={18} color="inherit" /> : 'Já, eyða'}
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
}

function OwnerDialog({ open, onClose, apt, onChanged }) {
    const [kennitala, setKennitala] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleAdd = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Apartment/${apt.id}/owner`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kennitala }),
            });
            if (resp.ok) {
                setKennitala('');
                onChanged();
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

    const handleRemove = async (ownerId) => {
        try {
            await fetch(`${API_URL}/Apartment/${apt.id}/owner/${ownerId}`, { method: 'DELETE' });
            onChanged();
        } catch { /* ignore */ }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Eigendur — {apt.anr}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                {apt.owners.length === 0 ? (
                    <Typography color="text.secondary" variant="body2">Enginn eigandi skráður.</Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {apt.owners.map(o => (
                            <Box key={o.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="body2" fontWeight={500}>{o.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{o.kennitala}</Typography>
                                </Box>
                                <Button size="small" color="error" onClick={() => handleRemove(o.id)}>Fjarlægja</Button>
                            </Box>
                        ))}
                    </Box>
                )}
                <Divider />
                <Typography variant="subtitle2">Bæta við eiganda</Typography>
                <TextField
                    label="Kennitala eiganda"
                    value={kennitala}
                    onChange={e => setKennitala(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                    helperText={`${kennitala.length}/10`}
                    size="small"
                    fullWidth
                />
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Loka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={kennitala.length !== 10 || saving} onClick={handleAdd}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Skrá eiganda'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ApartmentsPage;
