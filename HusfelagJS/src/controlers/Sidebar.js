import React, {useState} from 'react';
import { Button, TextField, Box, Typography, ThemeProvider, Tabs, Tab } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';
import '../assets/styles/sidebar.css';


function SideBar(){    
    const navigate = useNavigate();
    const theme = useTheme();
    const { user } = React.useContext(UserContext);

    const liStyle = { color: theme.palette.background.text, lineHeight: '2', cursor: 'pointer', fontFamily: theme.typography.fontFamily, fontWeight: 400 };

    return (
        <div className="sidebar" style={{ backgroundColor: theme.palette.background.main, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
                <div className="logo" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                    <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={150} />
                </div>
                <nav>
                    <ul style={{ margin: 0, paddingLeft: 24, paddingTop: 24 }}>
                        <li style={liStyle} onClick={() => navigate('/husfelag')}>Húsfélag</li>
                        <li style={liStyle} onClick={() => navigate('/ibudir')}>Íbúðir</li>
                        <li style={liStyle} onClick={() => navigate('/item1')}>Bókhaldslyklar</li>
                        <li style={liStyle} onClick={() => navigate('/item2')}>Áætlun</li>
                        <li style={liStyle} onClick={() => navigate('/item4')}>Verkefnalisti</li>
                    </ul>
                </nav>
            </div>
            <div style={{ padding: '16px' }}>
                <li style={{ ...liStyle, listStyle: 'none', color: theme.palette.secondary.main }} onClick={() => navigate('/logout')}>Útskráning</li>
            </div>
        </div>
    );
};

export default SideBar;