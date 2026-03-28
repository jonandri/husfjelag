import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody, TableFooter,
    Alert,
} from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount, fmtPct, fmtKennitala } from '../format';
import { useSort, HEAD_SX, HEAD_CELL_SX } from './tableUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const TYPE_LABELS = {
    SHARED: 'Matshlutfall',
    SHARE2: 'Hiti',
    SHARE3: 'Lóð',
    EQUAL:  'Jafnt',
};

function CollectionPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [data, setData] = useState(undefined);
    const [error, setError] = useState('');
    const { sort, lbl } = useSort('anr');
    const year = new Date().getFullYear();

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        fetch(`${API_URL}/Collection/${user.id}${assocParam}`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(setData)
            .catch(() => { setError('Villa við að sækja innheimtugögn.'); setData({ rows: [], budget_summary: [] }); });
    }, [user, assocParam]);

    if (data === undefined) {
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
    const summary = data.budget_summary ?? [];
    const hasGap = summary.some(s => Math.abs(parseFloat(s.share_sum) - 100) > 0.01);

    const totalShared  = rows.reduce((s, r) => s + parseFloat(r.shared  || 0), 0);
    const totalShare2  = rows.reduce((s, r) => s + parseFloat(r.share2  || 0), 0);
    const totalShare3  = rows.reduce((s, r) => s + parseFloat(r.share3  || 0), 0);
    const totalEqual   = rows.reduce((s, r) => s + parseFloat(r.equal   || 0), 0);
    const totalAnnual  = rows.reduce((s, r) => s + parseFloat(r.annual  || 0), 0);
    const totalMonthly = rows.reduce((s, r) => s + parseFloat(r.monthly || 0), 0);

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Innheimta {year}</Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {hasGap && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Hlutföll summa ekki upp í 100% fyrir allar tegundir. Innheimta er lægri en áætlun.
                        {summary.filter(s => Math.abs(parseFloat(s.share_sum) - 100) > 0.01).map(s => (
                            <Box key={s.type} component="span" sx={{ display: 'block', mt: 0.5, fontSize: '0.85rem' }}>
                                {TYPE_LABELS[s.type] || s.type}: {fmtPct(s.share_sum)} af 100% skráð
                                {' — '}óráðstafað: {fmtAmount(parseFloat(s.budget) * (100 - parseFloat(s.share_sum)) / 100)}
                            </Box>
                        ))}
                    </Alert>
                )}

                {rows.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4 }}>
                        Engar niðurstöður. Gakktu úr skugga um að íbúðir, eigendur og virk áætlun séu skráð.
                    </Typography>
                ) : (
                    <Paper variant="outlined" sx={{ mt: 2 }}>
                        <Table size="small">
                            <TableHead sx={HEAD_SX}>
                                <TableRow>
                                    <TableCell sx={HEAD_CELL_SX}>{lbl('anr', 'Íbúð')}</TableCell>
                                    <TableCell sx={HEAD_CELL_SX}>{lbl('payer_name', 'Greiðandi')}</TableCell>
                                    <TableCell sx={HEAD_CELL_SX}>{lbl('payer_kennitala', 'Kennitala')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('shared', 'Sameiginlegt')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('share2', 'Hiti')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('share3', 'Lóð')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('equal', 'Jafnt')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('annual', 'Samtals á ári')}</TableCell>
                                    <TableCell sx={{ ...HEAD_CELL_SX, textAlign: 'right' }}>{lbl('monthly', 'Á mánuði')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sort(rows).map(row => (
                                    <TableRow key={row.apartment_id} hover>
                                        <TableCell>{row.anr}</TableCell>
                                        <TableCell>{row.payer_name ?? <Typography variant="caption" color="text.disabled">Enginn greiðandi</Typography>}</TableCell>
                                        <TableCell>{row.payer_kennitala ? fmtKennitala(row.payer_kennitala) : '—'}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.shared)}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.share2)}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.share3)}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.equal)}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.annual)}</TableCell>
                                        <TableCell align="right">{fmtAmount(row.monthly)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow sx={{ '& td': { fontWeight: 600, borderTop: '2px solid rgba(0,0,0,0.12)', color: 'text.primary' } }}>
                                    <TableCell colSpan={3}>Samtals</TableCell>
                                    <TableCell align="right">{fmtAmount(totalShared)}</TableCell>
                                    <TableCell align="right">{fmtAmount(totalShare2)}</TableCell>
                                    <TableCell align="right">{fmtAmount(totalShare3)}</TableCell>
                                    <TableCell align="right">{fmtAmount(totalEqual)}</TableCell>
                                    <TableCell align="right">{fmtAmount(totalAnnual)}</TableCell>
                                    <TableCell align="right">{fmtAmount(totalMonthly)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </Paper>
                )}
            </Box>
        </div>
    );
}

export default CollectionPage;
