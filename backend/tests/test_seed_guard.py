"""The production guard in scripts/seed.py: every refusal exits non-zero and builds no Store, and the local path still seeds."""
import pytest

from helpdesk import config
from helpdesk.store import get_store

import seed as seed_module

PROD_TABLES = {
    "TABLE_TICKETS": "helpdesk-pro-prod-tickets",
    "TABLE_COMMENTS": "helpdesk-pro-prod-comments",
    "TABLE_USERS": "helpdesk-pro-prod-users",
}


@pytest.fixture
def no_store(monkeypatch):
    """Fails the test if the script tries to build a Store, which is where every write starts."""
    def build(*args, **kwargs):
        raise AssertionError("Store was built: the script would have written")
    monkeypatch.setattr(seed_module, "Store", build)


@pytest.fixture
def prod_env(monkeypatch):
    """A fully valid production environment. Each test breaks one thing."""
    for name in ("AWS_REGION", "AWS_DEFAULT_REGION", "SEED_CONFIRM"):
        monkeypatch.delenv(name, raising=False)
    for name, value in PROD_TABLES.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("SEED_CONFIRM", "helpdesk-pro-prod")
    return monkeypatch


def test_refuses_without_production_flag(prod_env, no_store, capsys):
    assert seed_module.main([]) == 2
    assert seed_module.main(["--production", "--force"]) == 2
    err = capsys.readouterr().err
    assert "usage: python scripts/seed.py --production" in err


@pytest.mark.parametrize("name, value", [
    ("TABLE_TICKETS", "helpdesk-pro-dev-tickets"),
    ("TABLE_COMMENTS", "helpdesk-pro-staging-comments"),
    ("TABLE_USERS", "users"),
])
def test_refuses_a_table_outside_the_production_prefix(prod_env, no_store, capsys, name, value):
    prod_env.setenv(name, value)
    assert seed_module.main(["--production"]) == 1
    err = capsys.readouterr().err
    assert name in err
    assert "nothing was written" in err


def test_refuses_a_missing_table_name(prod_env, no_store, capsys):
    prod_env.delenv("TABLE_USERS")
    assert seed_module.main(["--production"]) == 1
    assert "TABLE_USERS is not set" in capsys.readouterr().err


@pytest.mark.parametrize("region", ["eu-west-1", "us-west-2", "us-east-2"])
def test_refuses_the_wrong_region(prod_env, no_store, capsys, region):
    prod_env.setenv("AWS_REGION", region)
    assert seed_module.main(["--production"]) == 1
    assert f"AWS_REGION={region} must be us-east-1" in capsys.readouterr().err


def test_refuses_a_wrong_default_region_when_aws_region_is_unset(prod_env, no_store, capsys):
    prod_env.delenv("AWS_REGION")
    prod_env.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    assert seed_module.main(["--production"]) == 1
    assert "AWS_DEFAULT_REGION=eu-central-1 must be us-east-1" in capsys.readouterr().err


def test_refuses_when_no_region_is_set(prod_env, no_store, capsys):
    prod_env.delenv("AWS_REGION")
    assert seed_module.main(["--production"]) == 1
    assert "AWS_REGION or AWS_DEFAULT_REGION must be set" in capsys.readouterr().err


@pytest.mark.parametrize("value", [None, "", "helpdesk-pro-dev", "HELPDESK-PRO-PROD", "yes"])
def test_refuses_without_the_exact_seed_confirm(prod_env, no_store, capsys, value):
    if value is None:
        prod_env.delenv("SEED_CONFIRM")
    else:
        prod_env.setenv("SEED_CONFIRM", value)
    assert seed_module.main(["--production"]) == 1
    assert "SEED_CONFIRM must equal helpdesk-pro-prod exactly" in capsys.readouterr().err


def test_reports_every_failed_check_at_once(prod_env, no_store, capsys):
    prod_env.setenv("TABLE_TICKETS", "helpdesk-pro-dev-tickets")
    prod_env.setenv("AWS_REGION", "eu-west-1")
    prod_env.delenv("SEED_CONFIRM")
    assert seed_module.main(["--production"]) == 1
    err = capsys.readouterr().err
    assert "TABLE_TICKETS" in err
    assert "AWS_REGION=eu-west-1" in err
    assert "SEED_CONFIRM" in err


def test_production_path_seeds_when_every_check_passes(prod_env, aws, capsys):
    # The aws fixture runs moto, so this writes to the in-memory tables and makes no AWS call.
    assert seed_module.main(["--production"]) == 0
    assert "seeded 25 tickets" in capsys.readouterr().out


def test_local_path_still_seeds_without_the_guard(aws, monkeypatch):
    # The local server calls seed() directly, with no flag and no SEED_CONFIRM.
    monkeypatch.delenv("SEED_CONFIRM", raising=False)
    store = get_store(config.load_api())
    assert seed_module.seed(store) == 25
    rows, _ = store.scan_tickets(100, ("id",))
    assert len(rows) == 25
