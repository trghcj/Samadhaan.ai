"""The startup column sync adds new model columns to an existing (older) grievances table."""
from sqlalchemy import create_engine, inspect, text

import models

NEW_COLUMNS = {"latitude", "longitude", "address_line", "landmark", "pincode"}


def old_table_engine(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE grievances (id INTEGER PRIMARY KEY, transcript VARCHAR)"))
        conn.execute(text("INSERT INTO grievances (id, transcript) VALUES (1, 'old complaint')"))
    return engine


def test_adds_missing_columns_to_old_table(tmp_path):
    from schema_sync import add_missing_columns

    engine = old_table_engine(tmp_path)
    added = add_missing_columns(engine, models.Grievance)

    assert NEW_COLUMNS <= set(added)
    names = {c["name"] for c in inspect(engine).get_columns("grievances")}
    assert NEW_COLUMNS <= names
    with engine.connect() as conn:  # existing rows survive with NULLs in the new columns
        row = conn.execute(text("SELECT transcript, latitude, pincode FROM grievances WHERE id = 1")).one()
    assert tuple(row) == ("old complaint", None, None)


def test_second_call_adds_nothing(tmp_path):
    from schema_sync import add_missing_columns

    engine = old_table_engine(tmp_path)
    add_missing_columns(engine, models.Grievance)
    assert add_missing_columns(engine, models.Grievance) == []
