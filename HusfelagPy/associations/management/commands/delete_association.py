from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from associations.models import (
    Association, AssociationAccess, Apartment, ApartmentOwnership,
    BankAccount, Transaction as Txn, Budget, BudgetItem,
    Collection, HMSImportSource, CategoryRule,
)


class Command(BaseCommand):
    help = "Delete an association and all related data. Usage: delete_association <association_id>"

    def add_arguments(self, parser):
        parser.add_argument("association_id", type=int, help="ID of the association to delete")

    def handle(self, *args, **options):
        assoc_id = options["association_id"]

        try:
            assoc = Association.objects.get(id=assoc_id)
        except Association.DoesNotExist:
            raise CommandError(f"Association with id={assoc_id} does not exist.")

        self.stdout.write(f"\nAssociation: {assoc.name} ({assoc.ssn})  id={assoc.id}")
        self.stdout.write("This will permanently delete all related data.")
        confirm = input("Type the association name to confirm: ").strip()
        if confirm != assoc.name:
            raise CommandError("Name did not match. Aborted.")

        with transaction.atomic():
            # 1. Collections (reference Budget, Apartment, and optionally Transaction)
            col_count = Collection.objects.filter(budget__association=assoc).count()
            Collection.objects.filter(budget__association=assoc).delete()
            self.stdout.write(f"  Deleted {col_count} collection(s)")

            # 2. Transactions (reference BankAccount)
            txn_count = Txn.objects.filter(bank_account__association=assoc).count()
            Txn.objects.filter(bank_account__association=assoc).delete()
            self.stdout.write(f"  Deleted {txn_count} transaction(s)")

            # 3. BankAccounts
            ba_count = BankAccount.objects.filter(association=assoc).count()
            BankAccount.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {ba_count} bank account(s)")

            # 4. BudgetItems
            bi_count = BudgetItem.objects.filter(budget__association=assoc).count()
            BudgetItem.objects.filter(budget__association=assoc).delete()
            self.stdout.write(f"  Deleted {bi_count} budget item(s)")

            # 5. Budgets
            b_count = Budget.objects.filter(association=assoc).count()
            Budget.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {b_count} budget(s)")

            # 6. ApartmentOwnerships
            ao_count = ApartmentOwnership.objects.filter(apartment__association=assoc).count()
            ApartmentOwnership.objects.filter(apartment__association=assoc).delete()
            self.stdout.write(f"  Deleted {ao_count} apartment ownership(s)")

            # 7. HMS import sources
            hms_count = HMSImportSource.objects.filter(association=assoc).count()
            HMSImportSource.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {hms_count} HMS import source(s)")

            # 8. Category rules scoped to this association
            cr_count = CategoryRule.objects.filter(association=assoc).count()
            CategoryRule.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {cr_count} category rule(s)")

            # 9. Apartments
            apt_count = Apartment.objects.filter(association=assoc).count()
            Apartment.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {apt_count} apartment(s)")

            # 10. AssociationAccess entries
            acc_count = AssociationAccess.objects.filter(association=assoc).count()
            AssociationAccess.objects.filter(association=assoc).delete()
            self.stdout.write(f"  Deleted {acc_count} access entry/entries")

            # 11. The association itself
            assoc.delete()
            self.stdout.write(self.style.SUCCESS(f"\nAssociation '{assoc.name}' deleted successfully."))
