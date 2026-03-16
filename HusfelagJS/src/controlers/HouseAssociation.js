import React, { useState } from 'react';
import { Box, Button, TextField, Typography, CircularProgress, Alert, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function HouseAssociationForm({ onCreated } = {}) {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    const [ssn, setSsn] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);   // scraped data awaiting confirmation
    const [saving, setSaving] = useState(false);

    const ssnError = ssn.length > 0 && ssn.length < 10
        ? 'Kennitala verður að vera 10 tölustafir'
        : '';

    const handleLookup = async () => {
        setError('');
        setPreview(null);
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/Association/lookup?ssn=${ssn}`);
            const data = await resp.json();
            if (!resp.ok) {
                setError(data.detail || 'Villa við leit.');
            } else {
                setPreview(data);
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setSaving(true);
        setError('');
        try {
            const resp = await fetch(`${API_URL}/Association`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...preview, user_id: user.id }),
            });
            if (resp.ok) {
                if (onCreated) { onCreated(); } else { navigate('/dashboard'); }
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
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <Box sx={{ width: 460, border: '1px solid #ccc', borderRadius: 2, p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={120} style={{ alignSelf: 'center' }} />
                <Typography variant="h5" textAlign="center">Skrá húsfélag</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                    Sláðu inn kennitölu húsfélagsins til að fletta upp upplýsingum
                </Typography>

                {!preview && (
                    <>
                        <TextField
                            label="Kennitala húsfélagsins"
                            value={ssn}
                            onChange={e => setSsn(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                            error={!!ssnError}
                            helperText={ssnError || `${ssn.length}/10`}
                            fullWidth
                        />
                        {error && <Alert severity="error">{error}</Alert>}
                        <Button
                            variant="contained"
                            color="secondary"
                            size="large"
                            disabled={ssn.length !== 10 || loading}
                            onClick={handleLookup}
                            sx={{ color: '#fff' }}
                        >
                            {loading ? <CircularProgress size={22} color="inherit" /> : 'Fletta upp'}
                        </Button>
                    </>
                )}

                {preview && (
                    <>
                        <Divider />
                        <Typography variant="subtitle1" fontWeight="bold">Staðfestið upplýsingarnar:</Typography>
                        <Box sx={{ bgcolor: '#f5f5f5', borderRadius: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography><strong>Nafn:</strong> {preview.name}</Typography>
                            <Typography><strong>Kennitala:</strong> {preview.ssn}</Typography>
                            <Typography><strong>Heimilisfang:</strong> {preview.address}</Typography>
                            <Typography><strong>Póstnúmer:</strong> {preview.postal_code}</Typography>
                            <Typography><strong>Borg:</strong> {preview.city}</Typography>
                        </Box>
                        {error && <Alert severity="error">{error}</Alert>}
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant="outlined" fullWidth onClick={() => { setPreview(null); setError(''); }}>
                                Til baka
                            </Button>
                            <Button
                                variant="contained"
                                color="secondary"
                                fullWidth
                                disabled={saving}
                                onClick={handleConfirm}
                                sx={{ color: '#fff' }}
                            >
                                {saving ? <CircularProgress size={22} color="inherit" /> : 'Staðfesta og skrá'}
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}

export default HouseAssociationForm;
