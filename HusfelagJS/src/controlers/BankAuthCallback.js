import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

export default function BankAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const bankStatus = searchParams.get('status');
    const reason = searchParams.get('reason');
    const assocId = searchParams.get('assoc');

    if (bankStatus === 'ok') {
      setTimeout(() => {
        navigate(`/bank-settings${assocId ? `?assoc=${assocId}` : ''}?connected=1`);
      }, 1200);
    } else {
      setError(reason || 'unknown_error');
      setTimeout(() => {
        navigate('/bank-settings?status=error');
      }, 3000);
    }
  }, [searchParams, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      {error ? (
        <Alert severity="error">
          Tenging við banka mistókst ({error}). Þú verður vísað áfram...
        </Alert>
      ) : (
        <>
          <CircularProgress />
          <Typography>Tenging við banka staðfest. Hleð...</Typography>
        </>
      )}
    </Box>
  );
}
