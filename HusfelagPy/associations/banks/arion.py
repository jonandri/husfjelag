"""
Arion banki AIS client — Phase 2.
Standard: IOBWS 3.0
Sandbox: https://apis.sandbox.arionbanki.is/open-banking/v3
"""
from .base_provider import BankProvider


class ArionProvider(BankProvider):
    """Phase 2 — not yet implemented. See docs/superpowers/plans/ for Phase 2 plan."""

    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def exchange_code(self, code: str, code_verifier: str) -> dict:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def get_transactions(self, consent, from_date, to_date) -> list[dict]:
        raise NotImplementedError("Arion integration coming in Phase 2")

    def get_balance(self, consent, account_id: str) -> dict:
        raise NotImplementedError("Arion integration coming in Phase 2")
