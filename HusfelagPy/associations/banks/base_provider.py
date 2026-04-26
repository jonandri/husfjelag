from abc import ABC, abstractmethod
from datetime import date


class BankProvider(ABC):
    """
    Abstract base for all bank integrations.
    Each bank (Landsbankinn, Arion, Íslandsbanki) implements this interface.
    """

    @abstractmethod
    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        """Return the full OAuth2 authorization URL to redirect the user to."""

    @abstractmethod
    def exchange_code(self, code: str, code_verifier: str) -> dict:
        """
        Exchange an authorization code for tokens.
        Returns dict with keys: access_token, refresh_token (optional),
        expires_in (seconds), consent_id.
        """

    @abstractmethod
    def get_transactions(
        self, consent, from_date: date, to_date: date
    ) -> list[dict]:
        """
        Fetch booked transactions for all accounts under this consent.
        Returns list of dicts, each with keys:
          account_id, external_id, date, amount (Decimal), description, reference.
        `consent` is a BankConsent model instance — access_token decrypted by caller.
        """

    @abstractmethod
    def get_balance(self, consent, account_id: str) -> dict:
        """
        Fetch balance for a single account.
        Returns dict with keys: account_id, amount (Decimal), currency.
        `consent` is a BankConsent model instance — access_token decrypted by caller.
        """

    def create_claim(self, *args, **kwargs):
        """Claim (kröfu) creation — pending partner agreement with bank."""
        raise NotImplementedError(
            "Kröfustofnun bíður samnings við bankann. "
            "Notaðu PDF kröfu í bili."
        )
