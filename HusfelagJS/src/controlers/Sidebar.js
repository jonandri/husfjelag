import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Typography, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Alert, CircularProgress,
} from '@mui/material';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import { UserContext } from './UserContext';
import { fmtKennitala, fmtPhone } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const BG          = '#1D366F';
const ACTIVE_BG   = 'rgba(255,255,255,0.18)';
const HOVER_BG    = 'rgba(255,255,255,0.08)';
const TEXT        = '#FFFFFF';
const W_OPEN      = 220;
const W_CLOSED    = 64;

const NAV = [
    { path: '/husfelag',  label: 'Húsfélag',  icon: <BusinessOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/ibudir',    label: 'Íbúðir',    icon: <HomeOutlinedIcon                  sx={{ fontSize: 20 }} /> },
    { path: '/eigendur',  label: 'Eigendur',  icon: <GroupOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/aaetlun',   label: 'Áætlun',    icon: <AssessmentOutlinedIcon            sx={{ fontSize: 20 }} /> },
    { path: '/faerslur',         label: 'Færslur',          icon: <ReceiptLongOutlinedIcon           sx={{ fontSize: 20 }} /> },
    { path: '/flokkunarreglur',  label: 'Flokkunarreglur',  icon: <LabelOutlinedIcon                 sx={{ fontSize: 20 }} /> },
    { path: '/skyrslur',         label: 'Skýrslur',         icon: <BarChartOutlinedIcon              sx={{ fontSize: 20 }} /> },
    { path: '/innheimta',        label: 'Innheimta',        icon: <AccountBalanceWalletOutlinedIcon  sx={{ fontSize: 20 }} /> },
];

function NavItem({ path, label, icon, collapsed, active, onClick }) {
    return (
        <Tooltip title={collapsed ? label : ''} placement="right" arrow>
            <Box
                onClick={onClick}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 0.85,
                    mx: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    backgroundColor: active ? ACTIVE_BG : 'transparent',
                    '&:hover': { backgroundColor: active ? ACTIVE_BG : HOVER_BG },
                    transition: 'background-color 0.15s',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    overflow: 'hidden',
                    minHeight: 40,
                }}
            >
                <Box sx={{ color: TEXT, display: 'flex', flexShrink: 0 }}>{icon}</Box>
                {!collapsed && (
                    <Typography sx={{
                        color: TEXT,
                        fontFamily: '"Inter", sans-serif',
                        fontWeight: active ? 500 : 400,
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap',
                        opacity: 1,
                        transition: 'opacity 0.15s',
                    }}>
                        {label}
                    </Typography>
                )}
            </Box>
        </Tooltip>
    );
}

function BottomItem({ label, icon, collapsed, onClick, hoverColor }) {
    return (
        <Tooltip title={collapsed ? label : ''} placement="right" arrow>
            <Box
                onClick={onClick}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 0.85,
                    mx: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    overflow: 'hidden',
                    minHeight: 40,
                    '&:hover': { backgroundColor: HOVER_BG },
                    '&:hover .bottom-icon': hoverColor ? { color: hoverColor } : {},
                    transition: 'background-color 0.15s',
                }}
            >
                <Box className="bottom-icon" sx={{ color: TEXT, display: 'flex', flexShrink: 0, transition: 'color 0.15s' }}>
                    {icon}
                </Box>
                {!collapsed && (
                    <Typography sx={{ color: TEXT, fontFamily: '"Inter", sans-serif', fontWeight: 400, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                        {label}
                    </Typography>
                )}
            </Box>
        </Tooltip>
    );
}

