import getpass

from flask import Flask, redirect, request, session, url_for
from flask_login import LoginManager, current_user
from flask_wtf.csrf import CSRFProtect
from sqlalchemy import text

from config import Config
from models import User, db
from routes.analytics import bp as analytics_bp
from routes.auth import bp as auth_bp
from routes.auth import ensure_password_or_error
from routes.clients import bp as clients_bp
from routes.compliance import bp as compliance_bp
from routes.dashboard import bp as dashboard_bp
from routes.invoices import bp as invoices_bp
from routes.projects import bp as projects_bp
from routes.prospects import bp as prospects_bp
from routes.quotations import bp as quotations_bp
from routes.users import bp as users_bp


app = Flask(__name__)
app.config.from_object(Config)

csrf = CSRFProtect(app)
db.init_app(app)

login_manager = LoginManager()
login_manager.login_view = "auth.login"
login_manager.init_app(app)


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


@app.before_request
def enforce_session_timeout_and_auth():
    session.permanent = True
    session.modified = True

    open_endpoints = {
        "auth.login",
        "static",
    }
    if request.endpoint in open_endpoints:
        return None

    if not current_user.is_authenticated:
        if request.path.startswith("/api/"):
            return {"success": False, "error": "Authentication required."}, 401
        return redirect(url_for("auth.login"))
    return None


app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(prospects_bp)
app.register_blueprint(quotations_bp)
app.register_blueprint(clients_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(invoices_bp)
app.register_blueprint(compliance_bp)
app.register_blueprint(users_bp)


def ensure_schema_updates():
    db.session.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NOT NULL DEFAULT ''")
    )
    db.session.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NOT NULL DEFAULT ''")
    )
    db.session.execute(
        text("UPDATE users SET first_name = 'Unknown' WHERE COALESCE(TRIM(first_name), '') = ''")
    )
    db.session.execute(
        text("UPDATE users SET last_name = 'User' WHERE COALESCE(TRIM(last_name), '') = ''")
    )
    db.session.execute(
        text("ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency VARCHAR(30) NOT NULL DEFAULT 'USD'")
    )
    db.session.execute(
        text("UPDATE quotations SET currency = 'SCR' WHERE currency = 'Seychelles Rupees'")
    )
    db.session.execute(
        text("UPDATE quotations SET currency = 'SCR' WHERE currency = 'SRC'")
    )
    db.session.execute(
        text("ALTER TABLE quotations DROP CONSTRAINT IF EXISTS chk_quote_currency")
    )
    db.session.execute(
        text(
            """
            ALTER TABLE quotations
            ADD CONSTRAINT chk_quote_currency
            CHECK (currency IN ('USD', 'SCR', 'Euro'));
            """
        )
    )
    db.session.execute(
        text("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(30) NOT NULL DEFAULT 'USD'")
    )
    db.session.execute(
        text("UPDATE invoices SET currency = 'SCR' WHERE currency = 'Seychelles Rupees'")
    )
    db.session.execute(
        text("UPDATE invoices SET currency = 'SCR' WHERE currency = 'SRC'")
    )
    db.session.execute(
        text("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_currency")
    )
    db.session.execute(
        text(
            """
            ALTER TABLE invoices
            ADD CONSTRAINT chk_invoice_currency
            CHECK (currency IN ('USD', 'SCR', 'Euro'));
            """
        )
    )
    db.session.commit()


@app.cli.command("init-db")
def init_db():
    with app.app_context():
        db.create_all()
        ensure_schema_updates()


@app.cli.command("test-db")
def test_db():
    with app.app_context():
        db.session.execute(text("SELECT 1"))
        print("Database connection successful.")


@app.cli.command("create-admin")
def create_admin():
    first_name = input("Admin first name: ").strip()
    last_name = input("Admin surname: ").strip()
    username = input("Admin username: ").strip()
    email = input("Admin email: ").strip()
    password = getpass.getpass("Admin password: ")

    if not first_name or not last_name or not username or not email or not password:
        print("First name, surname, username, email, and password are required.")
        return

    error = ensure_password_or_error(password)
    if error:
        print(error)
        return

    with app.app_context():
        existing = User.query.filter((User.username == username) | (User.email == email)).first()
        if existing:
            print("User with this username or email already exists.")
            return

        user = User(first_name=first_name, last_name=last_name, username=username, email=email, role="Administrator", status="Active")
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"Administrator user created with id={user.id}.")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        ensure_schema_updates()
    app.run(debug=True)
