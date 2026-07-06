from app import app, db, ensure_initial_admin_from_env, ensure_schema_updates

# Ensure tables and compatibility schema updates are applied when app starts on host.
with app.app_context():
    db.create_all()
    ensure_schema_updates()
    ensure_initial_admin_from_env()

application = app
