from datetime import date
from associations.banks.provider_base import BankProvider


class IslandsbankiProvider(BankProvider):
    def discover_and_sync_accounts(self, association, settings) -> dict:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")

    def sync_account_transactions(self, account, from_date: date, to_date: date, settings) -> dict:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")

    def create_claim(self, collection, settings) -> dict:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")

    def get_claim_status(self, claim_id: str, settings) -> str:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")

    def list_claims(self, association, settings, **filters) -> list[dict]:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")

    def fetch_incoming_claims(self, association, settings, due_date_from: date) -> list[dict]:
        raise NotImplementedError("Íslandsbanki: implemented in a later task")
