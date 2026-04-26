# Registration Request Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users without association access submit a registration request, and give superadmins a task panel to review and create associations from those requests.

**Architecture:** A new `RegistrationRequest` model stores the submitted details. Two new backend endpoints handle create (any authenticated user) and list (superadmin only). The frontend adds a CTA in `NoAssociationView`, a dedicated registration page, and a pending-requests panel in `SuperAdminPage` that prefills `CreateAssociationDialog` on review.

**Tech Stack:** Django 4.1 / DRF 3.14, pytest-django, React 17, MUI v5, React Router v6

---

### Task 1: Backend model + migration

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create: migration via `makemigrations` (auto-generated)

- [ ] **Step 1: Add `RegistrationRequest` model to `associations/models.py`**

Add at the bottom of the file, after `AssociationBankSettings` (or any last model):

```python
class RegistrationRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    REVIEWED = "REVIEWED", "Reviewed"


class RegistrationRequest(models.Model):
    """Submitted by a logged-in user who has no association access yet."""
    submitted_by = models.ForeignKey(
        "users.User", on_delete=models.CASCADE, related_name="registration_requests"
    )
    assoc_ssn = models.CharField(max_length=10)   # kennitala, no hyphens
    assoc_name = models.CharField(max_length=255)
    chair_ssn = models.CharField(max_length=10)   # kennitala, no hyphens
    chair_name = models.CharField(max_length=255)
    chair_email = models.EmailField()
    chair_phone = models.CharField(max_length=20)
    status = models.CharField(
        max_length=10,
        choices=RegistrationRequestStatus.choices,
        default=RegistrationRequestStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "associations_registrationrequest"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.assoc_name} ({self.assoc_ssn}) — {self.status}"
```

- [ ] **Step 2: Generate migration**

```bash
cd HusfelagPy
poetry run python3 manage.py makemigrations associations --name add_registration_request
```

Expected output: `Migrations for 'associations': associations/migrations/XXXX_add_registration_request.py`

- [ ] **Step 3: Apply migration**

```bash
poetry run python3 manage.py migrate
```

Expected: `Applying associations.XXXX_add_registration_request... OK`

- [ ] **Step 4: Commit**

```bash
git add HusfelagPy/associations/models.py HusfelagPy/associations/migrations/
git commit -m "feat: add RegistrationRequest model"
```

---

### Task 2: Backend views + URLs

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`

- [ ] **Step 1: Write failing tests**

Create `HusfelagPy/associations/tests/test_registration_request.py`:

```python
import pytest
from django.test import TestCase
from rest_framework.test import APIClient
from users.models import User
from associations.models import RegistrationRequest


