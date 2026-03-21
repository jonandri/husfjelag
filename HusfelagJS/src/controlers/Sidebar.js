import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import {
    IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Alert, CircularProgress, Typography, Box,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import { UserContext } from './UserContext';
import '../assets/styles/sidebar.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function SideBar() {
    const navigate = useNavigate();
    const theme = useTheme();
    const { user, setUser } = React.useContext(UserContext);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const liStyle = { color: theme.palette.background.text, lineHeight: '2', cursor: 'pointer', fontFamily: theme.typography.fontFamily, fontWeight: 400 };
    const iconSx = { color: theme.palette.background.text, '&:hover': { color: theme.palette.secondary.main } };

    return (
        <div className="sidebar" style={{ backgroundColor: theme.palette.background.main, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
                <div className="logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', marginTop: 20 }} onClick={() => navigate('/dashboard')}>
                    <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={150} />
                </div>
                <nav>
                    <ul style={{ margin: 0, paddingLeft: 24, paddingTop: 24 }}>
                        <li style={liStyle} onClick={() => navigate('/husfelag')}>Húsfélag</li>
                        <li style={liStyle} onClick={() => navigate('/ibudir')}>Íbúðir</li>
                        <li style={liStyle} onClick={() => navigate('/eigendur')}>Eigendur</li>
                        <li style={liStyle} onClick={() => navigate('/item1')}>Bókhaldslyklar</li>
                        <li style={liStyle} onClick={() => navigate('/item2')}>Áætlun</li>
                        <li style={liStyle} onClick={() => navigate('/item4')}>Verkefnalisti</li>
                    </ul>
                </nav>
            </div>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', p: 1, gap: 0.5 }}>
                <Tooltip title="Stillingar" placement="right">
                    <IconButton onClick={() => setSettingsOpen(true)} sx={iconSx}>
                        <AccountCircleIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Útskráning" placement="right">
                    <IconButton onClick={() => navigate('/logout')} sx={{ ...iconSx, '&:hover': { color: '#ff6b6b' } }}>
                        <LogoutIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} setUser={setUser} />
        </div>
    );
}

function UserSettingsDialog({ open, onClose, user, setUser }) {
    const [profile, setProfile] = useState(null);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open || !user?.id) return;
        setError('');

        // Use cached profile if we have name; otherwise fetch
        if (user.name) {
            setProfile(user);
            setEmail(user.email || '');
            setPhone(user.phone || '');
        } else {
            setLoading(true);
            fetch(`${API_URL}/User/${user.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        setProfile(data);
                        setEmail(data.email || '');
                        setPhone(data.phone || '');
                        // backfill context so next open is instant
                        const merged = { ...user, ...data };
                        localStorage.setItem('user', JSON.stringify(merged));
                        setUser(merged);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [open]);

    const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneValid = !phone || /^(\+\d{1,3}[\s-]?)?\d{3}[\s]?\d{4}$/.test(phone.trim());
    const isValid = emailValid && phoneValid;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/User/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), phone: phone.trim() }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                const newUser = { ...user, ...updated };
                localStorage.setItem('user', JSON.stringify(newUser));
                setUser(newUser);
                setProfile(newUser);
                onClose();
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
            <DialogTitle>Stillingar</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} color="secondary" />
                    </Box>
                ) : (
                    <>
                        <Box>
                            <Typography variant="body1" fontWeight={500}>{profile?.name}</Typography>
                            <Typography variant="body2" color="text.secondary">Kennitala: {profile?.kennitala}</Typography>
                        </Box>
                        <TextField
                            label="Netfang"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            size="small"
                            fullWidth
                            error={!!email && !emailValid}
                            helperText={!!email && !emailValid ? 'Netfang verður að innihalda @ og lén (t.d. jon@husfelag.is)' : ''}
                        />
                        <TextField
                            label="Símanúmer"
                            value={phone}
                            onChange={e => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                            size="small"
                            fullWidth
                            inputProps={{ inputMode: 'tel' }}
                            error={!!phone && !phoneValid}
                            helperText={!!phone && !phoneValid ? 'Símanúmer: 7 tölustafir (t.d. 555 1234 eða +354 555 1234)' : ''}
                        />
                        {error && <Alert severity="error">{error}</Alert>}
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Loka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={loading || !isValid || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default SideBar;
