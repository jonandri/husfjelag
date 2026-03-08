import React, {useState} from 'react';
import { Button, TextField, Box, Typography, ThemeProvider, Tabs, Tab } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';


function LoginForm() {
    const theme = useTheme();
    const navigate = useNavigate();
    const {setUser } = React.useContext(UserContext);

    //for the tabs
    const [value, setValue] = useState(0);
    const handleChange = (event, newValue) => {
        setValue(newValue);
    };
    //onSubmit function
    const [personID, setPersonID] = useState('');
    const [phone, setPhone] = useState('');
    const handlePersonIDChange = (event) => {
        setPersonID(event.target.value);
    };

    const handlePhoneChange = (event) => {
        setPhone(event.target.value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        // Handle form submission here
        const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/Login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ personID, phone }),
        })
      
        if (response.ok) {
            console.log('Form submitted successfully');
            const data = await response.json();
            console.log(data);

            setUser(data);
            localStorage.setItem('user', JSON.stringify(data));

            // Redirect to the dashboard
            navigate('Dashboard');
        } else {
            console.log('Form submission failed');
        }
    };

    return (
        <div className='login'>
            <br/>
            <Box    
                component="form"
                onSubmit={handleSubmit}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center', // Add this line to center vertically
                    border: '1px solid black',
                    padding: '20px',
                    width: '400px', // Set the width to 200px
                    margin: '0 auto', // Add this line to center horizontally
                }}
                noValidate
                autoComplete="off"
            >

                <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={150}/>
                <Typography variant="h4" component="h1">
                    Innskráning
                </Typography>

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={value} onChange={handleChange} aria-label="basic tabs example">
                    <Tab label="Auðkennisappið" />
                    <Tab label="Rafræn skilríki" />
                </Tabs>
                </Box>
                
                <Box p={3}>
                    {value === 0 && (
                        <div>
                            <TextField
                                required
                                id="personID"
                                label="Kennitala"
                                onChange={handlePersonIDChange}
                                inputProps={{ pattern: "[0-9]{10}", title: "Setjið inn 10 stafa kennitölu (án bandstriks)" }}
                                error={personID.length > 10}
                                helperText={personID.length !== 10 ? "Sláið inn 10 stafa kennitölu" : ""}
                            />
                        </div>
                    )}
                    {value === 1 && (
                        <div>
                            <TextField
                                required
                                id="phone"
                                label="Símanúmer"
                                onChange={handlePhoneChange}
                                inputProps={{ pattern: "[0-9]{7}", title: "Setjið inn 7 stafa símanúmer" }}
                                error={phone.length !== 7}
                                helperText={phone.length !== 7 ? "Invalid input" : ""}
                            />
                        </div>
                    )}
                </Box>

                <Button variant="contained" type="submit">
                    Innskrá
                </Button>

            </Box>  
        </div>
    );
}

export default LoginForm;