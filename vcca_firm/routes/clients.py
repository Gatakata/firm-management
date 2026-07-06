import json

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from models import Client, Compliance, Invoice, Project, User, db, log_activity
from routes._utils import bool_from_value, changed_fields, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("clients", __name__)


@bp.route("/api/clients", methods=["GET"])
@login_required
def list_clients():
    query = Client.query

    engagement_status = request.args.get("engagement_status")
    onboarding = request.args.get("onboarding")
    search = (request.args.get("q") or "").strip()

    if engagement_status:
        query = query.filter(Client.engagement_letter_status == engagement_status)
    if onboarding:
        query = query.filter(Client.onboarding_complete == (onboarding.lower() == "true"))
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Client.company_name.ilike(like),
                Client.contact_person.ilike(like),
                Client.email.ilike(like),
            )
        )

    clients = query.order_by(Client.created_at.desc()).all()
    users = {u.id: u.username for u in User.query.with_entities(User.id, User.username).all()}

    data = []
    for client in clients:
        item = client.to_dict()
        has_project = Project.query.filter_by(client_id=client.id).first() is not None
        item["assigned_to_name"] = users.get(client.assigned_to)
        item["engagement_warning"] = has_project and client.engagement_letter_status != "Signed"
        data.append(item)

    return json_success(data)


@bp.route("/api/clients/<int:client_id>/full", methods=["GET"])
@login_required
def get_client_full(client_id):
    client = Client.query.get_or_404(client_id)
    data = client.to_dict()
    data["projects"] = [project.to_dict() for project in Project.query.filter_by(client_id=client_id).all()]
    data["invoices"] = [invoice.to_dict() for invoice in Invoice.query.filter_by(client_id=client_id).all()]
    data["compliance"] = [
        item.to_dict() for item in Compliance.query.filter_by(client_id=client_id).all()
    ]
    return json_success(data)


@bp.route("/api/clients", methods=["POST"])
@login_required
def create_client():
    payload = get_json_payload()
    if not payload.get("company_name"):
        return json_error("Company name is required.")

    prospect_id = int_or_none(payload.get("prospect_id"))
    quotation_id = int_or_none(payload.get("quotation_id"))
    assigned_to = int_or_none(payload.get("assigned_to"))

    client = Client(
        prospect_id=prospect_id,
        quotation_id=quotation_id,
        company_name=payload.get("company_name"),
        contact_person=payload.get("contact_person"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        service_type=payload.get("service_type"),
        engagement_letter_status=payload.get("engagement_letter_status") or "Outstanding",
        engagement_letter_date=parse_date(payload.get("engagement_letter_date")),
        onboarding_complete=bool_from_value(payload.get("onboarding_complete")),
        assigned_to=assigned_to,
    )
    db.session.add(client)
    db.session.flush()
    log_activity(current_user.id, "Created Client", "Client", client.id, json.dumps(client.to_dict()))
    db.session.commit()
    return json_success(client.to_dict())


@bp.route("/api/clients/<int:client_id>", methods=["PUT"])
@login_required
def update_client(client_id):
    client = Client.query.get_or_404(client_id)
    before = client.to_dict()
    payload = get_json_payload()

    for field in [
        "prospect_id",
        "quotation_id",
        "company_name",
        "contact_person",
        "phone",
        "email",
        "service_type",
        "engagement_letter_status",
        "onboarding_complete",
        "assigned_to",
    ]:
        if field in payload:
            if field in {"prospect_id", "quotation_id", "assigned_to"}:
                setattr(client, field, int_or_none(payload[field]))
            elif field == "onboarding_complete":
                setattr(client, field, bool_from_value(payload[field]))
            else:
                setattr(client, field, payload[field])

    if "engagement_letter_date" in payload:
        client.engagement_letter_date = parse_date(payload.get("engagement_letter_date"))

    after = client.to_dict()
    log_activity(
        current_user.id,
        "Updated Client",
        "Client",
        client.id,
        changed_fields(before, after),
    )
    db.session.commit()
    return json_success(after)


@bp.route("/api/clients/<int:client_id>", methods=["DELETE"])
@login_required
def delete_client(client_id):
    client = Client.query.get_or_404(client_id)
    detail = json.dumps(client.to_dict())
    log_activity(current_user.id, "Deleted Client", "Client", client_id, detail)
    db.session.delete(client)
    db.session.commit()
    return json_success({"deleted": client_id})
