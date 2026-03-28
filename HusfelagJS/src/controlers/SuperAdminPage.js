import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Divider, Paper, TextField, Button,
    CircularProgress, Alert, Grid,
    Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtKennitala } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

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

export default SuperAdminPage;
