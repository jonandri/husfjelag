import { useState } from 'react';
import {
    Box, Button, TextField, Typography, CircularProgress, Alert, Divider, Chip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { fmtKennitala } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function HouseAssociationForm({ onCreated } = {}) {
    const navigate = useNavigate();

    const [ssn, setSsn] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null);  // verify response
    const [saving, setSaving] = useState(false);

    const ssnError = ssn.length > 0 && ssn.length < 10
        ? 'Kennitala verður að vera 10 tölustafir'
        : '';

    const handleVerify = async () => {
        setError('');
        setPreview(null);
        setLoading(true);
        try {
            const resp = await apiFetch(
                `${API_URL}/Association/verify?ssn=${ssn}`
            );
            const data = await resp.json();
            if (resp.status === 409) {
                setError(data.detail || 'Þetta húsfélag er þegar skráð í kerfið.');
            } else if (resp.status === 502) {
                setError('Ekki tókst að ná sambandi við Skattur Cloud. Reyndu aftur síðar.');
            } else if (!resp.ok) {
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

    const handleCreate = async () => {
        setSaving(true);
        setError('');
        try {
            const resp = await apiFetch(`${API_URL}/Association`, {
                method: 'POST',
                body: JSON.stringify({ ssn }),
            });
            if (resp.ok) {
                if (onCreated) { onCreated(); } else { navigate('/dashboard'); }
            } else {
                const data = await resp.json();
                if (resp.status === 403) {
                    setError('Þú hefur ekki heimild til að stofna þetta félag (Prókúruhafi ekki staðfestur).');
                } else if (resp.status === 409) {
                    setError(data.detail || 'Þetta húsfélag er þegar skráð í kerfið.');
                } else if (resp.status === 502) {
                    setError('Ekki tókst að ná sambandi við Skattur Cloud. Reyndu aftur síðar.');
                } else {
                    setError(data.detail || 'Villa við skráningu.');
                }
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <Box sx={{ width: 500, border: '1px solid #ccc', borderRadius: 2, p: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={120} style={{ alignSelf: 'center' }} />
                <Typography variant="h5" textAlign="center">Skrá húsfélag</Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                    Sláðu inn kennitölu húsfélagsins til að staðfesta umboð
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
                            onClick={handleVerify}
                            sx={{ color: '#fff' }}
                        >
                            {loading ? <CircularProgress size={22} color="inherit" /> : 'Fletta upp'}
                        </Button>
                    </>
                )}

                {preview && (
                    <>
                        <Divider />

                        {/* Association details */}
                        <Box sx={{ bgcolor: '#f5f5f5', borderRadius: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography><strong>Nafn:</strong> {preview.name}</Typography>
                            <Typography><strong>Kennitala:</strong> {fmtKennitala(preview.ssn)}</Typography>
                            <Typography><strong>Heimilisfang:</strong> {preview.address}</Typography>
                            <Typography><strong>Póstnúmer / Borg:</strong> {preview.postal_code} {preview.city}</Typography>
                            {preview.status && (
                                <Typography><strong>Staða:</strong> {preview.status}</Typography>
                            )}
                            {preview.registered && (
                                <Typography><strong>Skráð:</strong> {preview.registered}</Typography>
                            )}
                            {preview.date_of_board_change && (
                                <Typography><strong>Breyting stjórnar:</strong> {preview.date_of_board_change}</Typography>
                            )}
                        </Box>

                        {/* Power of attorney holders */}
                        {preview.prokuruhafar && preview.prokuruhafar.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                                    Prókúruhafar (umboðsmenn):
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {preview.prokuruhafar.map(p => (
                                        <Typography key={p.national_id} variant="body2">
                                            {p.name} — {fmtKennitala(p.national_id)}
                                        </Typography>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {/* Authorization status chip */}
                        {preview.authorized ? (
                            <Chip
                                icon={<CheckCircleOutlineIcon />}
                                label="Þú ert prókúruhafi — heimild staðfest"
                                color="success"
                                variant="outlined"
                                sx={{ alignSelf: 'flex-start' }}
                            />
                        ) : (
                            <Alert severity="error" icon={<CancelOutlinedIcon />}>
                                Þú ert ekki prókúruhafi fyrir þetta félag og getur því ekki skráð það.
                            </Alert>
                        )}

                        {error && <Alert severity="error">{error}</Alert>}

                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="outlined"
                                fullWidth
                                onClick={() => { setPreview(null); setError(''); setSsn(''); }}
                            >
                                Til baka
                            </Button>
                            {preview.authorized && (
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    fullWidth
                                    disabled={saving}
                                    onClick={handleCreate}
                                    sx={{ color: '#fff' }}
                                >
                                    {saving ? <CircularProgress size={22} color="inherit" /> : 'Stofna húsfélag'}
                                </Button>
                            )}
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}

export default HouseAssociationForm;