function SideBar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, setUser, associations, currentAssociation, setCurrentAssociation, stopImpersonating, impersonating, assocParam } = React.useContext(UserContext);
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [switcherQ, setSwitcherQ] = useState('');
    const [switcherResults, setSwitcherResults] = useState([]);
    const [switcherSearching, setSwitcherSearching] = useState(false);

    React.useEffect(() => {
        if (!switcherOpen || !user?.id) return;
        setSwitcherSearching(true);
        fetch(`${API_URL}/Association/list/${user.id}${switcherQ ? `?q=${encodeURIComponent(switcherQ)}` : ''}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { setSwitcherResults(data); setSwitcherSearching(false); })
            .catch(() => setSwitcherSearching(false));
    }, [switcherOpen, switcherQ, user]);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('sidebarCollapsed', String(next));
    };

    return (
        <Box sx={{
            width: collapsed ? W_CLOSED : W_OPEN,
            minWidth: collapsed ? W_CLOSED : W_OPEN,
            backgroundColor: BG,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            position: 'relative',
            transition: 'width 0.2s ease, min-width 0.2s ease',
            flexShrink: 0,
        }}>
            {/* Logo */}
            <Box
                onClick={() => navigate('/husfelag')}
                sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pt: 3, pb: 2.5, px: 1, cursor: 'pointer', minHeight: 80, overflow: 'hidden' }}
            >
                {collapsed ? (
                    <Box sx={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: ACTIVE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Typography sx={{ color: TEXT, fontWeight: 700, fontSize: '0.85rem', fontFamily: '"Inter", sans-serif' }}>H</Typography>
                    </Box>
                ) : (
                    <img src={require('../assets/images/logo/logo-no-background.png')} alt="Logo" width={140} style={{ display: 'block' }} />
                )}
            </Box>

            {/* Collapse toggle */}
            <Box
                onClick={toggle}
                sx={{
                    position: 'absolute',
                    top: 68,
                    right: -13,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: BG,
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 20,
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                    transition: 'background-color 0.15s',
                }}
            >
                {collapsed
                    ? <ChevronRightIcon sx={{ color: TEXT, fontSize: 16 }} />
                    : <ChevronLeftIcon  sx={{ color: TEXT, fontSize: 16 }} />
                }
            </Box>

            {/* Association switcher */}
            <Box
                onClick={() => setSwitcherOpen(true)}
                sx={{
                    mx: 1, mb: 1, px: 1.5, py: 1, borderRadius: 2, cursor: 'pointer',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.14)' },
                    overflow: 'hidden',
                    border: impersonating ? '1px solid rgba(255,165,0,0.6)' : 'none',
                }}
            >
                {!collapsed && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', lineHeight: 1.2 }}>
                        {impersonating ? 'Kerfisstjóri' : 'Húsfélag'}
                    </Typography>
                )}
                <Typography variant="body2" sx={{ color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {collapsed ? '🏢' : (currentAssociation?.name || '—')}
                </Typography>
            </Box>

            {/* Nav items */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.25, pt: 0.5, overflowY: 'auto', overflowX: 'hidden' }}>
                {currentAssociation && NAV.map(item => (
                    <NavItem
                        key={item.path}
                        {...item}
                        collapsed={collapsed}
                        active={location.pathname === item.path}
                        onClick={() => navigate(item.path)}
                    />
                ))}
            </Box>

            {/* Bottom: superadmin + settings + logout */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pb: 2, pt: 1 }}>
                {user?.is_superadmin && (
                    <BottomItem
                        label="Kerfisstjóri"
                        icon={<AdminPanelSettingsOutlinedIcon sx={{ fontSize: 20 }} />}
                        collapsed={collapsed}
                        onClick={() => navigate('/superadmin')}
                    />
                )}
                <BottomItem
                    label="Stillingar"
                    icon={<AccountCircleOutlinedIcon sx={{ fontSize: 20 }} />}
                    collapsed={collapsed}
                    onClick={() => setSettingsOpen(true)}
                />
                <BottomItem
                    label="Útskráning"
                    icon={<LogoutIcon sx={{ fontSize: 20 }} />}
                    collapsed={collapsed}
                    onClick={() => navigate('/logout')}
                    hoverColor="#ff6b6b"
                />
            </Box>

            <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} setUser={setUser} />

            <Dialog open={switcherOpen} onClose={() => { setSwitcherOpen(false); setSwitcherQ(''); setSwitcherResults([]); }} maxWidth="xs" fullWidth>
                <DialogTitle>Skipta um húsfélag</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                    {impersonating && (
                        <Alert severity="warning" action={
                            <Button size="small" onClick={() => { stopImpersonating(); setSwitcherOpen(false); setSwitcherQ(''); setSwitcherResults([]); }}>
                                Hætta við
                            </Button>
                        }>
                            Þú ert að skoða sem kerfisstjóri
                        </Alert>
                    )}
                    <TextField
                        size="small" fullWidth autoFocus
                        placeholder="Leita eftir nafni eða kennitölu..."
                        value={switcherQ}
                        onChange={e => setSwitcherQ(e.target.value)}
                        InputProps={{ endAdornment: switcherSearching ? <CircularProgress size={14} /> : null }}
                    />
                    {switcherResults.map(a => (
                        <Box
                            key={a.id}
                            onClick={() => { setCurrentAssociation(a); setSwitcherOpen(false); setSwitcherQ(''); setSwitcherResults([]); }}
                            sx={{
                                p: 1.5, borderRadius: 1, cursor: 'pointer',
                                backgroundColor: currentAssociation?.id === a.id ? 'rgba(8,192,118,0.12)' : 'transparent',
                                border: currentAssociation?.id === a.id ? '1px solid rgba(8,192,118,0.4)' : '1px solid rgba(0,0,0,0.1)',
                                '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
                            }}
                        >
                            <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{a.role || ''}</Typography>
                        </Box>
                    ))}
                    {!switcherSearching && switcherResults.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                            {switcherQ ? 'Ekkert húsfélag fannst.' : 'Ekkert húsfélag skráð.'}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                    {user?.is_superadmin ? (
                        <Button
                            color="secondary"
                            onClick={() => { setSwitcherOpen(false); setSwitcherQ(''); setSwitcherResults([]); navigate('/superadmin'); }}
                        >
                            + Stofna húsfélag
                        </Button>
                    ) : <span />}
                    <Button onClick={() => { setSwitcherOpen(false); setSwitcherQ(''); setSwitcherResults([]); }}>Loka</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function UserSettingsDialog({ open, onClose, user, setUser }) {
    const [profile, setProfile] = useState(null);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open || !user?.id) return;
        setError('');
        if (user.name) {
            setProfile(user);
            setEmail(user.email || '');
            setPhone(user.phone || '');
        } else {
            setLoading(true);
            fetch(`${API_URL}/User/${user.id}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        setProfile(data);
                        setEmail(data.email || '');
                        setPhone(data.phone || '');
                        const merged = { ...user, ...data };
                        localStorage.setItem('user', JSON.stringify(merged));
                        setUser(merged);
                    }
                })
                .finally(() => setLoading(false));
        }
    }, [open]);

    const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const phoneValid = !phone || /^(\+\d{1,3}[\s-]?)?\d{3}[\s]?\d{4}$/.test(phone.trim());
    const isValid = emailValid && phoneValid;

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/User/${user.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), phone: fmtPhone(phone) }),
            });
            if (resp.ok) {
                const updated = await resp.json();
                const newUser = { ...user, ...updated };
                localStorage.setItem('user', JSON.stringify(newUser));
                setUser(newUser);
                setProfile(newUser);
                onClose();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við vistun.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Stillingar</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} color="secondary" />
                    </Box>
                ) : (
                    <>
                        <Box>
                            <Typography variant="body1" fontWeight={500}>{profile?.name}</Typography>
                            <Typography variant="body2" color="text.secondary">Kennitala: {fmtKennitala(profile?.kennitala)}</Typography>
                        </Box>
                        <TextField
                            label="Netfang" type="email" value={email}
                            onChange={e => setEmail(e.target.value)}
                            size="small" fullWidth
                            error={!!email && !emailValid}
                            helperText={!!email && !emailValid ? 'Netfang verður að innihalda @ og lén (t.d. jon@husfelag.is)' : ''}
                        />
                        <TextField
                            label="Símanúmer" value={phone}
                            onChange={e => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))}
                            size="small" fullWidth inputProps={{ inputMode: 'tel' }}
                            error={!!phone && !phoneValid}
                            helperText={!!phone && !phoneValid ? 'Símanúmer: 7 tölustafir (t.d. 555 1234 eða +354 555 1234)' : ''}
                        />
                        {error && <Alert severity="error">{error}</Alert>}
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Loka</Button>
                <Button variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={loading || !isValid || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default SideBar;
