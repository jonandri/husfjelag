import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, Divider, Grid } from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function Dashboard() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);
    const [association, setAssociation] = useState(null);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        const fetchAssociation = async () => {
            try {
                const response = await fetch(`${API_URL}/Association/${user.id}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data === null) {
                        navigate('/houseassociation');
                    } else {
                        setAssociation(data);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch association:', err);
            }
        };

        fetchAssociation();
    }, [user]);

    return (
        <div className='dashboard'>
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                {association && (
                    <>
                        <Typography variant="h5" gutterBottom>
                            {association.name}
                        </Typography>
                        <Divider sx={{ mb: 3 }} />
                        <Grid container spacing={2}>
                            <StatCard label="Íbúðir skráðar" value={association.apartment_count} />
                            <StatCard label="Eigendur skráðir" value={association.owner_count} />
                            <StatCard label="Formaður" value={association.chair || '—'} />
                            <StatCard label="Gjaldkeri" value={association.cfo || '—'} />
                        </Grid>
                    </>
                )}
            </Box>
        </div>
    );
};

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

export default Dashboard;