from datetime import date
from associations.banks.provider_base import BankProvider
from associations.banks import landsbankinn as lb


class LandsbankinnProvider(BankProvider):
    """Adapts the existing landsbankinn.py module functions to BankProvider.
    No behavior change — only maps `settings` to (association_id, api_key)."""

    def discover_and_sync_accounts(self, association, settings) -> dict:
        return lb.discover_and_sync_accounts(association, settings.get_api_key())

    def sync_account_transactions(self, account, from_date: date, to_date: date, settings) -> dict:
        return lb.sync_account_transactions(account, from_date, to_date, settings.get_api_key())

    def create_claim(self, collection, settings) -> dict:
        return lb.create_claim(collection, settings)

    def get_claim_status(self, claim_id: str, settings) -> str:
        return lb.get_claim_status(claim_id, settings.association_id, settings.get_api_key())

    def list_claims(self, association, settings, **filters) -> list[dict]:
        return self.fetch_incoming_claims(association, settings, filters.get("due_date_from", date(1970, 1, 1)))

    def fetch_incoming_claims(self, association, settings, due_date_from: date) -> list[dict]:
        return lb.fetch_incoming_claims(association.id, settings.get_api_key(), association.ssn, due_date_from)
