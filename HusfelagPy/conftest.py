# HusfelagPy/conftest.py
import pytest


@pytest.fixture(autouse=False)
def db_access(db):
    """Alias for tests that need the database."""
    pass
