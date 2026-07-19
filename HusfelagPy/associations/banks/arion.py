"""
Arion banki AIS client — Phase 2 (not yet implemented).
Standard: IOBWS 3.0
Sandbox: https://apis.sandbox.arionbanki.is/open-banking/v3
"""
from datetime import date
from associations.banks.provider_base import BankProvider


class ArionProvider(BankProvider):
    """Phase 2 — not yet implemented. See docs/superpowers/plans/ for the Phase 2 plan."""

    def discover_and_sync_accounts(self, association, settings) -> dict:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def sync_account_transactions(self, account, from_date: date, to_date: date, settings) -> dict:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def create_claim(self, collection, settings) -> dict:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def get_claim_status(self, claim_id: str, settings) -> str:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def list_claims(self, association, settings, **filters) -> list[dict]:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def fetch_incoming_claims(self, association, settings, due_date_from: date) -> list[dict]:
        raise NotImplementedError("Arion integration coming in Phase 2")
