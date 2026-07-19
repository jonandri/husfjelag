from associations.models import BankProvider as BankChoice
from associations.banks.provider_base import BankProvider
from associations.banks.landsbankinn_provider import LandsbankinnProvider
from associations.banks.islandsbanki import IslandsbankiProvider


def get_provider(settings) -> BankProvider:
    """Return the BankProvider implementation for the association's configured bank."""
    if settings.bank == BankChoice.ISLANDSBANKI:
        return IslandsbankiProvider()
    if settings.bank == BankChoice.LANDSBANKINN:
        return LandsbankinnProvider()
    raise NotImplementedError(f"No provider for bank '{settings.bank}'")
