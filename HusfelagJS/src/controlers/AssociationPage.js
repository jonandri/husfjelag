import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress, Divider, Paper } from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import HouseAssociationForm from './HouseAssociation';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function AssociationPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);
    const [association, setAssociation] = useState(undefined); // undefined = loading
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }

        const fetch_ = async () => {
            try {
                const resp = await fetch(`${API_URL}/Association/${user.id}`);
                if (resp.ok) {
                    const data = await resp.json();
                    setAssociation(data); // null = none found, object = found
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

    const renderContent = () => {
        if (association === undefined) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
                    <CircularProgress color="secondary" />
                </Box>
            );
        }

        if (!association) {
            // No association — show the registration form inline
            return <HouseAssociationForm onCreated={() => setAssociation(undefined)} />;
        }

        return (
            <Box sx={{ p: 4, maxWidth: 560 }}>
                <Typography variant="h5" gutterBottom fontWeight="bold">
                    {association.name}
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Row label="Kennitala" value={association.ssn} />
                    <Row label="Heimilisfang" value={association.address} />
                    <Row label="Póstnúmer" value={association.postal_code} />
                    <Row label="Borg/Sveitarfélag" value={association.city} />
                </Paper>
                {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
            </Box>
        );
    };

    return (
        <div className="dashboard">
            <SideBar />
            {renderContent()}
        </div>
    );
}

function Row({ label, value }) {
    return (
        <Box sx={{ display: 'flex', gap: 2 }}>
            <Typography sx={{ minWidth: 160, color: 'text.secondary' }}>{label}:</Typography>
            <Typography fontWeight="medium">{value}</Typography>
        </Box>
    );
}

export default AssociationPage;
