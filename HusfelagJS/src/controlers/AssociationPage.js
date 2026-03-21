import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress, Divider, Paper, Grid } from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import HouseAssociationForm from './HouseAssociation';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function AssociationPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);
    const [association, setAssociation] = useState(undefined);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }

        const fetch_ = async () => {
            try {
                const resp = await fetch(`${API_URL}/Association/${user.id}`);
                if (resp.ok) {
                    const data = await resp.json();
                    setAssociation(data);
                } else {
                    setError('Villa við að sækja húsfélag.');
                    setAssociation(null);
                }
            } catch {
                setError('Tenging við þjón mistókst.');
                setAssociation(null);
            }
        };
        fetch_();
    }, [user]);

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

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1 }}>
                <Typography variant="h5" gutterBottom>
                    {association.name}
                </Typography>
                <Divider sx={{ mb: 3 }} />

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <StatCard label="Íbúðir skráðar" value={association.apartment_count} />
                    <StatCard label="Eigendur skráðir" value={association.owner_count} />
                    <StatCard label="Formaður" value={association.chair || '—'} />
                    <StatCard label="Gjaldkeri" value={association.cfo || '—'} />
                </Grid>

                <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 480 }}>
                    <Row label="Kennitala" value={association.ssn} />
                    <Row label="Heimilisfang" value={association.address} />
                    <Row label="Póstnúmer" value={association.postal_code} />
                    <Row label="Borg/Sveitarfélag" value={association.city} />
                </Paper>

                {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
            </Box>
        </div>
    );
}

function StatCard({ label, value }) {
    return (
        <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="h4" color="secondary.main">
                    {value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {label}
                </Typography>
            </Paper>
        </Grid>
    );
}

function Row({ label, value }) {
    return (
        <Box sx={{ display: 'flex', gap: 2 }}>
            <Typography sx={{ minWidth: 160, color: 'text.secondary' }}>{label}:</Typography>
            <Typography>{value}</Typography>
        </Box>
    );
}

export default AssociationPage;
