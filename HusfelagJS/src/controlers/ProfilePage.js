import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, Alert, CircularProgress,
} from '@mui/material';
import { UserContext } from './UserContext';
import { fmtPhone } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function ProfilePage() {
    const navigate = useNavigate();
    const { user, setUser } = React.useContext(UserContext);

    const [email, setEmail] = useState(user?.email || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!user) {
        navigate('/login');
        return null;
    }

    const isValid = email.trim().length > 3 && email.includes('@') && phone.trim().length >= 7;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/User/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), phone: fmtPhone(phone) }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                const newUser = { ...user, ...updated };
                localStorage.setItem('user', JSON.stringify(newUser));
                setUser(newUser);
                navigate('/dashboard');
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Paper variant="outlined" sx={{ p: 4, maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box>
                    <Typography variant="h5" gutterBottom>Velkomin/n, {user.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Til að halda áfram þarftu að skrá netfang og símanúmer á þinn reikning.
                    </Typography>
                </Box>
                <TextField
                    label="Netfang"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    size="small"
                    fullWidth
                    autoFocus
                />
                <TextField
                    label="Símanúmer"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                    size="small"
                    fullWidth
                    inputProps={{ inputMode: 'tel' }}
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Button
                    variant="contained"
                    color="secondary"
                    sx={{ color: '#fff' }}
                    disabled={!isValid || saving}
                    onClick={handleSave}
                >
                    {saving ? <CircularProgress size={20} color="inherit" /> : 'Vista og halda áfram'}
                </Button>
                <Button
                    variant="text"
                    size="small"
                    sx={{ color: 'text.disabled', textTransform: 'none', alignSelf: 'center' }}
                    onClick={() => navigate('/dashboard')}
                >
                    Sleppa í bili
                </Button>
            </Paper>
        </Box>
    );
}

export default ProfilePage;
