import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, Alert, CircularProgress,
} from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

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

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneValid = phoneDigits.length === 7;
    const isValid = emailValid && phoneValid;

    const handlePhoneChange = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 7);
        const formatted = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
        setPhone(formatted);
    };

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/User/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), phone: phone.trim() }),
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
                    error={email.length > 0 && !emailValid}
                    helperText={email.length > 0 && !emailValid ? 'Netfang er ekki gilt' : ''}
                />
                <TextField
                    label="Símanúmer"
                    value={phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    size="small"
                    fullWidth
                    inputProps={{ inputMode: 'tel', placeholder: '000 0000' }}
                    error={phone.length > 0 && !phoneValid}
                    helperText={phone.length > 0 && !phoneValid ? 'Símanúmer verður að vera 7 tölustafir' : ''}
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
            </Paper>
        </Box>
    );
}

export default ProfilePage;
