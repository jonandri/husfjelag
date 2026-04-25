import React, { useContext, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Alert, CircularProgress,
  Card, CardContent, Chip, TextField,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

export default function BankSettingsPage() {
  const { user, currentAssociation } = useContext(UserContext);
  const [status, setStatus] = useState(null);
  const [bankSettings, setBankSettings] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  const assocId = currentAssociation?.id;
  const canManageBank = ['Formaður', 'Gjaldkeri', 'Kerfisstjóri'].includes(currentAssociation?.role);

  useEffect(() => {
    if (!assocId) return;
    fetchAll();
  }, [assocId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true);
    try {
      const [statusResp, settingsResp] = await Promise.all([
        apiFetch(`${API_URL}/associations/${assocId}/bank/status`),
        apiFetch(`${API_URL}/associations/${assocId}/bank/settings`),
      ]);
      if (statusResp.ok) setStatus(await statusResp.json());
      if (settingsResp.ok) {
        const s = await settingsResp.json();
        setBankSettings(s);
        setTemplateId(s.template_id || '');
      }
    } catch {
      // leave defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBankSettings(data);
        setTemplateId(data.template_id);
        setMessage({ type: 'success', text: 'Bankastillingar vistaðar.' });
      } else {
        const err = await resp.json();
        setMessage({ type: 'error', text: err.detail || 'Villa við vistun.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Tenging við þjón mistókst.' });
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="dashboard">
        <SideBar />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
          <Typography variant="h5">Bankastillingar</Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

          {message && (
            <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}

          {/* Platform connection status */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AccountBalanceIcon />
                <Typography variant="h6">Landsbankinn tenging</Typography>
                {status?.configured ? (
                  <Chip label="Tengt" color="success" size="small" sx={{ ml: 'auto' }} />
                ) : (
                  <Chip label="Ekki stillt" size="small" sx={{ ml: 'auto' }} />
                )}
              </Box>
              {status?.configured ? (
                <Typography variant="body2" color="text.secondary">
                  Kerfisskírteinið er gilt og tenging virk.
                  {status.last_sync_at && (
                    <> Síðast samstillt: {new Date(status.last_sync_at).toLocaleString('is-IS')}.</>
                  )}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Samskipti við Landsbankann eru stillt af kerfisstjóra.
                </Typography>
              )}
              {user?.is_superadmin && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                  >
                    Samstilla núna
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Template settings — CHAIR/CFO/superadmin only */}
          {canManageBank && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Sniðmát krafna</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Sniðmáts-ID frá Landsbankanum. Þarf að vera stillt til að geta sent kröfur.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    label="Sniðmáts-ID"
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    size="small"
                    sx={{ minWidth: 220 }}
                  />
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleSaveSettings}
                    disabled={saving || !templateId.trim()}
                  >
                    Vista
                  </Button>
                </Box>
                {bankSettings?.updated_at && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Síðast uppfært: {new Date(bankSettings.updated_at).toLocaleString('is-IS')}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

        </Box>
      </Box>
    </div>
  );
}
