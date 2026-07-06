import json
from datetime import date, timedelta

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from models import Client, Compliance, db, log_activity
from routes._utils import changed_fields, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("compliance", __name__)


@bp.route("/api/compliance", methods=["GET"])
@login_required
def list_compliance():
    query = Compliance.query

    status = request.args.get("status")
    tax_type = request.args.get("tax_type")
    deadline_from = parse_date(request.args.get("deadline_from"))
    deadline_to = parse_date(request.args.get("deadline_to"))
    search = (request.args.get("q") or "").strip()

    if status:
        query = query.filter(Compliance.status == status)
    if tax_type:
        query = query.filter(Compliance.tax_type == tax_type)
    if deadline_from:
        query = query.filter(Compliance.filing_deadline >= deadline_from)
    if deadline_to:
        query = query.filter(Compliance.filing_deadline <= deadline_to)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Compliance.tax_type.ilike(like),
                Compliance.tax_period.ilike(like),
            )
        )

    records = query.order_by(Compliance.filing_deadline.asc()).all()
    clients = {c.id: c.company_name for c in Client.query.with_entities(Client.id, Client.company_name).all()}

    data = []
    today = date.today()
    seven_day_alerts = []

    for record in records:
        item = record.to_dict()
        item["client_name"] = clients.get(record.client_id)
        days_remaining = None
        upcoming = False
        if record.filing_deadline:
            days_remaining = (record.filing_deadline - today).days
            upcoming = days_remaining <= 14 and record.status == "Pending"
            if record.status == "Pending" and days_remaining <= 7:
                seven_day_alerts.append(
                    {
                        "client": item["client_name"],
                        "tax_type": record.tax_type,
                        "deadline": record.filing_deadline.isoformat(),
                    }
                )
        item["days_remaining"] = days_remaining
        item["upcoming"] = upcoming
        data.append(item)

    return json_success(data, urgent_alerts=seven_day_alerts)


@bp.route("/api/compliance", methods=["POST"])
@login_required
def create_compliance():
    payload = get_json_payload()
    client_id = int_or_none(payload.get("client_id"))
    if not client_id or not payload.get("tax_type"):
        return json_error("client_id and tax_type are required.")

    record = Compliance(
        client_id=client_id,
        tax_type=payload.get("tax_type"),
        tax_period=payload.get("tax_period"),
        filing_deadline=parse_date(payload.get("filing_deadline")),
        filing_date=parse_date(payload.get("filing_date")),
        status=payload.get("status") or "Pending",
        notes=payload.get("notes"),
    )
    db.session.add(record)
    db.session.flush()
    log_activity(
        current_user.id,
        "Created Compliance",
        "Compliance",
        record.id,
        json.dumps(record.to_dict()),
    )
    db.session.commit()
    return json_success(record.to_dict())


@bp.route("/api/compliance/<int:compliance_id>", methods=["PUT"])
@login_required
def update_compliance(compliance_id):
    record = Compliance.query.get_or_404(compliance_id)
    before = record.to_dict()
    payload = get_json_payload()

    for field in ["client_id", "tax_type", "tax_period", "status", "notes"]:
        if field in payload:
            if field == "client_id":
                setattr(record, field, int_or_none(payload[field]))
            else:
                setattr(record, field, payload[field])

    if "filing_deadline" in payload:
        record.filing_deadline = parse_date(payload.get("filing_deadline"))
    if "filing_date" in payload:
        record.filing_date = parse_date(payload.get("filing_date"))

    after = record.to_dict()
    log_activity(
        current_user.id,
        "Updated Compliance",
        "Compliance",
        record.id,
        changed_fields(before, after),
    )
    db.session.commit()
    return json_success(after)


@bp.route("/api/compliance/<int:compliance_id>", methods=["DELETE"])
@login_required
def delete_compliance(compliance_id):
    record = Compliance.query.get_or_404(compliance_id)
    detail = json.dumps(record.to_dict())
    log_activity(current_user.id, "Deleted Compliance", "Compliance", compliance_id, detail)
    db.session.delete(record)
    db.session.commit()
    return json_success({"deleted": compliance_id})
