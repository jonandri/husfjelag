import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';

export default function HomePage() {
    const navigate = useNavigate();

    return (
        <Box sx={{ minHeight: '100vh', background: '#fff' }}>
            <Typography variant="h4">Húsfélag</Typography>
            <Button onClick={() => navigate('/login')}>Skrá sig</Button>
        </Box>
    );
}
