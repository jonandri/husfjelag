import React, { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress,
  Card, CardContent, Chip, Divider, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SyncIcon from '@mui/icons-material/Sync';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const BANK_OPTIONS = [
  { value: 'LANDSBANKINN', label: 'Landsbankinn' },
];

export default function BankSettingsPage() {
  const { user, currentAssociation } = useContext(UserContext);
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState('LANDSBANKINN');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  const assocId = currentAssociation?.id;

  useEffect(() => {
    if (!assocId) return;
    fetchStatus();
    if (searchParams.get('connected') === '1') {
      setMessage({ type: 'success', text: 'Bankatengind tókst!' });
    } else if (searchParams.get('status') === 'error') {
      setMessage({ type: 'error', text: 'Villa við tengingu við banka.' });
    }
  }, [assocId]);

  async function fetchStatus() {
    setLoading(true);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/status`);
      if (resp.status === 404) {
        setStatus(null);
      } else {
        const data = await resp.json();
        setStatus(data);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    window.location.href = `${API_URL}/associations/${assocId}/bank/connect?bank=${selectedBank}`;
  }

  async function handleDisconnect() {
    if (!window.confirm('Aftengja banka? Þetta stöðvar sjálfvirka færsluinnflutning.')) return;
    await apiFetch(`${API_URL}/associations/${assocId}/bank/disconnect`, { method: 'DELETE' });
    setStatus(null);
    setMessage({ type: 'info', text: 'Bankatengind aftengt.' });
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      await apiFetch(`${API_URL}/admin/associations/${assocId}/bank/sync`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Samstilling hafin í bakgrunni.' });
    } catch {
      setMessage({ type: 'error', text: 'Villa við samstillingu.' });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Bankastillingar
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {status?.is_expiring_soon && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Bankasamþykki rennur út eftir {status.days_until_expiry} daga.{' '}
          <strong>Endurnýjaðu tenginguna.</strong>
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AccountBalanceIcon />
            <Typography variant="h6">Bankatengind</Typography>
            {status ? (
              <Chip label="Tengt" color="success" size="small" sx={{ ml: 'auto' }} />
            ) : (
              <Chip label="Ekki tengt" size="small" sx={{ ml: 'auto' }} />
            )}
          </Box>

          {status ? (
            <>
              <Typography variant="body2" color="text.secondary">
                <strong>Banki:</strong> {status.bank_display}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Samþykki gildir til:</strong>{' '}
                {new Date(status.consent_expires_at).toLocaleDateString('is-IS')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>Síðast uppfært:</strong>{' '}
                {new Date(status.updated_at).toLocaleDateString('is-IS')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnect}
                  startIcon={<AccountBalanceIcon />}
                >
                  Endurnýja tengingu
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDisconnect}
                  startIcon={<LinkOffIcon />}
                >
                  Aftengja
                </Button>
                {user?.is_superadmin && (
                  <Button
                    variant="outlined"
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                  >
                    Samstilla núna
                  </Button>
                )}
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Engin bankatengind virk. Veldu banka og tengdu félagið.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Banki</InputLabel>
                  <Select
                    value={selectedBank}
                    label="Banki"
                    onChange={(e) => setSelectedBank(e.target.value)}
                  >
                    {BANK_OPTIONS.map((b) => (
                      <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnect}
                  startIcon={<AccountBalanceIcon />}
                >
                  Tengja banka
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
