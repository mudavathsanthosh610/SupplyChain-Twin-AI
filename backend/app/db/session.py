from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.base import Base

database_url = settings.database_url
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace(
        "postgresql://", "postgresql+psycopg://", 1
    )

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    connect_args=(
        {"check_same_thread": False}
        if database_url.startswith("sqlite")
        else {}
    ),
)


def ensure_database_schema(eng):
    from app.db_models import entities

    Base.metadata.create_all(bind=eng)

    schema_updates = [
        ("companies", "city", "VARCHAR(200)"),
        ("companies", "country", "VARCHAR(100)"),
        ("companies", "business_type", "VARCHAR(200)"),
        ("companies", "end_to_end_workflow", "TEXT"),
        ("companies", "requires_manual_network_setup", "BOOLEAN DEFAULT FALSE"),
        ("companies", "owner_id", "INTEGER REFERENCES users(id)"),
        ("supply_nodes", "data_source_type", "VARCHAR(50) DEFAULT 'USER PROVIDED'"),
        ("supply_nodes", "source_url", "VARCHAR(500)"),
        ("supply_nodes", "updated_at", "DATETIME"),
        ("supply_routes", "data_source_type", "VARCHAR(50) DEFAULT 'USER PROVIDED'"),
        ("supply_routes", "source_reference", "VARCHAR(500)"),
        ("supply_routes", "updated_at", "DATETIME"),
        ("control_tower_actions", "is_sample", "BOOLEAN DEFAULT FALSE"),
        ("control_tower_actions", "actual_cost_change_percent", "FLOAT"),
        ("control_tower_actions", "actual_delay_change_days", "FLOAT"),
        ("control_tower_actions", "actual_stockout_locations", "INTEGER"),
        ("control_tower_actions", "actual_emergency_inventory_units", "FLOAT"),
        ("user_notifications", "dismissed_at", "DATETIME"),
    ]

    for table, col, col_def in schema_updates:
        inspector = inspect(eng)
        if not inspector.has_table(table):
            continue
        column_names = {
            column["name"] for column in inspector.get_columns(table)
        }
        if col in column_names:
            continue

        with eng.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"))


ensure_database_schema(engine)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
