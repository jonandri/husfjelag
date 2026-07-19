from datetime import date
from associations.banks.provider_base import BankProvider
from associations.banks import isb_soap
from associations.banks import isb_mappers


class IslandsbankiProvider(BankProvider):
    def discover_and_sync_accounts(self, association, settings) -> dict:
        from associations.models import BankAccount
        checked = ok = 0
        today = date.today()
        for acc in BankAccount.objects.filter(association=association, is_connected=True):
            checked += 1
            try:
                self.sync_account_transactions(acc, today, today, settings)
                ok += 1
            except Exception:
                pass
        return {"created": 0, "connected": ok, "disconnected": checked - ok}

    def sync_account_transactions(self, account, from_date: date, to_date: date, settings) -> dict:
        from associations.models import Transaction, TransactionSource
        banki, hofudbok, reikningsnumer = isb_mappers.parse_account_number(account.account_number)
        faerslur = isb_soap.invoke(
            settings, "yfirlit", "SaekjaReikningsyfirlit",
            banki=banki, hofudbok=hofudbok, reikningsnumer=reikningsnumer,
            fra=from_date.isoformat() + "T00:00:00", til=to_date.isoformat() + "T00:00:00",
            faerslaFra=0, faerslaTil=0,
        ) or []
        created = skipped = 0
        for faersla in faerslur:
            fields = isb_mappers.map_faersla_to_transaction_fields(faersla, account.account_number)
            if Transaction.objects.filter(external_id=fields["external_id"]).exists():
                skipped += 1
                continue
            Transaction.objects.create(bank_account=account, source=TransactionSource.BANK_SYNC, **fields)
            created += 1
        return {"created": created, "skipped": skipped}

    def create_claim(self, collection, settings) -> dict:
        payload = isb_mappers.build_stofnakrofu_payload(collection, settings)
        # StofnaKrofu takes a single complex `krafa` param; empty response = success (no SOAP fault).
        isb_soap.invoke(settings, "krofur", "StofnaKrofu", krafa=payload)
        claim_key = isb_mappers.build_claim_key(
            payload["Bankanumer"], payload["Hofudbok"], payload["Krofunumer"], payload["Gjalddagi"][:10]
        )
        return {"id": claim_key}

    def get_claim_status(self, claim_id, settings) -> str:
        banki, hofudbok, krofunumer, gjalddagi = isb_mappers.parse_claim_key(claim_id)
        result = isb_soap.invoke(
            settings, "krofur", "SaekjaKrofu",
            kennitalaKrofuhafa=settings.association.ssn,
            banki=banki, hofudbok=hofudbok, krofunumer=krofunumer,
            gjalddagi=gjalddagi.isoformat() + "T00:00:00",
        ) or {}
        return isb_mappers.map_claim_state_to_status(result.get("Stada", "")).lower()

    def list_claims(self, association, settings, **filters) -> list[dict]:
        # SaekjaKrofur (per krofur.wsdl) requires gjalddagiFra/gjalddagiTil/astand/faerslaFra/faerslaTil
        # in addition to kennitalaKrofuhafa; default to a wide window covering "all claims" unless overridden.
        kwargs = {
            "kennitalaKrofuhafa": association.ssn,
            "gjalddagiFra": filters.get("gjalddagi_fra", date(2000, 1, 1)).isoformat() + "T00:00:00",
            "gjalddagiTil": filters.get("gjalddagi_til", date(2100, 1, 1)).isoformat() + "T00:00:00",
            "astand": filters.get("astand", "ALLAR_KROFUR"),
            "faerslaFra": filters.get("faerslaFra", 0),
            "faerslaTil": filters.get("faerslaTil", 0),
        }
        rows = isb_soap.invoke(settings, "krofur", "SaekjaKrofur", **kwargs) or []
        out = []
        for c in rows:
            out.append({
                "payer_kennitala": str(c.get("KennitalaGreidanda") or ""),
                "due_date": str(c.get("Gjalddagi") or "")[:10],
                "amount": float(c.get("Upphaed") or 0),
                "status": isb_mappers.map_claim_state_to_status(c.get("Stada", "")),
                "reference": str(c.get("Tilvisun") or ""),
            })
        return out

    def fetch_incoming_claims(self, association, settings, due_date_from: date) -> list[dict]:
        # Íslandsbanki: claims the association owes are queried the same way, filtered client-side by due date.
        return [c for c in self.list_claims(association, settings)
                if c["due_date"] and c["due_date"] >= due_date_from.isoformat()]
