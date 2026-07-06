import json
from datetime import date

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from models import Client, Project, User, db, log_activity
from routes._utils import changed_fields, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("projects", __name__)


def project_with_calculated_fields(project):
    today = date.today()
    item = project.to_dict()
    age_days = 0
    progress_percentage = 0
    overdue = False

    if project.start_date:
        age_days = (today - project.start_date).days
    if project.start_date and project.expected_completion:
        total_days = (project.expected_completion - project.start_date).days
        elapsed_days = (today - project.start_date).days
        if total_days > 0:
            progress_percentage = max(0, min(100, int((elapsed_days / total_days) * 100)))

    if project.expected_completion and project.expected_completion < today and project.status != "Completed":
        overdue = True

    item["age_days"] = age_days
    item["progress_percentage"] = progress_percentage
    item["overdue"] = overdue
    return item


@bp.route("/api/projects", methods=["GET"])
@login_required
def list_projects():
    query = Project.query

    client_id = request.args.get("client_id", type=int)
    status = request.args.get("status")
    assigned_to = request.args.get("assigned_to", type=int)
    service_type = request.args.get("service_type")
    search = (request.args.get("q") or "").strip()

    if client_id:
        query = query.filter(Project.client_id == client_id)
    if status:
        query = query.filter(Project.status == status)
    if assigned_to:
        query = query.filter(Project.assigned_to == assigned_to)
    if service_type:
        query = query.filter(Project.service_type == service_type)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Project.description.ilike(like),
                Project.service_type.ilike(like),
            )
        )

    projects = query.order_by(Project.created_at.desc()).all()
    clients = {c.id: c.company_name for c in Client.query.with_entities(Client.id, Client.company_name).all()}
    users = {u.id: u.username for u in User.query.with_entities(User.id, User.username).all()}

    data = []
    for project in projects:
        item = project_with_calculated_fields(project)
        item["client_name"] = clients.get(project.client_id)
        item["assigned_to_name"] = users.get(project.assigned_to)
        data.append(item)

    return json_success(data)


@bp.route("/api/projects", methods=["POST"])
@login_required
def create_project():
    payload = get_json_payload()
    client_id = int_or_none(payload.get("client_id"))
    if not client_id or not payload.get("service_type"):
        return json_error("client_id and service_type are required.")

    project = Project(
        client_id=client_id,
        service_type=payload.get("service_type"),
        description=payload.get("description"),
        start_date=parse_date(payload.get("start_date")),
        expected_completion=parse_date(payload.get("expected_completion")),
        actual_completion=parse_date(payload.get("actual_completion")),
        status=payload.get("status") or "Not Started",
        assigned_to=int_or_none(payload.get("assigned_to")),
    )
    db.session.add(project)
    db.session.flush()
    log_activity(current_user.id, "Created Project", "Project", project.id, json.dumps(project.to_dict()))
    db.session.commit()
    return json_success(project_with_calculated_fields(project))


@bp.route("/api/projects/<int:project_id>", methods=["PUT"])
@login_required
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    before = project.to_dict()
    payload = get_json_payload()

    for field in ["client_id", "service_type", "description", "status", "assigned_to"]:
        if field in payload:
            if field in {"client_id", "assigned_to"}:
                setattr(project, field, int_or_none(payload[field]))
            else:
                setattr(project, field, payload[field])

    if "start_date" in payload:
        project.start_date = parse_date(payload.get("start_date"))
    if "expected_completion" in payload:
        project.expected_completion = parse_date(payload.get("expected_completion"))
    if "actual_completion" in payload:
        project.actual_completion = parse_date(payload.get("actual_completion"))

    after = project.to_dict()
    log_activity(
        current_user.id,
        "Updated Project",
        "Project",
        project.id,
        changed_fields(before, after),
    )
    db.session.commit()
    return json_success(project_with_calculated_fields(project))


@bp.route("/api/projects/<int:project_id>", methods=["DELETE"])
@login_required
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    detail = json.dumps(project.to_dict())
    log_activity(current_user.id, "Deleted Project", "Project", project_id, detail)
    db.session.delete(project)
    db.session.commit()
    return json_success({"deleted": project_id})
