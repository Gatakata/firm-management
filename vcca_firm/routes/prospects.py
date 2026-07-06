import json

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from models import Prospect, User, db, log_activity
from routes._utils import changed_fields, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("prospects", __name__)


@bp.route("/api/prospects", methods=["GET"])
@login_required
def list_prospects():
    query = Prospect.query

    status = request.args.get("status")
    service = request.args.get("service")
    created_from = parse_date(request.args.get("from"))
    created_to = parse_date(request.args.get("to"))
    search = (request.args.get("q") or "").strip()

    if status:
        query = query.filter(Prospect.marketing_status == status)
    if service:
        query = query.filter(Prospect.service_required == service)
    if created_from:
        query = query.filter(Prospect.created_at >= created_from)
    if created_to:
        query = query.filter(Prospect.created_at <= created_to)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Prospect.company_name.ilike(like),
                Prospect.contact_person.ilike(like),
                Prospect.email.ilike(like),
            )
        )

    prospects = query.order_by(Prospect.created_at.desc()).all()
    users = {user.id: user.username for user in User.query.with_entities(User.id, User.username).all()}

    data = []
    for prospect in prospects:
        item = prospect.to_dict()
        item["assigned_to_name"] = users.get(prospect.assigned_to)
        data.append(item)

    return json_success(data)


@bp.route("/api/prospects", methods=["POST"])
@login_required
def create_prospect():
    payload = get_json_payload()
    if not payload.get("company_name"):
        return json_error("Company name is required.")

    prospect = Prospect(
        company_name=payload.get("company_name"),
        contact_person=payload.get("contact_person"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        service_required=payload.get("service_required"),
        lead_source=payload.get("lead_source"),
        marketing_status=payload.get("marketing_status") or "New",
        quotation_status=payload.get("quotation_status") or "None",
        notes=payload.get("notes"),
        assigned_to=int_or_none(payload.get("assigned_to")),
    )
    db.session.add(prospect)
    db.session.flush()
    log_activity(
        current_user.id,
        "Created Prospect",
        "Prospect",
        prospect.id,
        json.dumps(prospect.to_dict()),
    )
    db.session.commit()
    return json_success(prospect.to_dict())


@bp.route("/api/prospects/<int:prospect_id>", methods=["PUT"])
@login_required
def update_prospect(prospect_id):
    prospect = Prospect.query.get_or_404(prospect_id)
    before = prospect.to_dict()
    payload = get_json_payload()

    for field in [
        "company_name",
        "contact_person",
        "phone",
        "email",
        "service_required",
        "lead_source",
        "marketing_status",
        "quotation_status",
        "notes",
        "assigned_to",
    ]:
        if field in payload:
            if field == "assigned_to":
                setattr(prospect, field, int_or_none(payload[field]))
            else:
                setattr(prospect, field, payload[field])

    after = prospect.to_dict()
    log_activity(
        current_user.id,
        "Updated Prospect",
        "Prospect",
        prospect.id,
        changed_fields(before, after),
    )
    db.session.commit()
    return json_success(after)


@bp.route("/api/prospects/<int:prospect_id>", methods=["DELETE"])
@login_required
def delete_prospect(prospect_id):
    prospect = Prospect.query.get_or_404(prospect_id)
    detail = json.dumps(prospect.to_dict())
    log_activity(current_user.id, "Deleted Prospect", "Prospect", prospect_id, detail)
    db.session.delete(prospect)
    db.session.commit()
    return json_success({"deleted": prospect_id})
