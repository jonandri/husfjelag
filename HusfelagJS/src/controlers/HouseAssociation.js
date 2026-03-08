import React, {useState} from 'react';
import { Button, TextField, Box, Typography, ThemeProvider, Tabs, Tab } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { UserContext } from './UserContext';

// Create a function to handle form submission
function handleSubmit(event) {
    event.preventDefault();

    // Retrieve form inputs and validate data

    // Create a new HouseAssociation object with the entered details

    // Perform any additional actions (e.g., save to database)

    // Redirect or display success message
}

function HouseAssociationForm() {
    //onSubmit function
    const [houseAssociationID, setPersonID] = useState('');
    const handleHouseAssociationIDChange = (event) => {
        setPersonID(event.target.value);
    };

    return (
        <div className='house-association'>
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
                    Húsfélag
                </Typography>
                
                <Box p={3}>
                    <div>
                        <TextField
                            required
                            id="houseAssociationID"
                            label="Kennitala"
                            onChange={handleHouseAssociationIDChange}
                            inputProps={{ pattern: "[0-9]{10}", title: "Setjið inn 10 stafa kennitölu (án bandstriks)" }}
                            error={houseAssociationID.length > 10}
                            helperText={houseAssociationID.length !== 10 ? "Sláið inn 10 stafa kennitölu" : ""}
                        />
                    </div>
                </Box>

                <Button variant="contained" type="submit">
                    Innskrá
                </Button>

            </Box>          </div>
    );
}

export default HouseAssociationForm;