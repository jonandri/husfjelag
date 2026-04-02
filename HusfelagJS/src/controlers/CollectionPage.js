import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper, Button, Select, MenuItem,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Alert, Chip, Tooltip, IconButton,
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtKennitala } from '../format';
import { primaryButtonSx } from '../ui/buttons';
import { StatusChip } from '../ui/chips';
import { HEAD_SX, HEAD_CELL_SX, AmountCell } from './tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const MONTH_NAMES = [
    '', 'Janúar', 'Febrúar', 'Mars', 'Apríl', 'Maí', 'Júní',
    'Júlí', 'Ágúst', 'September', 'Október', 'Nóvember', 'Desember',
];

function CollectionPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);

    const today = new Date();
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [year] = useState(today.getFullYear());
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [generating, setGenerating] = useState(false);
    const [matchError, setMatchError] = useState('');

    const load = useCallback(() => {
        if (!user) return;
        setData(null);
        setError('');
        // assocParam starts with '?' when set (e.g. '?as=5'), so build:
        // /Collection/{id}?as=5&month=M&year=Y  or  /Collection/{id}?month=M&year=Y
        const qs = assocParam
            ? `${assocParam}&month=${month}&year=${year}`
            : `?month=${month}&year=${year}`;
        fetch(`${API_URL}/Collection/${user.id}${qs}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setData)
            .catch(() => { setError('Villa við að sækja innheimtugögn.'); setData({ rows: [], unmatched: [] }); });
    }, [user, assocParam, month, year]);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        load();
    }, [user, load, navigate]);

    const handleGenerate = () => {
        setGenerating(true);
        setError('');
        fetch(`${API_URL}/Collection/generate${assocParam}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, month, year }),
        })
            .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || 'Villa')))
            .then(() => load())
            .catch(err => setError(typeof err === 'string' ? err : 'Villa við að búa til innheimtu.'))
            .finally(() => setGenerating(false));
    };

    const handleUnmatch = (collectionId) => {
        if (!collectionId) return;
        setMatchError('');
        fetch(`${API_URL}/Collection/unmatch${assocParam}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, collection_id: parseInt(collectionId) }),
        })
            .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || 'Villa')))
            .then(() => load())
            .catch(err => setMatchError(typeof err === 'string' ? err : 'Villa við að aftengja greiðslu.'));
    };

    const handleMatch = (collectionId, transactionId) => {
        if (!collectionId || !transactionId) return;
        setMatchError('');
        fetch(`${API_URL}/Collection/match${assocParam}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id, collection_id: parseInt(collectionId), transaction_id: parseInt(transactionId) }),
        })
            .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || 'Villa')))
            .then(() => load())
            .catch(err => setMatchError(typeof err === 'string' ? err : 'Villa við tengingu.'));
    };

    if (!data) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const rows = data.rows ?? [];
    const unmatched = data.unmatched ?? [];
    const hasItems = rows.length > 0;
    const paidCount = rows.filter(r => r.status === 'PAID').length;
    const totalAmount = rows.reduce((s, r) => s + parseFloat(r.amount_total || 0), 0);

    // Pending collection items available for manual matching
    const pendingRows = rows.filter(r => r.status === 'PENDING');

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                {/* Zone 1: Header */}
                <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Typography variant="h5">Innheimta</Typography>
                    <Button
                        variant="contained"
                        sx={primaryButtonSx}
                        onClick={handleGenerate}
                        disabled={generating || hasItems}
                    >
                        {hasItems ? 'Til staðar' : `+ Búa til ${MONTH_NAMES[month]}`}
                    </Button>
                </Box>
                {/* Zone 2: Toolbar — month navigation / filters */}
                <Box sx={{ px: 3, py: 1, background: '#fafafa', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Select
                        size="small"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        sx={{ fontSize: 13 }}
                    >
                        {MONTH_NAMES.slice(1).map((name, i) => (
                            <MenuItem key={i + 1} value={i + 1}>{name} {year}</MenuItem>
                        ))}
                    </Select>
                </Box>
                {/* Zone 3: Content */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    {matchError && <Alert severity="error" sx={{ mb: 2 }}>{matchError}</Alert>}

                    {/* Collection items table */}
                    {hasItems ? (
                        <>
                            <Typography variant="overline" sx={{ color: '#1D366F', letterSpacing: 0.5, mb: 1, display: 'block' }}>
                                Húsgjöld — {MONTH_NAMES[month]} {year}
                            </Typography>
                            <Paper variant="outlined" sx={{ mb: 3 }}>
                                <Table size="small">
                                    <TableHead sx={HEAD_SX}>
                                        <TableRow>
                                            <TableCell sx={HEAD_CELL_SX}>Íbúð</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Greiðandi</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Kennitala</TableCell>
                                            <TableCell align="right" sx={HEAD_CELL_SX}>Upphæð</TableCell>
                                            <TableCell align="center" sx={HEAD_CELL_SX}>Staða</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map(row => (
                                            <TableRow key={row.collection_id} hover
                                                sx={row.status === 'PENDING' ? { bgcolor: '#fffde7' } : undefined}>
                                                <TableCell>{row.anr}</TableCell>
                                                <TableCell>{row.payer_name ?? <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                                                <TableCell sx={{ color: '#888' }}>{row.payer_kennitala ? fmtKennitala(row.payer_kennitala) : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                                                <AmountCell value={row.amount_total} />
                                                <TableCell align="center">
                                                    <StatusChip status={row.status === 'PAID' ? 'PAID' : 'UNPAID'} />
                                                    {row.status === 'PAID' && row.paid_transaction_date && (
                                                        <Typography variant="caption" display="block" color="text.secondary">{row.paid_transaction_date}</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right" sx={{ width: 40, pr: 1 }}>
                                                    {row.status === 'PAID' && (
                                                        <Tooltip title="Aftengja greiðslu">
                                                            <IconButton size="small" onClick={() => handleUnmatch(row.collection_id)}>
                                                                <LinkOffIcon fontSize="small" sx={{ color: '#bbb' }} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                                            <TableCell colSpan={3}>Samtals</TableCell>
                                            <AmountCell value={totalAmount} sx={{ fontWeight: 600 }} />
                                            <TableCell align="center" sx={{ fontSize: 11, color: '#888' }}>
                                                {paidCount}/{rows.length} greidd
                                            </TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </Paper>
                        </>
                    ) : (
                        <Typography color="text.secondary" sx={{ mb: 3 }}>
                            Engin innheimta hefur verið búin til fyrir {MONTH_NAMES[month]}. Smelltu á „+ Búa til {MONTH_NAMES[month]}" til að búa til færslur.
                        </Typography>
                    )}

                    {/* Unmatched transactions section */}
                    {unmatched.length > 0 && (
                        <>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                <Typography variant="overline" sx={{ color: '#c62828', letterSpacing: 0.5 }}>
                                    Ósamræmdar tekjufærslur — {MONTH_NAMES[month]} {year}
                                </Typography>
                                <Chip
                                    label={unmatched.length}
                                    size="small"
                                    sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 700, height: 18, fontSize: 10 }}
                                />
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                Greiðslur sem bárust en kennitala greiðanda fannst ekki. Tengdu þær handvirkt.
                            </Typography>
                            {matchError && <Alert severity="error" sx={{ mb: 1 }}>{matchError}</Alert>}
                            <Paper variant="outlined">
                                <Table size="small">
                                    <TableHead sx={HEAD_SX}>
                                        <TableRow>
                                            <TableCell sx={HEAD_CELL_SX}>Dags.</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Lýsing</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Kennitala</TableCell>
                                            <TableCell align="right" sx={HEAD_CELL_SX}>Upphæð</TableCell>
                                            <TableCell sx={HEAD_CELL_SX}>Tengja við</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {unmatched.map(tx => (
                                            <TableRow key={tx.transaction_id} hover>
                                                <TableCell sx={{ color: '#888' }}>{tx.date}</TableCell>
                                                <TableCell>{tx.description}</TableCell>
                                                <TableCell sx={{ color: '#888' }}>{tx.payer_kennitala ? fmtKennitala(tx.payer_kennitala) : <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                                                <AmountCell value={tx.amount} />
                                                <TableCell>
                                                    <Select
                                                        size="small"
                                                        displayEmpty
                                                        value=""
                                                        onChange={e => handleMatch(e.target.value.split(':')[0], e.target.value.split(':')[1])}
                                                        sx={{ fontSize: 12, minWidth: 180 }}
                                                        renderValue={() => 'Veldu íbúð...'}
                                                    >
                                                        <MenuItem value="" disabled>Veldu íbúð...</MenuItem>
                                                        {pendingRows.map(col => (
                                                            <MenuItem key={col.collection_id} value={`${col.collection_id}:${tx.transaction_id}`}>
                                                                {col.anr} — {col.payer_name ?? '(enginn greiðandi)'}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Paper>
                        </>
                    )}
                </Box>
            </Box>
        </div>
    );
}

export default CollectionPage;
