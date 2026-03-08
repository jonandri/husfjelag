import React, {useState} from 'react';
import { Button, TextField, Box, Typography, ThemeProvider, Tabs, Tab } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';
import { useEffect } from 'react';
import SideBar from './Sidebar';

function Dashboard() {
    const theme = useTheme();
    const navigate = useNavigate();
    //check if user is logged in
    const { user } = React.useContext(UserContext);

    useEffect(async () => {
        if (!user) {
            // Redirect to the dashboard
            navigate('/');
        }
        let userId = user.id;

        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/HouseAssociation/` + userId, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },            
        })

        if (response.ok && response.status === 200) {
            console.log('Status: ' + response.status);
            const data = await response.json();
            if (data !== null) {
                console.log('Form submitted successfully');
                console.log(data);
            } else {
                console.log('No house association found for user');
                // Redirect to the dashboard
                navigate('HouseAssociation');
            }
        } else {
            console.log('Error: ' + response.status);
        }
      }, []); 


    return (
        <div className='dashboard'>
            <SideBar />
            <h1>Dashboard</h1>
            {/* Add your task list component here */}

        </div>
    );
};

export default Dashboard;