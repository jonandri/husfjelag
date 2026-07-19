from abc import ABC, abstractmethod
from datetime import date


class BankProvider(ABC):
    """Uniform interface every bank integration implements. Methods take the
    AssociationBankSettings object so each provider pulls its own creds/cert."""

    @abstractmethod
    def discover_and_sync_accounts(self, association, settings) -> dict: ...

    @abstractmethod
    def sync_account_transactions(self, account, from_date: date, to_date: date, settings) -> dict: ...

    @abstractmethod
    def create_claim(self, collection, settings) -> dict: ...

    @abstractmethod
    def get_claim_status(self, claim_id: str, settings) -> str: ...

    @abstractmethod
    def list_claims(self, association, settings, **filters) -> list[dict]: ...

    @abstractmethod
    def fetch_incoming_claims(self, association, settings, due_date_from: date) -> list[dict]: ...