@pytest.fixture
def superadmin(db):
    return User.objects.create(
        kennitala="0000000001", name="Admin", email="admin@test.is",
        phone="111 1111", is_superadmin=True,
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create(
        kennitala="0000000002", name="User", email="user@test.is",
        phone="222 2222", is_superadmin=False,
    )


@pytest.fixture
def auth_client(regular_user):
    client = APIClient()
    client.force_authenticate(user=regular_user)
    return client, regular_user


@pytest.fixture
def admin_client(superadmin):
    client = APIClient()
    client.force_authenticate(user=superadmin)
    return client, superadmin


VALID_PAYLOAD = {
    "assoc_ssn": "5512131230",
    "assoc_name": "Húsfélag Brekku 5",
    "chair_ssn": "1234567890",
    "chair_name": "Jón Jónsson",
    "chair_email": "jon@test.is",
    "chair_phone": "123 4567",
}


def test_create_registration_request(auth_client):
    client, user = auth_client
    resp = client.post("/RegistrationRequest", VALID_PAYLOAD, format="json")
    assert resp.status_code == 201
    assert RegistrationRequest.objects.filter(submitted_by=user).count() == 1


def test_create_requires_auth(db):
    client = APIClient()
    resp = client.post("/RegistrationRequest", VALID_PAYLOAD, format="json")
    assert resp.status_code == 401


def test_create_validates_ssn_length(auth_client):
    client, _ = auth_client
    payload = {**VALID_PAYLOAD, "assoc_ssn": "123"}
    resp = client.post("/RegistrationRequest", payload, format="json")
    assert resp.status_code == 400


def test_admin_list_pending(admin_client, regular_user, db):
    client, _ = admin_client
    RegistrationRequest.objects.create(
        submitted_by=regular_user, **VALID_PAYLOAD
    )
    resp = client.get("/admin/RegistrationRequest")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["assoc_ssn"] == "5512131230"


def test_admin_list_requires_superadmin(auth_client):
    client, _ = auth_client
    resp = client.get("/admin/RegistrationRequest")
    assert resp.status_code == 403


def test_admin_mark_reviewed(admin_client, regular_user, db):
    client, _ = admin_client
    req = RegistrationRequest.objects.create(submitted_by=regular_user, **VALID_PAYLOAD)
    resp = client.patch(f"/admin/RegistrationRequest/{req.id}", {"status": "REVIEWED"}, format="json")
    assert resp.status_code == 200
    req.refresh_from_db()
    assert req.status == "REVIEWED"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy
poetry run pytest associations/tests/test_registration_request.py -v
```

Expected: several errors (`No module named`, `404 != 201`, etc.)

- [ ] **Step 3: Add views to `associations/views.py`**

After the existing imports (after `from users.models import User`), add this import:

```python
from .models import (
    ...existing...,
    RegistrationRequest, RegistrationRequestStatus,
)
```

(Add `RegistrationRequest, RegistrationRequestStatus` to the existing models import tuple.)

Then add two view classes at the bottom of `views.py`:

```python
class RegistrationRequestView(APIView):
    """POST /RegistrationRequest — any authenticated user may submit."""

    def post(self, request):
        data = request.data
        assoc_ssn = str(data.get("assoc_ssn", "")).replace("-", "")
        chair_ssn = str(data.get("chair_ssn", "")).replace("-", "")

        if len(assoc_ssn) != 10:
            return Response({"detail": "Kennitala húsfélags verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        if len(chair_ssn) != 10:
            return Response({"detail": "Kennitala formanns verður að vera 10 tölustafir."}, status=status.HTTP_400_BAD_REQUEST)
        for field in ("assoc_name", "chair_name", "chair_email", "chair_phone"):
            if not str(data.get(field, "")).strip():
                return Response({"detail": f"Reitur '{field}' vantar."}, status=status.HTTP_400_BAD_REQUEST)

        RegistrationRequest.objects.create(
            submitted_by=request.user,
            assoc_ssn=assoc_ssn,
            assoc_name=str(data["assoc_name"]).strip(),
            chair_ssn=chair_ssn,
            chair_name=str(data["chair_name"]).strip(),
            chair_email=str(data["chair_email"]).strip(),
            chair_phone=str(data["chair_phone"]).strip(),
        )
        return Response({"detail": "Beiðni móttekin."}, status=status.HTTP_201_CREATED)


class AdminRegistrationRequestView(APIView):
    """GET /admin/RegistrationRequest — list pending; PATCH /<id> — mark reviewed."""

    def get(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        qs = RegistrationRequest.objects.filter(status=RegistrationRequestStatus.PENDING).select_related("submitted_by")
        result = [
            {
                "id": r.id,
                "assoc_ssn": r.assoc_ssn,
                "assoc_name": r.assoc_name,
                "chair_ssn": r.chair_ssn,
                "chair_name": r.chair_name,
                "chair_email": r.chair_email,
                "chair_phone": r.chair_phone,
                "submitted_by": r.submitted_by.name,
                "created_at": r.created_at.isoformat(),
            }
            for r in qs
        ]
        return Response(result)

    def patch(self, request, req_id):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        try:
            reg_req = RegistrationRequest.objects.get(pk=req_id)
        except RegistrationRequest.DoesNotExist:
            return Response({"detail": "Beiðni finnst ekki."}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get("status")
        if new_status not in RegistrationRequestStatus.values:
            return Response({"detail": "Óþekkt staða."}, status=status.HTTP_400_BAD_REQUEST)
        reg_req.status = new_status
        reg_req.save(update_fields=["status"])
        return Response({"detail": "Staða uppfærð."})
```

- [ ] **Step 4: Add URLs to `associations/urls.py`**

Add these imports at the top:

```python
from .views import (
    ...existing...,
    RegistrationRequestView, AdminRegistrationRequestView,
)
```

Add these paths to `urlpatterns`:

```python
path("RegistrationRequest", RegistrationRequestView.as_view(), name="registration-request-create"),
path("admin/RegistrationRequest", AdminRegistrationRequestView.as_view(), name="admin-registration-request-list"),
path("admin/RegistrationRequest/<int:req_id>", AdminRegistrationRequestView.as_view(), name="admin-registration-request-update"),
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd HusfelagPy
poetry run pytest associations/tests/test_registration_request.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests/
git commit -m "feat: RegistrationRequest endpoints (POST create, GET+PATCH admin)"
```

---

### Task 3: Frontend — CTA in `NoAssociationView` + new route

**Files:**
- Modify: `HusfelagJS/src/App.js`
- Create: `HusfelagJS/src/controlers/RegistrationRequestPage.js`

- [ ] **Step 1: Add `/skraning` to the route list and update `NoAssociationView` in `App.js`**

In `App.js`, add the import at the top:

```js
import RegistrationRequestPage from './controlers/RegistrationRequestPage';
```

Replace the existing `NoAssociationView` function with:

```js
function NoAssociationView() {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100vh', background: '#1D366F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ background: '#fff', borderRadius: 2, p: '40px 36px', maxWidth: 420, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <img src={require('./assets/images/logo/logo-color.png')} alt="Húsfélag" style={{ width: 140, marginBottom: 24 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1D366F', mb: 1 }}>
          Ekki skráð/ur í húsfélag
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Þú ert ekki skráð/ur í neitt húsfélag. Hafðu samband við formann húsfélags þíns til að fá aðgang, eða skráðu húsfélag þitt.
        </Typography>
        <Button
          variant="contained"
          sx={{ backgroundColor: '#08C076', color: '#fff', fontWeight: 600, textTransform: 'none', '&:hover': { backgroundColor: '#06a866' } }}
          onClick={() => navigate('/skraning')}
        >
          Skrá húsfélag
        </Button>
      </Box>
    </Box>
  );
}
```

Note: `useNavigate` is already imported in `App.js` via react-router-dom — verify and add if missing.

Add this route inside `<Routes>` (after the `/profile` route):

```jsx
<Route path="/skraning" element={<ProtectedRoute><RegistrationRequestPage /></ProtectedRoute>} />
```

Also update `ProtectedRoute` — add `/skraning` to the routes that are valid without an association:

```js
const isAdminRoute = location.pathname.startsWith('/superadmin') ||
                     location.pathname.startsWith('/admin') ||
                     location.pathname.startsWith('/profile') ||
                     location.pathname.startsWith('/skraning');
```

- [ ] **Step 2: Create `RegistrationRequestPage.js`**

Create `HusfelagJS/src/controlers/RegistrationRequestPage.js`:

```js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button, Paper, Alert, CircularProgress,
} from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function RegistrationRequestPage() {
    const navigate = useNavigate();
    const { user } = React.useContext(UserContext);

    const [assocSsn, setAssocSsn] = useState('');
    const [assocName, setAssocName] = useState('');
    const [chairSsn, setChairSsn] = useState('');
    const [chairName, setChairName] = useState('');
    const [chairEmail, setChairEmail] = useState('');
    const [chairPhone, setChairPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);

    if (!user) {
        navigate('/login');
        return null;
    }

    const fmtSsn = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 10);
        return digits.length > 6 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : digits;
    };

    const handlePhoneChange = (val) => {
        const digits = val.replace(/\D/g, '').slice(0, 7);
        setChairPhone(digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits);
    };

    const ssnDigits = (s) => s.replace(/\D/g, '');

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chairEmail.trim());
    const phoneValid = ssnDigits(chairPhone).length === 7;
    const isValid =
        ssnDigits(assocSsn).length === 10 &&
        assocName.trim().length > 0 &&
        ssnDigits(chairSsn).length === 10 &&
        chairName.trim().length > 0 &&
        emailValid &&
        phoneValid;

    const handleSubmit = async () => {
        setError('');
        setSaving(true);
        try {
            const resp = await apiFetch(`${API_URL}/RegistrationRequest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assoc_ssn: ssnDigits(assocSsn),
                    assoc_name: assocName.trim(),
                    chair_ssn: ssnDigits(chairSsn),
                    chair_name: chairName.trim(),
                    chair_email: chairEmail.trim(),
                    chair_phone: chairPhone.trim(),
                }),
            });
            if (resp.ok) {
                setSubmitted(true);
            } else {
                const data = await resp.json();
                setError(data.detail || 'Villa við sendingu.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setSaving(false);
        }
    };

    if (submitted) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
                <Paper variant="outlined" sx={{ p: 4, maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'center' }}>
                    <Typography variant="h5">Beiðni móttekin</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Umsóknin þín um skráningu húsfélags hefur verið móttekin. Kerfisstjóri mun fara yfir hana og hafa samband.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate('/')}>Til baka</Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
            <Paper variant="outlined" sx={{ p: 4, maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box>
                    <Typography variant="h5" gutterBottom>Skrá húsfélag</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Fylltu út upplýsingar um húsfélagið og formanninn. Kerfisstjóri mun fara yfir beiðnina.
                    </Typography>
                </Box>

                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1D366F', mb: -1 }}>Húsfélag</Typography>
                <TextField
                    label="Kennitala húsfélags"
                    value={assocSsn}
                    onChange={e => setAssocSsn(fmtSsn(e.target.value))}
                    size="small" fullWidth placeholder="000000-0000"
                    error={assocSsn.length > 0 && ssnDigits(assocSsn).length !== 10}
                    helperText={assocSsn.length > 0 && ssnDigits(assocSsn).length !== 10 ? 'Kennitala verður að vera 10 tölustafir' : ''}
                />
                <TextField
                    label="Nafn húsfélags"
                    value={assocName}
                    onChange={e => setAssocName(e.target.value)}
                    size="small" fullWidth
                />

                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1D366F', mb: -1 }}>Formaður</Typography>
                <TextField
                    label="Kennitala formanns"
                    value={chairSsn}
                    onChange={e => setChairSsn(fmtSsn(e.target.value))}
                    size="small" fullWidth placeholder="000000-0000"
                    error={chairSsn.length > 0 && ssnDigits(chairSsn).length !== 10}
                    helperText={chairSsn.length > 0 && ssnDigits(chairSsn).length !== 10 ? 'Kennitala verður að vera 10 tölustafir' : ''}
                />
                <TextField
                    label="Nafn formanns"
                    value={chairName}
                    onChange={e => setChairName(e.target.value)}
                    size="small" fullWidth
                />
                <TextField
                    label="Netfang formanns"
                    type="email"
                    value={chairEmail}
                    onChange={e => setChairEmail(e.target.value)}
                    size="small" fullWidth
                    error={chairEmail.length > 0 && !emailValid}
                    helperText={chairEmail.length > 0 && !emailValid ? 'Netfang er ekki gilt' : ''}
                />
                <TextField
                    label="Símanúmer formanns"
                    value={chairPhone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    size="small" fullWidth
                    inputProps={{ inputMode: 'tel', placeholder: '000 0000' }}
                    error={chairPhone.length > 0 && !phoneValid}
                    helperText={chairPhone.length > 0 && !phoneValid ? 'Símanúmer verður að vera 7 tölustafir' : ''}
                />

                {error && <Alert severity="error">{error}</Alert>}

                <Button
                    variant="contained"
                    sx={{ backgroundColor: '#08C076', color: '#fff', fontWeight: 600, textTransform: 'none', '&:hover': { backgroundColor: '#06a866' } }}
                    disabled={!isValid || saving}
                    onClick={handleSubmit}
                >
                    {saving ? <CircularProgress size={20} color="inherit" /> : 'Senda beiðni'}
                </Button>
                <Button variant="text" size="small" onClick={() => navigate(-1)} sx={{ color: 'text.secondary' }}>
                    Til baka
                </Button>
            </Paper>
        </Box>
    );
}

export default RegistrationRequestPage;
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd HusfelagJS
npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
git add HusfelagJS/src/App.js HusfelagJS/src/controlers/RegistrationRequestPage.js
git commit -m "feat: registration request page + CTA in NoAssociationView"
```

---

### Task 4: Frontend — Superadmin pending requests panel

**Files:**
- Modify: `HusfelagJS/src/controlers/SuperAdminPage.js`

The `CreateAssociationDialog` needs to accept two optional props (`initialAssocSsn`, `initialChairSsn`) and auto-trigger the lookup when `initialAssocSsn` is provided. A new `PendingRequestsPanel` fetches pending requests and lets the superadmin open the dialog prefilled.

- [ ] **Step 1: Update `CreateAssociationDialog` to accept prefill props**

In `SuperAdminPage.js`, change `CreateAssociationDialog`'s function signature from:

```js
function CreateAssociationDialog({ open, onClose, user, onCreated }) {
```

to:

```js
function CreateAssociationDialog({ open, onClose, user, onCreated, initialAssocSsn = '', initialChairSsn = '' }) {
```

Add a `useEffect` that fires the lookup when the dialog opens with a pre-filled association SSN. Add it after the `reset` function definition:

```js
React.useEffect(() => {
    if (open && initialAssocSsn) {
        setAssocSsn(initialAssocSsn);
        if (initialChairSsn) setCustomChairSsn(initialChairSsn);
    }
}, [open]); // eslint-disable-line react-hooks/exhaustive-deps
```

And a second `useEffect` to auto-trigger lookup once `assocSsn` is set from the prefill (fires only when assocSsn changes AND has 10 digits AND no preview yet):

```js
React.useEffect(() => {
    const digits = assocSsn.replace(/-/g, '');
    if (digits.length === 10 && !preview && !looking) {
        handleLookup();
    }
}, [assocSsn]); // eslint-disable-line react-hooks/exhaustive-deps
```

Also, in the chair selection section, when `initialChairSsn` is provided, pre-select `CUSTOM_CHAIR` so the prefilled SSN is used. Update the effect that pre-selects a single prokuruhafi:

```js
// In handleLookup, after setPreview(data):
if (!data.already_registered) {
    if (initialChairSsn) {
        setChairSelection(CUSTOM_CHAIR);
        setCustomChairSsn(initialChairSsn);
    } else if (data.prokuruhafar?.length === 1) {
        setChairSelection(data.prokuruhafar[0].national_id);
    }
}
```

- [ ] **Step 2: Add `PendingRequestsPanel` component**

Add this component after `ImpersonatePanel` and before `CreateAssociationDialog` in the file:

```js
function PendingRequestsPanel({ user, onReview }) {
    const [requests, setRequests] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(() => {
        setLoading(true);
        apiFetch(`${API_URL}/admin/RegistrationRequest`)
            .then(r => r.ok ? r.json() : [])
            .then(data => setRequests(data))
            .catch(() => setRequests([]))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => { load(); }, [load]);

    if (loading) return <CircularProgress size={20} color="secondary" />;
    if (requests.length === 0) return null;

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
                Beiðnir um skráningu húsfélags ({requests.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {requests.map(req => (
                    <Box key={req.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ flex: 1, minWidth: 200 }}>
                            <Typography variant="body2" fontWeight={600}>{req.assoc_name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Kennitala: {req.assoc_ssn} · Formaður: {req.chair_name} ({req.chair_ssn})
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {req.chair_email} · {req.chair_phone}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Sent af {req.submitted_by} · {new Date(req.created_at).toLocaleDateString('is-IS')}
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            size="small"
                            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                            onClick={() => onReview(req)}
                        >
                            Stofna húsfélag
                        </Button>
                    </Box>
                ))}
            </Box>
        </Paper>
    );
}
```

- [ ] **Step 3: Wire `PendingRequestsPanel` into `SuperAdminPage`**

In `SuperAdminPage`, add state for the prefill values and mark-reviewed callback:

```js
const [createOpen, setCreateOpen] = useState(false);
const [prefillAssocSsn, setPrefillAssocSsn] = useState('');
const [prefillChairSsn, setPrefillChairSsn] = useState('');
const [reviewingRequestId, setReviewingRequestId] = useState(null);
const pendingPanelRef = React.useRef(null);
```

Add a `handleReview` function:

```js
const handleReview = (req) => {
    setPrefillAssocSsn(req.assoc_ssn);
    setPrefillChairSsn(req.chair_ssn);
    setReviewingRequestId(req.id);
    setCreateOpen(true);
};
```

Update the `onCreated` callback of `CreateAssociationDialog` to also mark the request as reviewed:

```js
onCreated={async (assoc) => {
    if (reviewingRequestId) {
        await apiFetch(`${API_URL}/admin/RegistrationRequest/${reviewingRequestId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'REVIEWED' }),
        });
        setReviewingRequestId(null);
    }
    setPrefillAssocSsn('');
    setPrefillChairSsn('');
    setCurrentAssociation(assoc);
    setCreateOpen(false);
    navigate('/husfelag');
}}
```

Also reset prefill on close:

```js
onClose={() => {
    setCreateOpen(false);
    setPrefillAssocSsn('');
    setPrefillChairSsn('');
    setReviewingRequestId(null);
}}
```

Add `PendingRequestsPanel` to the page body (before `KpiPanel`):

```jsx
<Box sx={{ flex: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
    <PendingRequestsPanel user={user} onReview={handleReview} />
    <KpiPanel user={user} />
    <ImpersonatePanel user={user} onSelect={(assoc) => setCurrentAssociation(assoc)} />
</Box>
```

Pass prefill props to `CreateAssociationDialog`:

```jsx
<CreateAssociationDialog
    open={createOpen}
    onClose={...}
    user={user}
    onCreated={...}
    initialAssocSsn={prefillAssocSsn}
    initialChairSsn={prefillChairSsn}
/>
```

- [ ] **Step 4: Verify build**

```bash
cd HusfelagJS
npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully.`

- [ ] **Step 5: Commit**

```bash
git add HusfelagJS/src/controlers/SuperAdminPage.js
git commit -m "feat: pending registration requests panel + prefill CreateAssociationDialog"
```

---

## Self-Review

**Spec coverage:**
- ✅ `NoAssociationView` CTA → navigates to `/skraning`
- ✅ Registration page collects: assoc kennitala, assoc name, chair kennitala, chair name, chair email, chair phone
- ✅ Backend stores as `RegistrationRequest` (PENDING status)
- ✅ Superadmin task panel lists pending requests
- ✅ Superadmin CTA opens `CreateAssociationDialog` prefilled with assoc SSN + auto-triggers lookup
- ✅ Chair SSN prefilled (via `CUSTOM_CHAIR` selection)
- ✅ After association created, request is marked REVIEWED

**Placeholder scan:** None found.

**Type consistency:**
- `RegistrationRequest` model fields match payload fields in `RegistrationRequestView.post()`
- `AdminRegistrationRequestView` response keys (`assoc_ssn`, `assoc_name`, `chair_ssn`, `chair_name`, `chair_email`, `chair_phone`, `submitted_by`, `created_at`, `id`) match what `PendingRequestsPanel` reads
- `initialAssocSsn` / `initialChairSsn` prop names used consistently in `SuperAdminPage` and `CreateAssociationDialog`
