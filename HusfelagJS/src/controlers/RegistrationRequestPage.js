import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, Alert, CircularProgress,
} from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function RegistrationRequestPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    const [assocSsn, setAssocSsn] = useState('');
    const [assocName, setAssocName] = useState('');
    const [chairSsn, setChairSsn] = useState('');
    const [chairName, setChairName] = useState('');
    const [chairEmail, setChairEmail] = useState('');
    const [chairPhone, setChairPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);

    if (!user) return <Navigate to="/login" replace />;

    const fmtSsn = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 10);
        return digits.length > 6 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits;
    };

    const handlePhoneChange = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 7);
        setChairPhone(digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits);
    };

    const ssnDigits = (s) => s.replace(/\D/g, '');

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chairEmail.trim());
    const phoneValid = ssnDigits(chairPhone).length === 7;
    const isValid =
        ssnDigits(assocSsn).length === 10 &&
        assocName.trim().length > 0 &&
        ssnDigits(chairSsn).length === 10 &&
        chairName.trim().length > 0 &&
        emailValid &&
        phoneValid;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/RegistrationRequest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assoc_ssn: ssnDigits(assocSsn),
                    assoc_name: assocName.trim(),
                    chair_ssn: ssnDigits(chairSsn),
                    chair_name: chairName.trim(),
                    chair_email: chairEmail.trim(),
                    chair_phone: chairPhone.replace(/\D/g, ''),
                }),
            });
            if (resp.ok) {
                setSubmitted(true);
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við sendingu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    if (submitted) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
                <Paper variant="outlined" sx={{ p: 4, maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'center', alignItems: 'center' }}>
                    <img src={require('../assets/images/logo/logo-no-background-blue.png')} alt="Húsfélag" style={{ width: 200 }} />
                    <Typography variant="h5">Beiðni móttekin</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Umsóknin þín um skráningu húsfélags hefur verið móttekin. Við munum fara yfir hana og hafa samband mjög fljótlega.
                        Þetta er til að tryggja að aðeins aðilar sem eru í forsvari fyrir húsfélagið geti stofnað það og sett upp.
                    </Typography>
                    <Button
                        variant="contained"
                        sx={{ backgroundColor: '#08C076', color: '#fff', fontWeight: 600, textTransform: 'none', '&:hover': { backgroundColor: '#06a866' } }}
                        onClick={() => navigate('/')}
                    >
                        Fara á forsíðu
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Paper variant="outlined" sx={{ p: 4, maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box>
                    <Typography variant="h5" gutterBottom>Skrá húsfélag</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Fylltu út upplýsingar um húsfélagið og formanninn. Við munum fara yfir beiðnina og hafa samband fljótlega.
                    </Typography>
                </Box>

                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1D366F', mb: -1 }}>Húsfélag</Typography>
                <TextField
                    label="Kennitala húsfélags"
                    value={assocSsn}
                    onChange={e => setAssocSsn(fmtSsn(e.target.value))}
                    size="small" fullWidth placeholder="000000-0000" disabled={saving}
                    error={assocSsn.length > 0 && ssnDigits(assocSsn).length !== 10}
                    helperText={assocSsn.length > 0 && ssnDigits(assocSsn).length !== 10 ? 'Kennitala verður að vera 10 tölustafir' : ''}
                />
                <TextField
                    label="Nafn húsfélags"
                    value={assocName}
                    onChange={e => setAssocName(e.target.value)}
                    size="small" fullWidth disabled={saving}
                />

                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1D366F', mb: -1 }}>Formaður</Typography>
                <TextField
                    label="Kennitala formanns"
                    value={chairSsn}
                    onChange={e => setChairSsn(fmtSsn(e.target.value))}
                    size="small" fullWidth placeholder="000000-0000" disabled={saving}
                    error={chairSsn.length > 0 && ssnDigits(chairSsn).length !== 10}
                    helperText={chairSsn.length > 0 && ssnDigits(chairSsn).length !== 10 ? 'Kennitala verður að vera 10 tölustafir' : ''}
                />
                <TextField
                    label="Nafn formanns"
                    value={chairName}
                    onChange={e => setChairName(e.target.value)}
                    size="small" fullWidth disabled={saving}
                />
                <TextField
                    label="Netfang formanns"
                    type="email"
                    value={chairEmail}
                    onChange={e => setChairEmail(e.target.value)}
                    size="small" fullWidth disabled={saving}
                    error={chairEmail.length > 0 && !emailValid}
                    helperText={chairEmail.length > 0 && !emailValid ? 'Netfang er ekki gilt' : ''}
                />
                <TextField
                    label="Símanúmer formanns"
                    value={chairPhone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    size="small" fullWidth disabled={saving}
                    inputProps={{ inputMode: 'tel', placeholder: '000 0000' }}
                    error={chairPhone.length > 0 && !phoneValid}
                    helperText={chairPhone.length > 0 && !phoneValid ? 'Símanúmer verður að vera 7 tölustafir' : ''}
                />

                {error && <Alert severity="error">{error}</Alert>}

                <Button
                    variant="contained"
                    sx={{ backgroundColor: '#08C076', color: '#fff', fontWeight: 600, textTransform: 'none', '&:hover': { backgroundColor: '#06a866' } }}
                    disabled={!isValid || saving}
                    onClick={handleSubmit}
                >
                    {saving ? <CircularProgress size={20} color="inherit" /> : 'Senda beiðni'}
                </Button>
                <Button variant="text" size="small" onClick={() => navigate(-1)} sx={{ color: 'text.secondary' }}>
                    Til baka
                </Button>
            </Paper>
        </Box>
    );
}

export default RegistrationRequestPage;
