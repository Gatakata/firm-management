import json

from flask import Blueprint
from flask_login import current_user, login_required

from models import ActivityLog, User, db, log_activity
from routes._utils import changed_fields, get_json_payload, json_error, json_success
from routes.auth import admin_required, ensure_password_or_error

bp = Blueprint("users", __name__)


@bp.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    data = []
    for user in users:
        row = user.to_dict()
        row.pop("password_hash", None)
        data.append(row)
    return json_success(data)


@bp.route("/api/users/assignable", methods=["GET"])
@login_required
def list_assignable_users():
    users = User.query.filter_by(status="Active").order_by(User.username.asc()).all()
    data = []
    for user in users:
        full_name = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
        data.append(
            {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "name": full_name or user.username,
            }
        )
    return json_success(data)


@bp.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    payload = get_json_payload()
    required = ["username", "email", "password"]
    required += ["first_name", "last_name"]
    for field in required:
        if not payload.get(field):
            return json_error(f"{field} is required.")

    error = ensure_password_or_error(payload.get("password"))
    if error:
        return json_error(error)

    if User.query.filter((User.username == payload["username"]) | (User.email == payload["email"])).first():
        return json_error("Username or email already exists.")

    user = User(
        first_name=payload.get("first_name"),
        last_name=payload.get("last_name"),
        username=payload.get("username"),
        email=payload.get("email"),
        role=payload.get("role") or "User",
        status=payload.get("status") or "Active",
        must_reset=bool(payload.get("must_reset", False)),
    )
    user.set_password(payload.get("password"))
    db.session.add(user)
    db.session.flush()
    log_activity(current_user.id, "Created User", "User", user.id, json.dumps(user.to_dict()))
    db.session.commit()

    data = user.to_dict()
    data.pop("password_hash", None)
    return json_success(data)


@bp.route("/api/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    before = user.to_dict()
    payload = get_json_payload()

    if "first_name" in payload:
        first_name = (payload.get("first_name") or "").strip()
        if not first_name:
            return json_error("first_name cannot be empty.")
        user.first_name = first_name

    if "last_name" in payload:
        last_name = (payload.get("last_name") or "").strip()
        if not last_name:
            return json_error("last_name cannot be empty.")
        user.last_name = last_name

    for field in ["username", "email", "role", "status", "must_reset"]:
        if field in payload:
            setattr(user, field, payload[field])

    after = user.to_dict()
    log_activity(current_user.id, "Updated User", "User", user.id, changed_fields(before, after))
    db.session.commit()

    after.pop("password_hash", None)
    return json_success(after)


@bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    if user_id == current_user.id:
        return json_error("You cannot delete your own user.")

    user = User.query.get_or_404(user_id)
    detail = json.dumps(user.to_dict())
    log_activity(current_user.id, "Deleted User", "User", user_id, detail)
    db.session.delete(user)
    db.session.commit()
    return json_success({"deleted": user_id})


@bp.route("/api/users/<int:user_id>/set-password", methods=["PUT"])
@admin_required
def set_password(user_id):
    user = User.query.get_or_404(user_id)
    payload = get_json_payload()
    password = payload.get("password")

    error = ensure_password_or_error(password)
    if error:
        return json_error(error)

    user.set_password(password)
    user.must_reset = bool(payload.get("must_reset", False))
    log_activity(current_user.id, "Set User Password", "User", user.id, '{"password_reset": true}')
    db.session.commit()
    return json_success({"updated": user.id})


@bp.route("/api/users/<int:user_id>/toggle-status", methods=["PUT"])
@admin_required
def toggle_status(user_id):
    user = User.query.get_or_404(user_id)
    user.status = "Disabled" if user.status == "Active" else "Active"
    log_activity(
        current_user.id,
        "Toggled User Status",
        "User",
        user.id,
        json.dumps({"status": user.status}),
    )
    db.session.commit()
    return json_success({"id": user.id, "status": user.status})


@bp.route("/api/users/activity-log", methods=["GET"])
@admin_required
def activity_log_table():
    logs = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(500).all()
    users = {u.id: u.username for u in User.query.with_entities(User.id, User.username).all()}

    data = []
    for row in logs:
        item = row.to_dict()
        item["username"] = users.get(row.user_id)
        data.append(item)
    return json_success(data)


@bp.route("/api/account", methods=["GET"])
@login_required
def account():
    data = current_user.to_dict()
    data.pop("password_hash", None)
    return json_success(data)


@bp.route("/api/account/change-password", methods=["PUT"])
@login_required
def change_password():
    payload = get_json_payload()
    current_password = payload.get("current_password")
    new_password = payload.get("new_password")
    confirm_password = payload.get("confirm_password")

    if not current_user.check_password(current_password or ""):
        return json_error("Current password is incorrect.")
    if new_password != confirm_password:
        return json_error("New password and confirmation do not match.")

    error = ensure_password_or_error(new_password)
    if error:
        return json_error(error)

    current_user.set_password(new_password)
    current_user.must_reset = False
    log_activity(
        current_user.id,
        "Changed Own Password",
        "User",
        current_user.id,
        '{"must_reset": false}',
    )
    db.session.commit()
    return json_success({"updated": True})
