import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, CircularProgress, Paper,
    Table, TableHead, TableRow, TableCell, TableBody,
    Button, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, Alert, MenuItem, Select, FormControl,
    InputLabel, TextField,
} from '@mui/material';
import { UserContext } from './UserContext';
import SideBar from './Sidebar';
import { fmtAmount } from '../format';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const STATUS_LABELS = {
    IMPORTED:    { label: 'Óflokkað', color: 'warning' },
    CATEGORISED: { label: 'Flokkað',  color: 'success' },
    RECONCILED:  { label: 'Jafnað',   color: 'default' },
};

function TransactionsPage() {
    const navigate = useNavigate();
    const { user, assocParam } = React.useContext(UserContext);
    const [transactions, setTransactions] = useState(undefined);
    const [bankAccounts, setBankAccounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [filterBankAccount, setFilterBankAccount] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [importBankAccountId, setImportBankAccountId] = useState('');
    const [importBank, setImportBank] = useState('arion');
    const [importError, setImportError] = useState('');
    const [importUploading, setImportUploading] = useState(false);
    const [importConfirming, setImportConfirming] = useState(false);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadAll();
    }, [user, assocParam, year]);

    const loadAll = async () => {
        setTransactions(undefined);
        try {
            const params = new URLSearchParams({ year });
            const queryString = assocParam ? `${assocParam}&${params}` : `?${params}`;
            const [txResp, bankResp, catResp] = await Promise.all([
                fetch(`${API_URL}/Transaction/${user.id}${queryString}`),
                fetch(`${API_URL}/BankAccount/${user.id}${assocParam}`),
                fetch(`${API_URL}/Category/list`),
            ]);
            if (txResp.ok) setTransactions(await txResp.json());
            else { setError('Villa við að sækja færslur.'); setTransactions([]); }
            if (bankResp.ok) setBankAccounts(await bankResp.json());
            if (catResp.ok) setCategories(await catResp.json());
        } catch {
            setError('Tenging við þjón mistókst.');
            setTransactions([]);
        }
    };

    const reloadTransactions = async () => {
        try {
            const params = new URLSearchParams({ year });
            const queryString = assocParam ? `${assocParam}&${params}` : `?${params}`;
            const resp = await fetch(`${API_URL}/Transaction/${user.id}${queryString}`);
            if (resp.ok) setTransactions(await resp.json());
        } catch {}
    };

    if (transactions === undefined) {
        return (
            <div className="dashboard">
                <SideBar />
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8, flex: 1 }}>
                    <CircularProgress color="secondary" />
                </Box>
            </div>
        );
    }

    const filtered = transactions.filter(tx => {
        if (filterBankAccount && String(tx.bank_account.id) !== String(filterBankAccount)) return false;
        if (filterStatus && tx.status !== filterStatus) return false;
        return true;
    });

    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

    return (
        <div className="dashboard">
            <SideBar />
            <Box sx={{ p: 4, flex: 1, overflowY: 'auto', minWidth: 0 }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h5">Færslur {year}</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <FormControl size="small">
                            <Select value={year} onChange={e => setYear(e.target.value)}>
                                {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined" color="secondary"
                            onClick={() => { setShowImport(v => !v); setShowForm(false); setImportPreview(null); setImportError(''); }}
                        >
                            {showImport ? 'Loka' : '+ Innflutningur'}
                        </Button>
                        <Button
                            variant="contained" color="secondary" sx={{ color: '#fff' }}
                            onClick={() => { setShowForm(v => !v); setShowImport(false); setImportError(''); }}
                        >
                            {showForm ? 'Loka' : '+ Færsla'}
                        </Button>
                    </Box>
                </Box>

                {/* Add transaction form */}
                {showForm && (
                    <AddTransactionForm
                        userId={user.id}
                        assocParam={assocParam}
                        bankAccounts={bankAccounts}
                        categories={categories}
                        onCreated={() => { setShowForm(false); reloadTransactions(); }}
                    />
                )}

                {/* Import form / preview */}
                {showImport && !importPreview && (
                    <ImportForm
                        userId={user.id}
                        assocParam={assocParam}
                        bankAccounts={bankAccounts}
                        importBankAccountId={importBankAccountId}
                        setImportBankAccountId={setImportBankAccountId}
                        importBank={importBank}
                        setImportBank={setImportBank}
                        uploading={importUploading}
                        setUploading={setImportUploading}
                        error={importError}
                        setError={setImportError}
                        onPreviewReady={(preview) => setImportPreview(preview)}
                    />
                )}
                {showImport && importPreview && (
                    <ImportPreview
                        preview={importPreview}
                        userId={user.id}
                        assocParam={assocParam}
                        bankAccountId={importBankAccountId}
                        confirming={importConfirming}
                        setConfirming={setImportConfirming}
                        error={importError}
                        setError={setImportError}
                        onBack={() => setImportPreview(null)}
                        onDone={() => {
                            setShowImport(false);
                            setImportPreview(null);
                            setImportBankAccountId('');
                            setImportBank('arion');
                            loadAll();
                        }}
                    />
                )}

                {/* Filter bar */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Bankareikningur</InputLabel>
                        <Select
                            value={filterBankAccount}
                            label="Bankareikningur"
                            onChange={e => setFilterBankAccount(e.target.value)}
                        >
                            <MenuItem value="">Allir reikningar</MenuItem>
                            {bankAccounts.map(b => (
                                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Staða</InputLabel>
                        <Select
                            value={filterStatus}
                            label="Staða"
                            onChange={e => setFilterStatus(e.target.value)}
                        >
                            <MenuItem value="">Allar stöður</MenuItem>
                            <MenuItem value="IMPORTED">Óflokkað</MenuItem>
                            <MenuItem value="CATEGORISED">Flokkað</MenuItem>
                            <MenuItem value="RECONCILED">Jafnað</MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {filtered.length === 0 ? (
                    <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
                        Engar færslur fundust.
                    </Typography>
                ) : (
                    <Paper variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                                    <TableCell>Dagsetning</TableCell>
                                    <TableCell>Lýsing</TableCell>
                                    <TableCell>Reikningur</TableCell>
                                    <TableCell>Flokkur</TableCell>
                                    <TableCell align="right">Upphæð</TableCell>
                                    <TableCell>Staða</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filtered.map(tx => (
                                    <TransactionRow
                                        key={tx.id}
                                        transaction={tx}
                                        userId={user.id}
                                        assocParam={assocParam}
                                        categories={categories}
                                        onUpdated={reloadTransactions}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </Paper>
                )}
            </Box>
        </div>
    );
}

function TransactionRow({ transaction: tx, userId, assocParam, categories, onUpdated }) {
    const [categoriseOpen, setCategoriseOpen] = useState(false);
    const amount = parseFloat(tx.amount);
    const statusInfo = STATUS_LABELS[tx.status] || { label: tx.status, color: 'default' };

    const dateObj = new Date(tx.date);
    const dateStr = dateObj.toLocaleDateString('is-IS', { day: 'numeric', month: 'long' });

    return (
        <>
            <TableRow
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => setCategoriseOpen(true)}
            >
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{dateStr}</TableCell>
                <TableCell>{tx.description}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{tx.bank_account.name}</TableCell>
                <TableCell>
                    {tx.category
                        ? <Chip label={tx.category.name} size="small" variant="outlined" />
                        : <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>Óflokkað</Typography>}
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: amount >= 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
                    {amount >= 0 ? '+' : ''}{fmtAmount(amount)} kr.
                </TableCell>
                <TableCell>
                    <Chip label={statusInfo.label} size="small" color={statusInfo.color} />
                </TableCell>
            </TableRow>
            <CategoriseDialog
                open={categoriseOpen}
                onClose={() => setCategoriseOpen(false)}
                transaction={tx}
                userId={userId}
                assocParam={assocParam}
                categories={categories}
                onSaved={() => { setCategoriseOpen(false); onUpdated(); }}
            />
        </>
    );
}

function CategoriseDialog({ open, onClose, transaction: tx, userId, assocParam, categories, onSaved }) {
    const [categoryId, setCategoryId] = useState(tx.category?.id || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (open) { setCategoryId(tx.category?.id || ''); setError(''); }
    }, [open, tx]);

    const handleSave = async () => {
        if (!categoryId) return;
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Transaction/categorise/${tx.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, category_id: categoryId }),
            });
            if (resp.ok) onSaved();
            else { const data = await resp.json(); setError(data.detail || 'Villa við vistun.'); }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Flokka færslu</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                <Box>
                    <Typography variant="body2" fontWeight={500}>{tx.description}</Typography>
                    <Typography variant="caption" color="text.secondary">{tx.date}</Typography>
                </Box>
                <FormControl size="small" fullWidth>
                    <InputLabel>Flokkur</InputLabel>
                    <Select
                        value={categoryId}
                        label="Flokkur"
                        onChange={e => setCategoryId(e.target.value)}
                    >
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {categories.map(c => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {error && <Alert severity="error">{error}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Hætta við</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={!categoryId || saving} onClick={handleSave}
                >
                    {saving ? <CircularProgress size={18} color="inherit" /> : 'Vista'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function AddTransactionForm({ userId, assocParam, bankAccounts, categories, onCreated }) {
    const [bankAccountId, setBankAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reference, setReference] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isValid = bankAccountId && date && amount && !isNaN(parseFloat(amount)) && description.trim();

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await fetch(`${API_URL}/Transaction${assocParam}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    bank_account_id: bankAccountId,
                    date,
                    amount,
                    description: description.trim(),
                    reference: reference.trim(),
                    category_id: categoryId || null,
                }),
            });
            if (resp.ok) {
                setBankAccountId(''); setDate(new Date().toISOString().slice(0, 10));
                setAmount(''); setDescription(''); setReference(''); setCategoryId('');
                onCreated();
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við skráningu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2">Ný færsla</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                    label="Dagsetning" type="date" value={date}
                    onChange={e => setDate(e.target.value)}
                    size="small" InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                />
                <TextField
                    label="Upphæð" type="number" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    size="small" sx={{ width: 140 }}
                    placeholder="-50000"
                    helperText="Neikvætt = útgjöld"
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Bankareikningur</InputLabel>
                    <Select value={bankAccountId} label="Bankareikningur" onChange={e => setBankAccountId(e.target.value)}>
                        <MenuItem value=""><em>Veldu reikning</em></MenuItem>
                        {bankAccounts.map(b => (
                            <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <TextField
                    label="Lýsing" value={description}
                    onChange={e => setDescription(e.target.value)}
                    size="small" sx={{ flex: 1, minWidth: 200 }}
                />
                <TextField
                    label="Tilvísun (valfrjálst)" value={reference}
                    onChange={e => setReference(e.target.value)}
                    size="small" sx={{ width: 160 }}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Flokkur (valfrjálst)</InputLabel>
                    <Select value={categoryId} label="Flokkur (valfrjálst)" onChange={e => setCategoryId(e.target.value)}>
                        <MenuItem value=""><em>Enginn</em></MenuItem>
                        {categories.map(c => (
                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || saving} onClick={handleSubmit}
            >
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Skrá færslu'}
            </Button>
        </Paper>
    );
}

const BANK_OPTIONS = [
    { value: 'arion',        label: 'Arion banki' },
    { value: 'landsbankinn', label: 'Landsbankinn' },
    { value: 'islandsbanki', label: 'Íslandsbanki' },
];

function ImportForm({
    userId, assocParam, bankAccounts,
    importBankAccountId, setImportBankAccountId,
    importBank, setImportBank,
    uploading, setUploading, error, setError,
    onPreviewReady,
}) {
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = React.useRef();

    const isValid = importBankAccountId && importBank && file;

    const handleFile = (f) => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx'].includes(ext)) {
            setError('Aðeins .csv og .xlsx skrár eru studdar.');
            return;
        }
        setError('');
        setFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    };

    const handleSubmit = async () => {
        setError('');
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('user_id', userId);
            formData.append('bank_account_id', importBankAccountId);
            formData.append('bank', importBank);
            formData.append('file', file);
            const resp = await fetch(`${API_URL}/Import/preview`, {
                method: 'POST',
                body: formData,
            });
            const data = await resp.json();
            if (resp.ok) {
                onPreviewReady(data);
            } else {
                setError(data.detail || 'Villa við lestur skráar.');
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        } catch {
            setError('Tenging við þjón mistókst.');
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setUploading(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 520 }}>
            <Typography variant="subtitle2">Flytja inn bankayfirlit</Typography>
            <FormControl size="small" fullWidth>
                <InputLabel>Bankareikningur</InputLabel>
                <Select value={importBankAccountId} label="Bankareikningur"
                    onChange={e => setImportBankAccountId(e.target.value)}>
                    <MenuItem value=""><em>Veldu reikning</em></MenuItem>
                    {bankAccounts.map(b => (
                        <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
                <InputLabel>Banki</InputLabel>
                <Select value={importBank} label="Banki" onChange={e => setImportBank(e.target.value)}>
                    {BANK_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <Box
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                    border: `2px dashed ${dragOver ? '#08C076' : '#ddd'}`,
                    borderRadius: 1, p: 3, textAlign: 'center',
                    cursor: 'pointer', color: 'text.secondary',
                    transition: 'border-color 0.2s',
                    '&:hover': { borderColor: '#08C076' },
                }}
            >
                <input
                    ref={fileInputRef} type="file" accept=".csv,.xlsx" hidden
                    onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
                />
                {file
                    ? <Typography variant="body2" color="success.main">{file.name}</Typography>
                    : <Typography variant="body2">Dragðu skrá hingað eða <span style={{ color: '#08C076' }}>veldu skrá</span><br /><small>.csv eða .xlsx</small></Typography>
                }
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || uploading} onClick={handleSubmit}
            >
                {uploading ? <CircularProgress size={20} color="inherit" /> : 'Greina skrá →'}
            </Button>
        </Paper>
    );
}

function ImportPreview({
    preview, userId, assocParam, bankAccountId,
    confirming, setConfirming, error, setError,
    onBack, onDone,
}) {
    const handleConfirm = async () => {
        setError('');
        setConfirming(true);
        try {
            const resp = await fetch(`${API_URL}/Import/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    bank_account_id: bankAccountId,
                    rows: preview.rows,
                }),
            });
            const data = await resp.json();
            if (resp.ok) {
                onDone();
            } else {
                setError(data.detail || 'Villa við innflutning.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, maxWidth: 640 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Yfirlit innflutnings — staðfesta?</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ flex: 1, bgcolor: '#f0f9f4', borderRadius: 1, p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" color="success.main" fontWeight={600}>{preview.to_import}</Typography>
                    <Typography variant="caption" color="text.secondary">Færslur til að flytja inn</Typography>
                </Box>
                <Box sx={{ flex: 1, bgcolor: '#f5f5f5', borderRadius: 1, p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" color="text.disabled" fontWeight={600}>{preview.skipped_duplicates}</Typography>
                    <Typography variant="caption" color="text.secondary">Þegar til (sleppt)</Typography>
                </Box>
            </Box>
            <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                        <TableCell>Dagsetning</TableCell>
                        <TableCell>Lýsing</TableCell>
                        <TableCell align="right">Upphæð</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {preview.rows.slice(0, 10).map((row, i) => {
                        const amt = parseFloat(row.amount);
                        return (
                            <TableRow key={i}>
                                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{row.date}</TableCell>
                                <TableCell>{row.description}</TableCell>
                                <TableCell align="right" sx={{
                                    fontFamily: 'monospace',
                                    color: amt >= 0 ? 'success.main' : 'error.main',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {amt >= 0 ? '+' : ''}{fmtAmount(amt)} kr.
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {preview.rows.length > 10 && (
                        <TableRow>
                            <TableCell colSpan={3} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                … {preview.rows.length - 10} færslur til viðbótar
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={onBack} disabled={confirming}>Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={preview.to_import === 0 || confirming} onClick={handleConfirm}
                >
                    {confirming
                        ? <CircularProgress size={18} color="inherit" />
                        : `Staðfesta innflutning (${preview.to_import})`}
                </Button>
            </Box>
        </Paper>
    );
}

export default TransactionsPage;
