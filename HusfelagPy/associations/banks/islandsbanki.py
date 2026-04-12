"""
Íslandsbanki AIS client — Phase 3.
Standard: PSD2
Sandbox: https://developer.islandsbanki.is/apiportal/
"""
from .base_provider import BankProvider


class IslandsbankiProvider(BankProvider):
    """Phase 3 — not yet implemented. See docs/superpowers/plans/ for Phase 3 plan."""

    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        raise NotImplementedError("Íslandsbanki integration coming in Phase 3")

    def exchange_code(self, code: str, code_verifier: str) -> dict:
        raise NotImplementedError("Íslandsbanki integration coming in Phase 3")

    def get_transactions(self, consent, from_date, to_date) -> list[dict]:
        raise NotImplementedError("Íslandsbanki integration coming in Phase 3")

    def get_balance(self, consent, account_id: str) -> dict:
        raise NotImplementedError("Íslandsbanki integration coming in Phase 3")
