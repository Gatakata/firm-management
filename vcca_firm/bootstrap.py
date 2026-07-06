import getpass
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy.engine.url import make_url


def ask(prompt, default=None):
    label = f"{prompt} [{default}]" if default is not None else prompt
    value = input(f"{label}: ").strip()
    if value:
        return value
    return default or ""


def build_database_url():
    host = ask("PostgreSQL host", "localhost")
    port = ask("PostgreSQL port", "5432")
    db_name = ask("Database name", "vcca_firm")
    user = ask("Database user", "postgres")
    password = getpass.getpass("Database password: ")

    safe_user = quote_plus(user)
    safe_password = quote_plus(password)
    return f"postgresql://{safe_user}:{safe_password}@{host}:{port}/{db_name}"


def write_env(database_url):
    env_path = Path(__file__).resolve().parent / ".env"
    content = (
        "SECRET_KEY=vcca-secret-key-2026\n"
        f"DATABASE_URL={database_url}\n"
    )
    env_path.write_text(content, encoding="utf-8")
    return env_path


def ensure_database_exists(database_url):
    import psycopg2
    from psycopg2 import sql

    url = make_url(database_url)
    target_db = url.database
    admin_db = "postgres"

    conn = psycopg2.connect(
        dbname=admin_db,
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
            exists = cur.fetchone() is not None
            if not exists:
                cur.execute(sql.SQL("CREATE DATABASE {}") .format(sql.Identifier(target_db)))
                print(f"Created database '{target_db}'.")
    finally:
        conn.close()


def create_tables_and_admin():
    from sqlalchemy import text

    from app import app, ensure_schema_updates
    from models import User, db
    from routes.auth import ensure_password_or_error

    with app.app_context():
        db.create_all()
        ensure_schema_updates()
        db.session.execute(text("SELECT 1"))

        existing_admin = User.query.filter_by(role="Administrator").first()
        if existing_admin:
            print(f"Administrator already exists: {existing_admin.username}")
            return

        print("No Administrator found. Create initial Administrator account.")
        first_name = ask("Admin first name", "System")
        last_name = ask("Admin surname", "Admin")
        username = ask("Admin username", "admin")
        email = ask("Admin email", "admin@vcca.local")

        while True:
            password = getpass.getpass("Admin password: ")
            confirm = getpass.getpass("Confirm admin password: ")
            if password != confirm:
                print("Passwords do not match. Try again.")
                continue
            error = ensure_password_or_error(password)
            if error:
                print(error)
                continue
            break

        admin = User(first_name=first_name, last_name=last_name, username=username, email=email, role="Administrator", status="Active")
        admin.set_password(password)
        db.session.add(admin)
        db.session.commit()
        print(f"Administrator created with id={admin.id}")


def main():
    print("VCCA bootstrap started.")
    database_url = build_database_url()
    env_path = write_env(database_url)
    print(f"Saved database config to {env_path}")
    ensure_database_exists(database_url)
    create_tables_and_admin()
    print("Bootstrap complete. You can now run: python app.py")


if __name__ == "__main__":
    main()
