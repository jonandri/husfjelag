import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';

function Dashboard() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        const fetchAssociation = async () => {
            try {
                const response = await fetch(`${API_URL}/Association/${user.id}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data === null) {
                        navigate('/houseassociation');
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
            <h1>Dashboard</h1>
            {/* Add your task list component here */}

        </div>
    );
};

export default Dashboard;