import json
import re
from datetime import date

from flask import Blueprint, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from models import Client, Prospect, Quotation, User, db, log_activity
from routes._utils import changed_fields, decimal_or_none, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("quotations", __name__)
CURRENCY_OPTIONS = {"USD", "SCR", "Euro"}


def _next_quotation_ref(today=None):
    current = today or date.today()
    year = current.year
    prefix = f"Q-{year}-"
    like = f"{prefix}%"

    refs = (
        db.session.query(Quotation.quotation_ref)
        .filter(Quotation.quotation_ref.ilike(like))
        .all()
    )

    max_counter = 0
    pattern = re.compile(rf"^Q-{year}-(\d+)$")
    for (ref,) in refs:
        match = pattern.match(ref or "")
        if not match:
            continue
        max_counter = max(max_counter, int(match.group(1)))

    next_counter = max_counter + 1
    return f"Q-{year}-{next_counter:03d}"


def _ensure_client_from_accepted(quotation):
    if quotation.status != "Accepted":
        return None

    existing = Client.query.filter_by(quotation_id=quotation.id).first()
    if existing:
        return existing

    prospect = Prospect.query.get(quotation.prospect_id)
    if not prospect:
        return None

    client = Client(
        prospect_id=prospect.id,
        quotation_id=quotation.id,
        company_name=prospect.company_name,
        contact_person=prospect.contact_person,
        phone=prospect.phone,
        email=prospect.email,
        service_type=prospect.service_required,
        assigned_to=prospect.assigned_to,
    )
    prospect.marketing_status = "Converted"
    prospect.quotation_status = "Accepted"
    db.session.add(client)
    db.session.flush()
    log_activity(
        current_user.id,
        "Auto Created Client",
        "Client",
        client.id,
        json.dumps(client.to_dict()),
    )
    return client


@bp.route("/api/quotations", methods=["GET"])
@login_required
def list_quotations():
    query = Quotation.query

    status = request.args.get("status")
    search = (request.args.get("q") or "").strip()

    if status:
        query = query.filter(Quotation.status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Quotation.quotation_ref.ilike(like),
                Quotation.service_description.ilike(like),
            )
        )

    quotations = query.order_by(Quotation.created_at.desc()).all()
    prospects = {
        p.id: p.company_name
        for p in Prospect.query.with_entities(Prospect.id, Prospect.company_name).all()
    }
    users = {u.id: u.username for u in User.query.with_entities(User.id, User.username).all()}

    data = []
    totals_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    accepted = 0
    rejected = 0
    for quotation in quotations:
        item = quotation.to_dict()
        item["prospect_company"] = prospects.get(quotation.prospect_id)
        item["created_by_name"] = users.get(quotation.created_by)
        value = float(quotation.amount or 0)
        if quotation.currency in totals_by_currency:
            totals_by_currency[quotation.currency] += value
        if quotation.status == "Accepted":
            accepted += 1
        if quotation.status == "Rejected":
            rejected += 1
        data.append(item)

    total = len(data)
    summary = {
        "total_quotations": total,
        "totals_by_currency": {k: round(v, 2) for k, v in totals_by_currency.items()},
        "accepted": accepted,
        "rejected": rejected,
        "conversion_rate": round((accepted / total) * 100, 2) if total else 0,
    }

    return json_success(data, summary=summary)


@bp.route("/api/quotations", methods=["POST"])
@login_required
def create_quotation():
    payload = get_json_payload()
    required = ["prospect_id", "currency"]
    for field in required:
        if not payload.get(field):
            return json_error(f"{field} is required.")

    currency = (payload.get("currency") or "").strip()
    if currency not in CURRENCY_OPTIONS:
        return json_error("currency must be one of: USD, SCR, Euro.")

    prospect_id = int_or_none(payload.get("prospect_id"))
    if not prospect_id:
        return json_error("prospect_id is required.")

    quotation = Quotation(
        prospect_id=prospect_id,
        quotation_ref=_next_quotation_ref(),
        service_description=payload.get("service_description"),
        amount=decimal_or_none(payload.get("amount")),
        currency=currency,
        sent_date=parse_date(payload.get("sent_date")),
        status=payload.get("status") or "Pending",
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    db.session.add(quotation)
    db.session.flush()

    prospect = Prospect.query.get(quotation.prospect_id)
    if prospect:
        prospect.quotation_status = quotation.status
        if quotation.status == "Pending":
            prospect.marketing_status = "Proposal Sent"

    created_client = _ensure_client_from_accepted(quotation)

    log_activity(
        current_user.id,
        "Created Quotation",
        "Quotation",
        quotation.id,
        json.dumps(quotation.to_dict()),
    )
    db.session.commit()

    message = None
    if created_client:
        message = "Quotation accepted - client added to Client Register."

    return json_success(quotation.to_dict(), message=message)


@bp.route("/api/quotations/<int:quotation_id>", methods=["PUT"])
@login_required
def update_quotation(quotation_id):
    quotation = Quotation.query.get_or_404(quotation_id)
    before = quotation.to_dict()
    payload = get_json_payload()

    for field in ["prospect_id", "service_description", "status", "notes"]:
        if field in payload:
            if field == "prospect_id":
                setattr(quotation, field, int_or_none(payload[field]))
            else:
                setattr(quotation, field, payload[field])

    if "currency" in payload:
        currency = (payload.get("currency") or "").strip()
        if currency not in CURRENCY_OPTIONS:
            return json_error("currency must be one of: USD, SCR, Euro.")
        quotation.currency = currency

    if "amount" in payload:
        quotation.amount = decimal_or_none(payload.get("amount"))
    if "sent_date" in payload:
        quotation.sent_date = parse_date(payload.get("sent_date"))

    prospect = Prospect.query.get(quotation.prospect_id)
    if prospect:
        prospect.quotation_status = quotation.status
        if quotation.status == "Accepted":
            prospect.marketing_status = "Converted"

    created_client = _ensure_client_from_accepted(quotation)

    after = quotation.to_dict()
    log_activity(
        current_user.id,
        "Updated Quotation",
        "Quotation",
        quotation.id,
        changed_fields(before, after),
    )
    db.session.commit()

    message = None
    if created_client:
        message = "Quotation accepted - client added to Client Register."

    return json_success(after, message=message)


@bp.route("/api/quotations/<int:quotation_id>", methods=["DELETE"])
@login_required
def delete_quotation(quotation_id):
    quotation = Quotation.query.get_or_404(quotation_id)
    detail = json.dumps(quotation.to_dict())
    log_activity(current_user.id, "Deleted Quotation", "Quotation", quotation_id, detail)
    db.session.delete(quotation)
    db.session.commit()
    return json_success({"deleted": quotation_id})
