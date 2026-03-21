import React from 'react';
import { Button, Box, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function LoginForm() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    // Already logged in — skip straight to dashboard
    React.useEffect(() => {
        if (user) navigate('/dashboard');
    }, [user, navigate]);

    const handleLogin = () => {
        window.location.href = `${API_URL}/auth/login`;
    };

    return (
        <div className='login'>
            <br />
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid black',
                    padding: '40px',
                    width: '400px',
                    margin: '0 auto',
                    gap: 3,
                }}
            >
                <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={150} />
                <Typography variant="h4" component="h1">
                    Innskráning
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                    Skráðu þig inn með rafrænum skilríkjum eða Auðkennisappinu
                </Typography>
                <Button
                    variant="contained"
                    color="secondary"
                    size="large"
                    fullWidth
                    onClick={handleLogin}
                    sx={{ color: '#fff' }}
                >
                    Innskrá með Kenni
                </Button>
            </Box>
        </div>
    );
}

export default LoginForm;
