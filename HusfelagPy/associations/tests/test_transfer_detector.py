import datetime
from decimal import Decimal

from django.test import TestCase

from associations.models import (
    AccountingKey,
    Association,
    BankAccount,
    InterAccountTransfer,
    Transaction,
    TransactionStatus,
)
from associations.transfer_detector import (
    TRANSFER_TYPE,
    _is_transfer_candidate,
    detect_transfers,
)


DATE = datetime.date(2026, 4, 15)
ASSOC_SSN = "6005250690"


class TransferDetectorTestCase(TestCase):
    def setUp(self):
        self.assoc = Association.objects.create(
            ssn=ASSOC_SSN,
            name="Maríugata 34-36, húsfélag",
            address="Maríugötu 34",
            postal_code="105",
            city="Reykjavík",
        )
        ak_op, _ = AccountingKey.objects.get_or_create(
            number=1200,
            defaults={"name": "Innstæður í bönkum (rekstrar)", "type": "ASSET"},
        )
        ak_res, _ = AccountingKey.objects.get_or_create(
            number=1210,
            defaults={"name": "Varasjóður", "type": "ASSET"},
        )
        self.operating = BankAccount.objects.create(
            association=self.assoc,
            name="Veltureikningur",
            account_number="0101-26-111111",
            asset_account=ak_op,
        )
        self.reserve = BankAccount.objects.create(
            association=self.assoc,
            name="Vaxtareikningur",
            account_number="0101-26-222222",
            asset_account=ak_res,
        )

    def _make_txn(self, bank_account, amount, reference=ASSOC_SSN,
                  transaction_type=TRANSFER_TYPE, date=DATE):
        return Transaction.objects.create(
            bank_account=bank_account,
            date=date,
            amount=Decimal(str(amount)),
            description="Maríugata 34-36, húsfélag",
            reference=reference,
            transaction_type=transaction_type,
            status=TransactionStatus.IMPORTED,
        )


# ---------------------------------------------------------------------------
# Unit tests for _is_transfer_candidate
# ---------------------------------------------------------------------------

class IsCandidateTest(TransferDetectorTestCase):
    def _bare_txn(self, reference, transaction_type):
        """Lightweight non-persisted object for candidate checks."""
        txn = Transaction(
            bank_account=self.operating,
            date=DATE,
            amount=Decimal("1000"),
            description="x",
            reference=reference,
            transaction_type=transaction_type,
        )
        return txn

    def test_millifaert_with_matching_ssn_is_candidate(self):
        txn = self._bare_txn(ASSOC_SSN, TRANSFER_TYPE)
        self.assertTrue(_is_transfer_candidate(txn, ASSOC_SSN))

    def test_hyphenated_ssn_in_reference_normalised(self):
        txn = self._bare_txn("600525-0690", TRANSFER_TYPE)
        self.assertTrue(_is_transfer_candidate(txn, ASSOC_SSN))

    def test_empty_transaction_type_falls_back_to_reference(self):
        txn = self._bare_txn(ASSOC_SSN, "")
        self.assertTrue(_is_transfer_candidate(txn, ASSOC_SSN))

    def test_wrong_transaction_type_excluded(self):
        txn = self._bare_txn(ASSOC_SSN, "Innborgun")
        self.assertFalse(_is_transfer_candidate(txn, ASSOC_SSN))

    def test_wrong_reference_excluded(self):
        txn = self._bare_txn("9999999999", TRANSFER_TYPE)
        self.assertFalse(_is_transfer_candidate(txn, ASSOC_SSN))


# ---------------------------------------------------------------------------
# (a) Matched pair — both legs imported together
# ---------------------------------------------------------------------------

class MatchedPairTest(TransferDetectorTestCase):
    def test_matched_pair_creates_transfer_record(self):
        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        transfers = detect_transfers([txn_out, txn_in], self.assoc)

        self.assertEqual(len(transfers), 1)
        t = transfers[0]
        self.assertEqual(t.amount, Decimal("20000"))
        self.assertEqual(t.association, self.assoc)
        self.assertEqual(t.date, DATE)

    def test_matched_pair_inbound_outbound_direction(self):
        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        detect_transfers([txn_out, txn_in], self.assoc)

        transfer = InterAccountTransfer.objects.get()
        self.assertEqual(transfer.inbound_transaction.bank_account,  self.reserve)
        self.assertEqual(transfer.outbound_transaction.bank_account, self.operating)

    def test_matched_pair_both_marked_reconciled(self):
        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        detect_transfers([txn_out, txn_in], self.assoc)

        txn_out.refresh_from_db()
        txn_in.refresh_from_db()
        self.assertEqual(txn_out.status, TransactionStatus.TRANSFER)
        self.assertEqual(txn_in.status,  TransactionStatus.TRANSFER)

    def test_matched_pair_category_is_none(self):
        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        detect_transfers([txn_out, txn_in], self.assoc)

        txn_out.refresh_from_db()
        txn_in.refresh_from_db()
        self.assertIsNone(txn_out.category)
        self.assertIsNone(txn_in.category)

    def test_matched_pair_gl_accounts_from_bank_accounts(self):
        """The GL entry is implicit: inbound.asset_account / outbound.asset_account."""
        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        detect_transfers([txn_out, txn_in], self.assoc)

        t = InterAccountTransfer.objects.get()
        self.assertEqual(t.inbound_transaction.bank_account.asset_account.number,  1210)
        self.assertEqual(t.outbound_transaction.bank_account.asset_account.number, 1200)


# ---------------------------------------------------------------------------
# (b) Only one leg present — park as PENDING_TRANSFER
# ---------------------------------------------------------------------------

