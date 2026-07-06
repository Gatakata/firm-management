from functools import wraps

from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user

from models import User, db, log_activity
from routes._utils import json_error, validate_password_policy

bp = Blueprint("auth", __name__)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard.app_page"))

    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""

        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash("Invalid username or password.", "error")
            return render_template("login.html")

        if user.status != "Active":
            flash("Your account is disabled. Contact an administrator.", "error")
            return render_template("login.html")

        login_user(user)
        session.permanent = True
        session["must_reset_notice"] = bool(user.must_reset)
        log_activity(user.id, "User Login", "User", user.id, '{"event": "login"}')
        db.session.commit()
        return redirect(url_for("dashboard.app_page"))

    return render_template("login.html")


@bp.route("/logout", methods=["POST"])
@login_required
def logout():
    uid = current_user.id
    log_activity(uid, "User Logout", "User", uid, '{"event": "logout"}')
    db.session.commit()
    logout_user()
    return redirect(url_for("auth.login"))


def admin_required(func):
    @wraps(func)
    @login_required
    def wrapped(*args, **kwargs):
        if current_user.role != "Administrator":
            return json_error("Administrator access required.", 403)
        return func(*args, **kwargs)

    return wrapped


def ensure_password_or_error(password):
    if not validate_password_policy(password):
        return (
            "Password must be at least 10 characters with uppercase, lowercase, number and special character."
        )
    return None
