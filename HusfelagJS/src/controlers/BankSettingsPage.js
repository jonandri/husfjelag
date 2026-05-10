import React, { useContext, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Alert, CircularProgress,
  Card, CardContent, Chip, TextField, Tooltip, IconButton,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';
import { primaryButtonSx, secondaryButtonSx, ghostButtonSx } from '../ui/buttons';
import { useHelp } from '../ui/HelpContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';
const NAVY = '#1D366F';
const BORDER = '#e8e8e8';

const BANKS = [
  { id: 'landsbankinn', label: 'Landsbankinn', sub: 'Húsfélagsþjónusta Landsbankans' },
  { id: 'islandsbanki', label: 'Íslandsbanki', sub: 'Húsfélagsþjónusta Íslandsbanka' },
  { id: 'arion',        label: 'Arion',        sub: 'Húsfélagsþjónusta Arion banka' },
];

export default function BankSettingsPage() {
  const { user, currentAssociation } = useContext(UserContext);
  const { openHelp } = useHelp();

  const [bankSettings, setBankSettings] = useState(null);  // null = no row in DB
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [message, setMessage]           = useState(null);

  // Form inputs
  const [apiKeyInput, setApiKeyInput]             = useState('');
  const [templateIdInput, setTemplateIdInput]     = useState('');
  const [showApiKeyInput, setShowApiKeyInput]     = useState(false);
  const [showTemplateInput, setShowTemplateInput] = useState(false);

  // Bank-change confirmation dialog
  const [changeBankOpen, setChangeBankOpen] = useState(false);
  const [pendingBank, setPendingBank]       = useState(null);  // bank id to switch to, or null for "pick again"

  const assocId      = currentAssociation?.id;
  const canManage    = ['Formaður', 'Gjaldkeri', 'Kerfisstjóri'].includes(currentAssociation?.role);
  const isConfigured = bankSettings?.bank === 'landsbankinn'
                    && bankSettings?.api_key_set
                    && !!bankSettings?.template_id;

  useEffect(() => {
    if (!assocId) return;
    fetchSettings();
  }, [assocId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSettings() {
    setLoading(true);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/settings`);
      if (resp.ok) {
        const s = await resp.json();
        setBankSettings(s);
        setTemplateIdInput(s.template_id || '');
      }
      // 404 → no row yet, bankSettings stays null
    } catch { /* leave defaults */ } finally {
      setLoading(false);
    }
  }

  async function postSettings(data) {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (resp.ok) {
        const s = await resp.json();
        setBankSettings(s);
        setTemplateIdInput(s.template_id || '');
        return true;
      }
      const err = await resp.json();
      setMessage({ type: 'error', text: err.detail || 'Villa við vistun.' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Tenging við þjón mistókst.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function disconnectBank() {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/disconnect`, { method: 'DELETE' });
      if (resp.ok) {
        setBankSettings(null);
        setTemplateIdInput('');
        setApiKeyInput('');
        setShowApiKeyInput(false);
        setShowTemplateInput(false);
        return true;
      }
      const err = await resp.json();
      setMessage({ type: 'error', text: err.detail || 'Villa við endurstillingu.' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Tenging við þjón mistókst.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  function requestBankChange(bankId) {
    // bankId = null means "go back to picker without picking a new one"
    setPendingBank(bankId);
    setChangeBankOpen(true);
  }

  async function confirmBankChange() {
    setChangeBankOpen(false);
    const ok = await disconnectBank();
    if (ok && pendingBank) {
      await postSettings({ bank: pendingBank });
    }
  }

  async function handleSelectBank(bankId) {
    if (bankSettings?.bank) {
      requestBankChange(bankId);
    } else {
      await postSettings({ bank: bankId });
    }
  }

  async function handleSaveApiKey() {
    const ok = await postSettings({ api_key: apiKeyInput.trim() });
    if (ok) { setApiKeyInput(''); setShowApiKeyInput(false); }
  }

  async function handleSaveTemplate() {
    const ok = await postSettings({ template_id: templateIdInput.trim() });
    if (ok) setShowTemplateInput(false);
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

  const selectedBankDef = BANKS.find(b => b.id === bankSettings?.bank);

  return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5">Bankastillingar</Typography>
          <Tooltip title="Hjálp">
            <IconButton size="small" onClick={() => openHelp('bank-settings')}>
              <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', p: 3, maxWidth: 700 }}>
          {message && (
            <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}

          {/* ── Section 1: Bank selection ──────────────────────────── */}
          <SectionCard title="Veldu banka">
            {!bankSettings?.bank ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mt: 1.5 }}>
                {BANKS.map(bank => (
                  <BankCard
                    key={bank.id}
                    bank={bank}
                    onClick={() => handleSelectBank(bank.id)}
                    disabled={saving}
                  />
                ))}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                <CheckCircleOutlineIcon sx={{ color: '#2e7d32', fontSize: 20 }} />
                <Typography sx={{ fontWeight: 500, flex: 1 }}>
                  {selectedBankDef?.label || bankSettings.bank}
                </Typography>
                {!isConfigured && canManage && (
                  <Button sx={ghostButtonSx} size="small" onClick={() => requestBankChange(null)}>
                    Velja annan banka
                  </Button>
                )}
              </Box>
            )}
          </SectionCard>

          {/* ── Section 2: Bank-specific setup ────────────────────── */}
          {bankSettings?.bank && (
            <>
              {bankSettings.bank === 'landsbankinn' ? (
                <>
                  {/* 2a: API key */}
                  <SectionCard title="API lykill" sx={{ mt: 2 }}>
                    {bankSettings.api_key_set && !showApiKeyInput ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                        <CheckCircleOutlineIcon sx={{ color: '#2e7d32', fontSize: 20 }} />
                        <Typography sx={{ fontWeight: 500, flex: 1 }}>API lykill stilltur</Typography>
                        {canManage && (
                          <Button sx={ghostButtonSx} size="small" onClick={() => setShowApiKeyInput(true)}>
                            Uppfæra lykil
                          </Button>
                        )}
                      </Box>
                    ) : canManage ? (
                      <>
                        {/* TODO: Replace with actual Landsbankinn API key request instructions once confirmed */}
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
                          Til að tengjast Landsbankanum þarftu API lykil. Hafðu samband við Landsbankann
                          og biddu um API lykil fyrir húsfélagið þitt.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <TextField
                            label="API lykill"
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                            size="small"
                            type="password"
                            sx={{ minWidth: 260 }}
                          />
                          <Button
                            variant="contained"
                            sx={primaryButtonSx}
                            onClick={handleSaveApiKey}
                            disabled={saving || !apiKeyInput.trim()}
                          >
                            {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                          </Button>
                          {bankSettings.api_key_set && (
                            <Button sx={ghostButtonSx} onClick={() => { setShowApiKeyInput(false); setApiKeyInput(''); }}>
                              Hætta við
                            </Button>
                          )}
                        </Box>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                        API lykill hefur ekki verið stilltur.
                      </Typography>
                    )}
                  </SectionCard>

                  {/* 2b: Innheimtusniðmát — only once API key is set */}
                  {bankSettings.api_key_set && (
                    <SectionCard title="Innheimtusniðmát" sx={{ mt: 2 }}>
                      {bankSettings.template_id && !showTemplateInput ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5 }}>
                          <CheckCircleOutlineIcon sx={{ color: '#2e7d32', fontSize: 20 }} />
                          <Typography sx={{ fontWeight: 500, flex: 1 }}>
                            Innheimtusniðmát stillt á: <Box component="span" sx={{ fontFamily: 'monospace' }}>{bankSettings.template_id}</Box>
                          </Typography>
                          {canManage && (
                            <Button sx={ghostButtonSx} size="small" onClick={() => setShowTemplateInput(true)}>
                              Uppfæra
                            </Button>
                          )}
                        </Box>
                      ) : canManage ? (
                        <>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
                            Auðkenni innheimtusniðmáts frá Landsbankanum þarf að vera stillt til að geta sent inn kröfur.
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <TextField
                              label="Innheimtusniðmát"
                              value={templateIdInput}
                              onChange={e => setTemplateIdInput(e.target.value)}
                              size="small"
                              sx={{ minWidth: 220 }}
                            />
                            <Button
                              variant="contained"
                              sx={primaryButtonSx}
                              onClick={handleSaveTemplate}
                              disabled={saving || !templateIdInput.trim()}
                            >
                              {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                            </Button>
                            {bankSettings.template_id && (
                              <Button sx={ghostButtonSx} onClick={() => { setShowTemplateInput(false); setTemplateIdInput(bankSettings.template_id); }}>
                                Hætta við
                              </Button>
                            )}
                          </Box>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                          {bankSettings.template_id
                            ? `Innheimtusniðmát stillt á: ${bankSettings.template_id}`
                            : 'Innheimtusniðmát hefur ekki verið stillt.'}
                        </Typography>
                      )}
                    </SectionCard>
                  )}
                </>
              ) : (
                /* Íslandsbanki / Arion — not yet implemented */
                <SectionCard title={selectedBankDef?.label || bankSettings.bank} sx={{ mt: 2 }}>
                  <Alert severity="info" sx={{ mt: 1.5 }}>
                    Tenging við {selectedBankDef?.label || bankSettings.bank} hefur ekki verið útfærð ennþá en er á leiðinni.
                  </Alert>
                  {canManage && (
                    <Button sx={{ ...ghostButtonSx, mt: 2 }} size="small" onClick={() => requestBankChange(null)}>
                      ← Velja annan banka
                    </Button>
                  )}
                </SectionCard>
              )}
            </>
          )}

          {/* ── Section 3: Connection status (Landsbankinn, api_key set) ── */}
          {bankSettings?.bank === 'landsbankinn' && bankSettings?.api_key_set && (
            <SectionCard title="Staða tengingar" sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
                <Chip label="Tengt" color="success" size="small" />
                <Typography variant="body2" color="text.secondary">
                  {bankSettings.last_sync_at
                    ? `Síðast samstillt: ${new Date(bankSettings.last_sync_at).toLocaleString('is-IS')}`
                    : 'Engin samstilling framkvæmd ennþá.'}
                </Typography>
              </Box>
              {bankSettings.updated_at && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Síðast uppfært: {new Date(bankSettings.updated_at).toLocaleString('is-IS')}
                </Typography>
              )}
              {user?.is_superadmin && (
                <Box sx={{ mt: 1.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={secondaryButtonSx}
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                  >
                    Samstilla núna
                  </Button>
                </Box>
              )}
            </SectionCard>
          )}

        </Box>
      </Box>

      {/* ── Confirmation dialog: change bank ──────────────────────── */}
      <Dialog open={changeBankOpen} onClose={() => setChangeBankOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Velja annan banka</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingBank
              ? `Viltu skipta yfir í ${BANKS.find(b => b.id === pendingBank)?.label}? Allar vistaðar stillingar (API lykill, innheimtusniðmát) verða eyðar.`
              : 'Viltu velja annan banka? Allar vistaðar stillingar (API lykill, innheimtusniðmát) verða eyðar.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button sx={ghostButtonSx} onClick={() => setChangeBankOpen(false)}>Hætta við</Button>
          <Button variant="contained" sx={primaryButtonSx} disabled={saving} onClick={confirmBankChange}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Já, skipta um banka'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function SectionCard({ title, children, sx }) {
  return (
    <Card variant="outlined" sx={sx}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function BankCard({ bank, onClick, disabled }) {
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        border: `1px solid ${BORDER}`,
        borderRadius: '8px',
        p: '16px 14px',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', gap: 0.75,
        transition: '150ms',
        '&:hover': disabled ? {} : { borderColor: NAVY, background: '#fafbfd' },
      }}
    >
      <AccountBalanceIcon sx={{ color: NAVY, fontSize: 22 }} />
      <Typography sx={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{bank.label}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>{bank.sub}</Typography>
    </Box>
  );
}
