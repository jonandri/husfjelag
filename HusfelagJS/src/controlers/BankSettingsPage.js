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
import { notifyError } from '../bugsnag';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';
const NAVY = '#1D366F';
const BORDER = '#e8e8e8';

const BANKS = [
  { id: 'landsbankinn', label: 'Landsbankinn', sub: 'Húsfélagsþjónusta Landsbankans' },
  { id: 'islandsbanki', label: 'Íslandsbanki', sub: 'Húsfélagsþjónusta Íslandsbanka' },
  { id: 'arion',        label: 'Arion',        sub: 'Húsfélagsþjónusta Arion banka' },
];

export default function BankSettingsPage() {
  const { currentAssociation } = useContext(UserContext);
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
  const [claimModeInput, setClaimModeInput]       = useState('DIRECT_API');

  // Bank-change confirmation dialog
  const [changeBankOpen, setChangeBankOpen] = useState(false);
  const [pendingBank, setPendingBank]       = useState(null);  // bank id to switch to, or null for "pick again"

  const assocId      = currentAssociation?.id;
  const canManage    = ['Formaður', 'Gjaldkeri', 'Kerfisstjóri'].includes(currentAssociation?.role);
  const isDirectApi  = (bankSettings?.claim_mode || 'DIRECT_API') === 'DIRECT_API';
  const isConfigured = bankSettings?.bank === 'landsbankinn'
                    && bankSettings?.api_key_set
                    && (isDirectApi ? !!bankSettings?.template_id : true);

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
        setClaimModeInput(s.claim_mode || 'DIRECT_API');
      }
      // 404 → no row yet, bankSettings stays null
    } catch { /* leave defaults */ } finally {
      setLoading(false);
    }
  }

  async function _parseErrorDetail(resp, fallback) {
    try {
      const body = await resp.json();
      return body.detail || fallback;
    } catch {
      return `${fallback} (${resp.status})`;
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
        setClaimModeInput(s.claim_mode || 'DIRECT_API');
        return true;
      }
      const text = await _parseErrorDetail(resp, 'Villa við vistun.');
      notifyError(new Error(text), 'bank_settings:postSettings', { assocId, status: resp.status, data });
      setMessage({ type: 'error', text });
      return false;
    } catch (exc) {
      notifyError(exc, 'bank_settings:postSettings:network', { assocId });
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
      const text = await _parseErrorDetail(resp, 'Villa við endurstillingu.');
      notifyError(new Error(text), 'bank_settings:disconnectBank', { assocId, status: resp.status });
      setMessage({ type: 'error', text });
      return false;
    } catch (exc) {
      notifyError(exc, 'bank_settings:disconnectBank:network', { assocId });
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

  async function handleClaimModeChange(mode) {
    if (mode === bankSettings?.claim_mode) return;
    setClaimModeInput(mode);
    await postSettings({ claim_mode: mode });
  }

  async function handleManualSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const resp = await apiFetch(`${API_URL}/admin/associations/${assocId}/bank/sync`, { method: 'POST' });
      if (resp.ok) {
        setMessage({ type: 'success', text: 'Samstilling hafin í bakgrunni. Niðurstöður birtast eftir smá stund.' });
      } else {
        const data = await resp.json().catch(() => ({}));
        setMessage({ type: 'error', text: data.detail || `Villa við samstillingu (${resp.status}).` });
      }
    } catch (exc) {
      notifyError(exc, 'bank_settings:handleManualSync:network', { assocId });
      setMessage({ type: 'error', text: 'Tenging við þjón mistókst. Athugaðu nettengingu.' });
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
                        <Box sx={{ mt: 1.5, mb: 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                          {[
                            <>Sæktu <Box component="a" href="/documents/0846-umsokn-fyllt.pdf" target="_blank" rel="noopener noreferrer" sx={{ color: '#1D366F', fontWeight: 500 }}>umsóknareyðublað Landsbankans (PDF)</Box> og fylltu það út.</>,
                            <>Á eyðublaðinu þarftu að skrá húsfélagið þitt sem heiti félags og <strong>Húsfjelagið</strong> sem Þjónustuaðila, ásamt því að haka við aðgang að bankareikningum.</>,
                            <>Sendu útfyllt eyðublað á <Box component="a" href="mailto:ft@landsbankinn.is" sx={{ color: '#1D366F', fontWeight: 500 }}>ft@landsbankinn.is</Box> ásamt kennitölunni þinni — það þarf ekki að vera undirritað, Landsbankinn sendir þér það í rafræna undirritun.</>,
                            <>Þegar API lykill berst frá Landsbankanum, límdu hann inn hér að neðan og vistaðu. Kerfið mun þá sannreyna tenginguna við Landsbankann og lesaðgang að bankareikningum.</>,
                          ].map((step, i) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                              <Box sx={{
                                flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                                background: '#eef1f8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                mt: '1px',
                              }}>
                                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1D366F' }}>{i + 1}</Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary" sx={{ pt: '2px' }}>{step}</Typography>
                            </Box>
                          ))}
                          <Box sx={{ mt: 0.5, p: '10px 14px', background: '#f5f7fc', borderRadius: 1.5, borderLeft: '3px solid #c5cfe8' }}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                              <Box component="span" sx={{ fontWeight: 600, color: '#1D366F' }}>ATH: </Box>
                              Húsfjelagið fær aðeins lesréttindi til að flokka færslurnar á rétta kostnaðarliði, kerfið hefur engin réttindi til að millifæra eða eiga við bankareikningana að öðru leiti.
                            </Typography>
                          </Box>
                        </Box>
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

                  {/* 2b: Claim mode toggle — only once API key is set */}
                  {bankSettings.api_key_set && (
                    <SectionCard title="Innheimtuaðferð" sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
                        Veldu hvernig húsfélagsgjöld eru innheimt í gegnum Landsbankann.
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {[
                          { value: 'DIRECT_API', label: 'Stofna innheimtukröfur frá husfjelag.is', sub: 'Kröfur eru sendar beint í gegnum Landsbankinn API. Þarfnast innheimtusniðmáts.' },
                          { value: 'BANK_SERVICE', label: 'Nota húsfélagaþjónustu bankans', sub: 'Landsbankinn sér um innheimtuna. Þú sendir áætlun til bankans í tölvupósti.' },
                        ].map(opt => {
                          const selected = claimModeInput === opt.value;
                          return (
                            <Box
                              key={opt.value}
                              onClick={canManage && !saving ? () => handleClaimModeChange(opt.value) : undefined}
                              sx={{
                                border: `1.5px solid ${selected ? NAVY : BORDER}`,
                                borderRadius: 1.5,
                                p: 1.5,
                                cursor: canManage && !saving ? 'pointer' : 'default',
                                background: selected ? '#f0f3fa' : '#fff',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 1.5,
                                transition: 'border-color 0.15s',
                              }}
                            >
                              <Box sx={{
                                flexShrink: 0, width: 18, height: 18, borderRadius: '50%', mt: '2px',
                                border: `2px solid ${selected ? NAVY : '#bbb'}`,
                                background: selected ? NAVY : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {selected && <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                              </Box>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400, color: selected ? NAVY : 'text.primary' }}>
                                  {opt.label}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">{opt.sub}</Typography>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </SectionCard>
                  )}

                  {/* 2c: Innheimtusniðmát — only in DIRECT_API mode */}
                  {bankSettings.api_key_set && isDirectApi && (
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
                            Þú stofnar innheimtusniðmát í <a href="https://www.fbl.is/innheimta/snidmat">netbanka Landsbankans</a>
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
              {canManage && (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={secondaryButtonSx}
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <SyncIcon />}
                  >
                    {syncing ? 'Samstilli...' : 'Samstilla núna'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ ...ghostButtonSx, color: '#c62828', borderColor: '#e8c4c4', '&:hover': { background: '#fff5f5', borderColor: '#c62828' } }}
                    onClick={() => requestBankChange(null)}
                    disabled={saving}
                  >
                    Aftengja banka
                  </Button>
                </Box>
              )}
            </SectionCard>
          )}

        </Box>
      </Box>

      {/* ── Confirmation dialog: change or disconnect bank ────────── */}
      <Dialog open={changeBankOpen} onClose={() => setChangeBankOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{pendingBank ? 'Skipta um banka' : 'Aftengja banka'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingBank
              ? `Viltu skipta yfir í ${BANKS.find(b => b.id === pendingBank)?.label}? Allar vistaðar stillingar (API lykill, innheimtusniðmát) verða eyðar.`
              : 'Viltu aftengja bankann? Allar vistaðar stillingar (API lykill, innheimtusniðmát) verða eyðar og þú getur valið banka að nýju.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button sx={ghostButtonSx} onClick={() => setChangeBankOpen(false)}>Hætta við</Button>
          <Button variant="contained" sx={primaryButtonSx} disabled={saving} onClick={confirmBankChange}>
            {saving ? <CircularProgress size={18} color="inherit" /> : pendingBank ? 'Já, skipta um banka' : 'Já, aftengja'}
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
