"""Add new model columns to an existing table.

`Base.metadata.create_all` creates missing tables but never alters existing ones, so a column added to a
model would be missing from the shared database. This adds each missing column (nullable, no default),
which older code that does not know the column keeps working with.
"""
from sqlalchemy import inspect, text


def add_missing_columns(engine, model):
    """ALTER TABLE ... ADD COLUMN for every column of `model` that the live table lacks. Returns the names added."""
    table = model.__table__
    existing = {c["name"] for c in inspect(engine).get_columns(table.name)}
    missing = [col for col in table.columns if col.name not in existing]
    if not missing:
        return []
    preparer = engine.dialect.identifier_preparer
    with engine.begin() as conn:
        for col in missing:
            col_type = col.type.compile(dialect=engine.dialect)
            conn.execute(text(f"ALTER TABLE {preparer.quote(table.name)} ADD COLUMN {preparer.quote(col.name)} {col_type}"))
    return [col.name for col in missing]
