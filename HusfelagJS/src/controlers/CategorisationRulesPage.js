import React, { useContext, useEffect, useState } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert,
    Table, TableHead, TableBody, TableRow, TableCell,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { UserContext } from './UserContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

export default function CategorisationRulesPage() {
    const { user, assocParam } = useContext(UserContext);
    const [assocRules, setAssocRules] = useState([]);
    const [globalRules, setGlobalRules] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editRule, setEditRule] = useState(null); // null = create
    const [editGlobal, setEditGlobal] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Delete confirm dialog
    const [deleteRule, setDeleteRule] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = () => {
        if (!user?.id) return;
        setLoading(true);
        setError('');
        Promise.all([
            fetch(`${API_URL}/CategoryRule/${user.id}${assocParam}`).then(r => r.ok ? r.json() : null),
            fetch(`${API_URL}/Category/list`).then(r => r.ok ? r.json() : []),
        ])
            .then(([rules, cats]) => {
                if (rules) {
                    setAssocRules(rules.association_rules || []);
                    setGlobalRules(rules.global_rules || []);
                }
                setCategories(cats || []);
            })
            .catch(() => setError('Gat ekki sótt gögn.'))
            .finally(() => setLoading(false));
    };

    useEffect(load, [user, assocParam]);

    const openCreate = (isGlobal = false) => {
        setEditRule(null);
        setEditGlobal(isGlobal);
        setKeyword('');
        setCategoryId('');
        setSaveError('');
        setDialogOpen(true);
    };

    const openEdit = (rule, isGlobal) => {
        setEditRule(rule);
        setEditGlobal(isGlobal);
        setKeyword(rule.keyword);
        setCategoryId(rule.category.id);
        setSaveError('');
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!keyword.trim() || !categoryId) {
            setSaveError('Lykliorð og flokkur eru nauðsynleg.');
            return;
        }
        setSaving(true);
        setSaveError('');
        try {
            let resp;
            if (editRule) {
                resp = await fetch(`${API_URL}/CategoryRule/update/${editRule.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId }),
                });
            } else {
                resp = await fetch(`${API_URL}/CategoryRule`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: user.id, keyword: keyword.trim(), category_id: categoryId, is_global: editGlobal }),
                });
            }
            if (resp.ok) {
                setDialogOpen(false);
                load();
            } else {
                const data = await resp.json();
                setSaveError(data.detail || 'Villa við vistun.');
            }
        } catch {
            setSaveError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteRule) return;
        setDeleting(true);
        try {
            const resp = await fetch(`${API_URL}/CategoryRule/delete/${deleteRule.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (resp.ok) {
                setDeleteRule(null);
                load();
            }
        } catch {
            // ignore
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress color="secondary" /></Box>;

    return (
        <Box sx={{ p: 3, maxWidth: 800 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h6" fontWeight={600}>Flokkunarreglur</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Reglur sem nota lykliorð til að flokka færslur sjálfkrafa við innflutning.
                    </Typography>
                </Box>
                <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={() => openCreate(false)}>
                    + Ný regla
                </Button>
            </Box>

            {/* Association rules */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#08C076', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                REGLUR ÞESSA FÉLAGS
            </Typography>
            <RulesTable
                rules={assocRules}
                isGlobal={false}
                canEdit
                onEdit={r => openEdit(r, false)}
                onDelete={r => setDeleteRule(r)}
            />

            {/* Global rules */}
            <Typography variant="caption" sx={{ fontWeight: 600, color: '#aaa', letterSpacing: 0.5, display: 'block', mt: 3, mb: 1 }}>
                ALMENNAR REGLUR
            </Typography>
            <RulesTable
                rules={globalRules}
                isGlobal
                canEdit={!!user?.is_superadmin}
                onEdit={r => openEdit(r, true)}
                onDelete={r => setDeleteRule(r)}
            />

            {user?.is_superadmin && (
                <Button variant="outlined" color="secondary" size="small" sx={{ mt: 2 }} onClick={() => openCreate(true)}>
                    + Almenn regla
                </Button>
            )}

            {/* Create/Edit dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editRule ? 'Breyta reglu' : 'Ný regla'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <TextField
                        label="Lykliorð" value={keyword} size="small" fullWidth autoFocus
                        onChange={e => setKeyword(e.target.value)}
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Flokkur</InputLabel>
                        <Select value={categoryId} label="Flokkur" onChange={e => setCategoryId(e.target.value)}>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                    {saveError && <Alert severity="error">{saveError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDialogOpen(false)}>Hætta við</Button>
                    <Button variant="contained" color="secondary" sx={{ color: '#fff' }} onClick={handleSave} disabled={saving}>
                        {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete confirm dialog */}
            <Dialog open={!!deleteRule} onClose={() => setDeleteRule(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Eyða reglu</DialogTitle>
                <DialogContent>
                    <Typography>Ertu viss um að þú viljir eyða reglunni <strong>"{deleteRule?.keyword}"</strong>?</Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteRule(null)}>Hætta við</Button>
                    <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <CircularProgress size={18} color="inherit" /> : 'Eyða'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

function RulesTable({ rules, isGlobal, canEdit, onEdit, onDelete }) {
    if (rules.length === 0) {
        return (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {isGlobal ? 'Engar almennar reglur skráðar.' : 'Engar reglur skráðar fyrir þetta félag.'}
            </Typography>
        );
    }

    return (
        <Table size="small" sx={{ mb: 1 }}>
            <TableHead>
                <TableRow sx={{ '& th': { color: '#555', fontWeight: 500, borderBottom: '2px solid #eee' } }}>
                    <TableCell>Lykliorð</TableCell>
                    <TableCell>Flokkur</TableCell>
                    <TableCell />
                </TableRow>
            </TableHead>
            <TableBody>
                {rules.map(rule => (
                    <TableRow key={rule.id} sx={{ '& td': { borderBottom: '1px solid #f0f0f0' } }}>
                        <TableCell sx={{ fontFamily: 'monospace', color: isGlobal ? '#888' : '#333' }}>
                            {rule.keyword}
                        </TableCell>
                        <TableCell>
                            <Box component="span" sx={{
                                background: isGlobal ? '#f5f5f5' : '#e8f5e9',
                                color: isGlobal ? '#888' : '#2e7d32',
                                px: 1, py: 0.25, borderRadius: 3, fontSize: 12,
                            }}>
                                {rule.category.name}
                            </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {canEdit && (
                                <>
                                    <Typography
                                        component="span"
                                        sx={{ color: '#aaa', cursor: 'pointer', fontSize: 12, mr: 1, '&:hover': { color: '#555' } }}
                                        onClick={() => onEdit(rule)}
                                    >
                                        Breyta
                                    </Typography>
                                    <Typography
                                        component="span"
                                        sx={{ color: '#e57373', cursor: 'pointer', fontSize: 12, '&:hover': { color: '#c62828' } }}
                                        onClick={() => onDelete(rule)}
                                    >
                                        Eyða
                                    </Typography>
                                </>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
