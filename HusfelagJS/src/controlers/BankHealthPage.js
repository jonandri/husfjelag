import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Paper, Chip, Card, CardContent, Grid,
} from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function StatCard({ label, value, color }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ textAlign: 'center' }}>
        <Typography variant="h3" sx={{ color: color || 'inherit', fontWeight: 200 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}

export default function BankHealthPage() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.is_superadmin) { navigate('/dashboard'); return; }
    apiFetch(`${API_URL}/admin/bank/health`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Villa við að sækja gögn.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
        <CircularProgress color="secondary" />
      </Box>
    </div>
  );

  if (error) return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ p: 3, flex: 1 }}><Alert severity="error">{error}</Alert></Box>
    </div>
  );

  const { summary, associations } = data;

  return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Zone 1: Header */}
        <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Typography variant="h5">Bankaheilsa — yfirlit</Typography>
        </Box>

        {/* Zone 2: Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} md={3}>
              <StatCard label="Virkar tengingar" value={summary.active_connections} color="#08C076" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard label="Renna út á 14 dögum" value={summary.expiring_within_14_days} color="#f59e0b" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard label="Útrunnið" value={summary.expired} color="#ef4444" />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard label="Tilkynningar þ.m." value={summary.notifications_this_month} />
            </Grid>
          </Grid>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Félag</TableCell>
                  <TableCell>Banki</TableCell>
                  <TableCell>Samþykki gildir til</TableCell>
                  <TableCell>Staða</TableCell>
                  <TableCell>Síðasta samstilling</TableCell>
                  <TableCell>Síðasta tilkynning</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {associations.map((row) => (
                  <TableRow
                    key={row.association_id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/bank-settings?assoc=${row.association_id}`)}
                  >
                    <TableCell>{row.association_name}</TableCell>
                    <TableCell>{row.bank_display}</TableCell>
                    <TableCell>
                      {new Date(row.consent_expires_at).toLocaleDateString('is-IS')}
                    </TableCell>
                    <TableCell>
                      {row.days_until_expiry < 0 ? (
                        <Chip label="Útrunnið" color="error" size="small" />
                      ) : row.is_expiring_soon ? (
                        <Chip label={`${row.days_until_expiry}d`} color="warning" size="small" />
                      ) : (
                        <Chip label="Í lagi" color="success" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {row.last_sync_at
                        ? new Date(row.last_sync_at).toLocaleDateString('is-IS')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {row.last_notification_at
                        ? new Date(row.last_notification_at).toLocaleDateString('is-IS')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {associations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                      Engar bankatengingar skráðar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>
    </div>
  );
}
