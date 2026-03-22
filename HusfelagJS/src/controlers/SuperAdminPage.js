import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Divider, Paper, TextField, Button,
    CircularProgress, Alert, Grid,
} from '@mui/material';
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

function CreateAssociationPanel({ user, onCreated }) {
    const navigate = useNavigate();
    const [assocSsn, setAssocSsn] = useState('');
    const [chairSsn, setChairSsn] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);

    const handleCreate = async () => {
        setError(''); setSuccess(null); setSaving(true);
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
                setSuccess(data);
                setAssocSsn(''); setChairSsn('');
            } else {
                setError(data.detail || 'Villa við stofnun.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleGoTo = () => {
        if (success) {
            onCreated(success);
            navigate('/husfelag');
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Stofna húsfélag</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Lyklar húsfélags og formanns eru sóttir sjálfkrafa.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="Kennitala húsfélags"
                    value={assocSsn}
                    onChange={e => setAssocSsn(e.target.value.replace(/[^0-9-]/g, ''))}
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
                {error && <Alert severity="error">{error}</Alert>}
                {success && (
                    <Alert severity="success" action={
                        <Button size="small" onClick={handleGoTo}>Fara á síðu</Button>
                    }>
                        {success.name} stofnað.
                    </Alert>
                )}
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={assocSsn.replace(/-/g,'').length !== 10 || chairSsn.replace(/-/g,'').length !== 10 || saving}
                    onClick={handleCreate}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Stofna'}
                </Button>
            </Box>
        </Paper>
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
