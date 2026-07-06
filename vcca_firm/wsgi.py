from app import app, db, ensure_schema_updates

# Ensure tables and compatibility schema updates are applied when app starts on host.
with app.app_context():
    db.create_all()
    ensure_schema_updates()

application = app
