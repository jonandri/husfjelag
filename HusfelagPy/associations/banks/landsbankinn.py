import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from urllib.parse import urlencode

import requests
from django.conf import settings

from .base_provider import BankProvider
from .audit import log_api_call
from .consent_store import decrypt_token

BANK = "LANDSBANKINN"


class LandsbankinnProvider(BankProvider):
    """
    Landsbankinn AIS client — Berlin Group NextGenPSD2.
    Sandbox base: https://psd2.landsbanki.is/sandbox/v1
    """

    def _api_base(self) -> str:
        return settings.BANK_LANDSBANKINN_API_BASE

    def _auth_url(self) -> str:
        return settings.BANK_LANDSBANKINN_AUTH_URL

    def _token_url(self) -> str:
        return settings.BANK_LANDSBANKINN_TOKEN_URL

    def _client_id(self) -> str:
        return settings.BANK_LANDSBANKINN_CLIENT_ID

    def _client_secret(self) -> str:
        return settings.BANK_LANDSBANKINN_CLIENT_SECRET

    def _redirect_uri(self) -> str:
        return settings.BANK_LANDSBANKINN_REDIRECT_URI

    # ── OAuth ──────────────────────────────────────────────────────────────────

    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        params = {
            "response_type": "code",
            "client_id": self._client_id(),
            "redirect_uri": self._redirect_uri(),
            "scope": "AIS",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self._auth_url()}?{urlencode(params)}"

    def exchange_code(self, code: str, code_verifier: str) -> dict:
        """Exchange authorization code for tokens. Returns raw token response dict."""
        resp = requests.post(
            self._token_url(),
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._redirect_uri(),
                "client_id": self._client_id(),
                "client_secret": self._client_secret(),
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # ── AIS ────────────────────────────────────────────────────────────────────

    def _headers(self, access_token: str, consent_id: str) -> dict:
        return {
            "Authorization": f"Bearer {access_token}",
            "Consent-ID": consent_id,
            "X-Request-ID": str(uuid.uuid4()),
            "Accept": "application/json",
        }

    def get_accounts(self, consent) -> list[dict]:
        """
        Return list of accounts under this consent.
        Each dict has: account_id, iban, name.
        consent: BankConsent instance.
        """
        access_token = decrypt_token(consent.access_token)
        url = f"{self._api_base()}/accounts"
        resp = requests.get(
            url,
            headers=self._headers(access_token, consent.consent_id),
            timeout=15,
        )
        log_api_call(
            association=consent.association,
            bank=BANK,
            endpoint="/accounts",
            http_method="GET",
            status_code=resp.status_code,
        )
        resp.raise_for_status()
        data = resp.json()
        accounts = data.get("accounts", [])
        return [
            {
                "account_id": a.get("resourceId", a.get("iban", "")),
                "iban": a.get("iban", ""),
                "name": a.get("name", a.get("iban", "")),
            }
            for a in accounts
        ]

    def get_balance(self, consent, account_id: str) -> dict:
        access_token = decrypt_token(consent.access_token)
        url = f"{self._api_base()}/accounts/{account_id}/balances"
        resp = requests.get(
            url,
            headers=self._headers(access_token, consent.consent_id),
            timeout=15,
        )
        log_api_call(
            association=consent.association,
            bank=BANK,
            endpoint=f"/accounts/{account_id}/balances",
            http_method="GET",
            status_code=resp.status_code,
        )
        resp.raise_for_status()
        balances = resp.json().get("balances", [])
        for b in balances:
            if b.get("balanceType") == "closingBooked":
                return {
                    "account_id": account_id,
                    "amount": Decimal(str(b["balanceAmount"]["amount"])),
                    "currency": b["balanceAmount"].get("currency", "ISK"),
                }
        if balances:
            b = balances[0]
            return {
                "account_id": account_id,
                "amount": Decimal(str(b["balanceAmount"]["amount"])),
                "currency": b["balanceAmount"].get("currency", "ISK"),
            }
        return {"account_id": account_id, "amount": Decimal("0"), "currency": "ISK"}

    def get_transactions(self, consent, from_date: date, to_date: date) -> list[dict]:
        """
        Fetch booked transactions across all accounts for the given date range.
        Returns list of dicts: account_id, external_id, date, amount, description, reference.
        """
        accounts = self.get_accounts(consent)
        access_token = decrypt_token(consent.access_token)
        all_txs = []
        for account in accounts:
            account_id = account["account_id"]
            url = f"{self._api_base()}/accounts/{account_id}/transactions"
            params = {
                "dateFrom": from_date.isoformat(),
                "dateTo": to_date.isoformat(),
                "bookingStatus": "booked",
            }
            resp = requests.get(
                url,
                params=params,
                headers=self._headers(access_token, consent.consent_id),
                timeout=30,
            )
            log_api_call(
                association=consent.association,
                bank=BANK,
                endpoint=f"/accounts/{account_id}/transactions",
                http_method="GET",
                status_code=resp.status_code,
            )
            resp.raise_for_status()
            raw_txs = (
                resp.json()
                .get("transactions", {})
                .get("booked", [])
            )
            for tx in raw_txs:
                all_txs.append({
                    "account_id": account_id,
                    "external_id": tx.get("transactionId", ""),
                    "date": date.fromisoformat(tx["bookingDate"]),
                    "amount": Decimal(str(tx["transactionAmount"]["amount"])),
                    "description": tx.get("remittanceInformationUnstructured", ""),
                    "reference": tx.get("endToEndId", ""),
                })
        return all_txs