class SingleLegTest(TransferDetectorTestCase):
    def test_single_leg_no_transfer_created(self):
        txn = self._make_txn(self.reserve, "+20000")

        transfers = detect_transfers([txn], self.assoc)

        self.assertEqual(len(transfers), 0)
        self.assertEqual(InterAccountTransfer.objects.count(), 0)

    def test_single_leg_status_is_pending_transfer(self):
        txn = self._make_txn(self.reserve, "+20000")

        detect_transfers([txn], self.assoc)

        txn.refresh_from_db()
        self.assertEqual(txn.status, TransactionStatus.PENDING_TRANSFER)

    def test_pending_leg_matched_when_counterpart_imported_later(self):
        """Second import finds the parked PENDING_TRANSFER and reconciles both."""
        txn_in = self._make_txn(self.reserve, "+20000")
        detect_transfers([txn_in], self.assoc)

        txn_in.refresh_from_db()
        self.assertEqual(txn_in.status, TransactionStatus.PENDING_TRANSFER)

        txn_out = self._make_txn(self.operating, "-20000")
        transfers = detect_transfers([txn_out], self.assoc)

        self.assertEqual(len(transfers), 1)
        txn_in.refresh_from_db()
        txn_out.refresh_from_db()
        self.assertEqual(txn_in.status,  TransactionStatus.TRANSFER)
        self.assertEqual(txn_out.status, TransactionStatus.TRANSFER)


# ---------------------------------------------------------------------------
# (c) Same-day transfer that is NOT an inter-account transfer (different Tilvísun)
# ---------------------------------------------------------------------------

class DifferentReferenceTest(TransferDetectorTestCase):
    def test_different_reference_not_detected(self):
        other_ssn = "1234567890"
        txn_out = self._make_txn(self.operating, "-20000", reference=other_ssn)
        txn_in  = self._make_txn(self.reserve,   "+20000", reference=other_ssn)

        transfers = detect_transfers([txn_out, txn_in], self.assoc)

        self.assertEqual(len(transfers), 0)
        self.assertEqual(InterAccountTransfer.objects.count(), 0)

    def test_different_reference_stays_imported(self):
        other_ssn = "1234567890"
        txn_out = self._make_txn(self.operating, "-20000", reference=other_ssn)
        txn_in  = self._make_txn(self.reserve,   "+20000", reference=other_ssn)

        detect_transfers([txn_out, txn_in], self.assoc)

        txn_out.refresh_from_db()
        txn_in.refresh_from_db()
        self.assertEqual(txn_out.status, TransactionStatus.IMPORTED)
        self.assertEqual(txn_in.status,  TransactionStatus.IMPORTED)


# ---------------------------------------------------------------------------
# (d) Reversed direction — reserve → operating (1210 → 1200)
# ---------------------------------------------------------------------------

class ReversedDirectionTest(TransferDetectorTestCase):
    def test_reversed_direction_inbound_is_operating(self):
        txn_from_reserve = self._make_txn(self.reserve,   "-15000")
        txn_to_operating = self._make_txn(self.operating, "+15000")

        detect_transfers([txn_from_reserve, txn_to_operating], self.assoc)

        t = InterAccountTransfer.objects.get()
        self.assertEqual(t.inbound_transaction.bank_account,  self.operating)
        self.assertEqual(t.outbound_transaction.bank_account, self.reserve)

    def test_reversed_direction_gl_accounts(self):
        """Reversed: DR 1200 (operating, inbound) / CR 1210 (reserve, outbound)."""
        txn_from_reserve = self._make_txn(self.reserve,   "-15000")
        txn_to_operating = self._make_txn(self.operating, "+15000")

        detect_transfers([txn_from_reserve, txn_to_operating], self.assoc)

        t = InterAccountTransfer.objects.get()
        self.assertEqual(t.inbound_transaction.bank_account.asset_account.number,  1200)
        self.assertEqual(t.outbound_transaction.bank_account.asset_account.number, 1210)

    def test_reversed_direction_amount(self):
        txn_from_reserve = self._make_txn(self.reserve,   "-15000")
        txn_to_operating = self._make_txn(self.operating, "+15000")

        detect_transfers([txn_from_reserve, txn_to_operating], self.assoc)

        self.assertEqual(InterAccountTransfer.objects.get().amount, Decimal("15000"))


# ---------------------------------------------------------------------------
# Extra: verify transfer transactions are never passed to the category classifier
# ---------------------------------------------------------------------------

class NoClassifierLeakTest(TransferDetectorTestCase):
    def test_reconciled_transactions_have_no_category(self):
        from associations.models import Category, CategoryRule

        cat = Category.objects.create(name="Framkvæmdasjóður", type="SHARED")
        CategoryRule.objects.create(
            keyword="Maríugata", category=cat, association=self.assoc
        )

        txn_out = self._make_txn(self.operating, "-20000")
        txn_in  = self._make_txn(self.reserve,   "+20000")

        detect_transfers([txn_out, txn_in], self.assoc)

        txn_out.refresh_from_db()
        txn_in.refresh_from_db()
        self.assertIsNone(txn_out.category)
        self.assertIsNone(txn_in.category)

    def test_empty_transaction_type_still_detected(self):
        """Parser didn't capture Textafærslur — detection falls back to reference match."""
        txn_out = self._make_txn(self.operating, "-8000", transaction_type="")
        txn_in  = self._make_txn(self.reserve,   "+8000", transaction_type="")

        transfers = detect_transfers([txn_out, txn_in], self.assoc)

        self.assertEqual(len(transfers), 1)
        txn_out.refresh_from_db()
        self.assertEqual(txn_out.status, TransactionStatus.TRANSFER)
