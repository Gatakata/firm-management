import json
import re
from datetime import date

from flask import Blueprint, request
from flask_login import current_user, login_required

from models import Client, Invoice, Project, db, log_activity
from routes._utils import changed_fields, decimal_or_none, decimal_to_float, get_json_payload, int_or_none, json_error, json_success, parse_date

bp = Blueprint("invoices", __name__)
CURRENCY_OPTIONS = {"USD", "SCR", "Euro"}


def _next_invoice_ref(today=None):
    current = today or date.today()
    year = current.year
    prefix = f"INV-{year}-"
    like = f"{prefix}%"

    refs = (
        db.session.query(Invoice.invoice_ref)
        .filter(Invoice.invoice_ref.ilike(like))
        .all()
    )

    max_counter = 0
    pattern = re.compile(rf"^INV-{year}-(\d+)$")
    for (ref,) in refs:
        match = pattern.match(ref or "")
        if not match:
            continue
        max_counter = max(max_counter, int(match.group(1)))

    return f"INV-{year}-{max_counter + 1:03d}"


def recalculate_payment_status(invoice):
    today = date.today()
    amount = decimal_to_float(invoice.amount)
    paid = decimal_to_float(invoice.amount_paid)

    if paid >= amount and amount > 0:
        invoice.payment_status = "Paid"
    elif paid > 0:
        invoice.payment_status = "Partially Paid"
    elif invoice.due_date and invoice.due_date < today:
        invoice.payment_status = "Overdue"
    else:
        invoice.payment_status = "Unpaid"


def invoice_payload(invoice):
    item = invoice.to_dict()
    amount = decimal_to_float(invoice.amount)
    paid = decimal_to_float(invoice.amount_paid)
    item["balance_due"] = round(max(0, amount - paid), 2)
    return item


@bp.route("/api/invoices", methods=["GET"])
@login_required
def list_invoices():
    query = Invoice.query

    status = request.args.get("status")
    client_id = request.args.get("client_id", type=int)
    search = (request.args.get("q") or "").strip()

    if status:
        query = query.filter(Invoice.payment_status == status)
    if client_id:
        query = query.filter(Invoice.client_id == client_id)
    if search:
        like = f"%{search}%"
        query = query.filter(Invoice.invoice_ref.ilike(like))

    invoices = query.order_by(Invoice.created_at.desc()).all()
    clients = {c.id: c.company_name for c in Client.query.with_entities(Client.id, Client.company_name).all()}
    projects = {p.id: (p.description or p.service_type) for p in Project.query.with_entities(Project.id, Project.description, Project.service_type).all()}

    data = []
    totals_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    collected_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    outstanding_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    overdue_count = 0

    for invoice in invoices:
        recalculate_payment_status(invoice)
        item = invoice_payload(invoice)
        item["client_name"] = clients.get(invoice.client_id)
        item["project_name"] = projects.get(invoice.project_id)
        data.append(item)

        currency = invoice.currency if invoice.currency in totals_by_currency else "USD"
        totals_by_currency[currency] += decimal_to_float(invoice.amount)
        collected_by_currency[currency] += decimal_to_float(invoice.amount_paid)
        outstanding_by_currency[currency] += item["balance_due"]
        if invoice.payment_status == "Overdue":
            overdue_count += 1

    aged = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    today = date.today()
    for invoice in invoices:
        bal = invoice_payload(invoice)["balance_due"]
        if bal <= 0 or not invoice.due_date or invoice.due_date >= today:
            continue
        days = (today - invoice.due_date).days
        if days <= 30:
            aged["0_30"] += bal
        elif days <= 60:
            aged["31_60"] += bal
        elif days <= 90:
            aged["61_90"] += bal
        else:
            aged["90_plus"] += bal
    aged["total"] = round(sum(aged.values()), 2)
    for key in ("0_30", "31_60", "61_90", "90_plus"):
        aged[key] = round(aged[key], 2)

    summary = {
        "total_invoiced_by_currency": {k: round(v, 2) for k, v in totals_by_currency.items()},
        "total_collected_by_currency": {k: round(v, 2) for k, v in collected_by_currency.items()},
        "outstanding_by_currency": {k: round(v, 2) for k, v in outstanding_by_currency.items()},
        "overdue_count": overdue_count,
    }

    db.session.commit()
    return json_success(data, summary=summary, aged_debtors=aged)


@bp.route("/api/invoices", methods=["POST"])
@login_required
def create_invoice():
    payload = get_json_payload()
    required = ["client_id", "currency", "amount", "issue_date", "due_date"]
    for field in required:
        if not payload.get(field):
            return json_error(f"{field} is required.")

    currency = (payload.get("currency") or "").strip()
    if currency not in CURRENCY_OPTIONS:
        return json_error("currency must be one of: USD, SCR, Euro.")

    client_id = int_or_none(payload.get("client_id"))
    if not client_id:
        return json_error("client_id is required.")

    invoice = Invoice(
        client_id=client_id,
        project_id=int_or_none(payload.get("project_id")),
        invoice_ref=_next_invoice_ref(),
        currency=currency,
        amount=decimal_or_none(payload.get("amount")),
        amount_paid=decimal_or_none(payload.get("amount_paid")) or 0,
        issue_date=parse_date(payload.get("issue_date")),
        due_date=parse_date(payload.get("due_date")),
        notes=payload.get("notes"),
        created_by=current_user.id,
    )
    recalculate_payment_status(invoice)
    db.session.add(invoice)
    db.session.flush()
    log_activity(current_user.id, "Created Invoice", "Invoice", invoice.id, json.dumps(invoice.to_dict()))
    db.session.commit()
    return json_success(invoice_payload(invoice))


@bp.route("/api/invoices/<int:invoice_id>", methods=["PUT"])
@login_required
def update_invoice(invoice_id):
    invoice = Invoice.query.get_or_404(invoice_id)
    before = invoice.to_dict()
    payload = get_json_payload()

    for field in ["client_id", "project_id", "notes"]:
        if field in payload:
            if field in {"client_id", "project_id"}:
                setattr(invoice, field, int_or_none(payload[field]))
            else:
                setattr(invoice, field, payload[field])

    if "currency" in payload:
        currency = (payload.get("currency") or "").strip()
        if currency not in CURRENCY_OPTIONS:
            return json_error("currency must be one of: USD, SCR, Euro.")
        invoice.currency = currency

    if "amount" in payload:
        invoice.amount = decimal_or_none(payload.get("amount"))
    if "amount_paid" in payload:
        invoice.amount_paid = decimal_or_none(payload.get("amount_paid")) or 0
    if "issue_date" in payload:
        invoice.issue_date = parse_date(payload.get("issue_date"))
    if "due_date" in payload:
        invoice.due_date = parse_date(payload.get("due_date"))

    if payload.get("payment_received"):
        current_paid = decimal_to_float(invoice.amount_paid)
        received = decimal_to_float(decimal_or_none(payload.get("payment_received")))
        invoice.amount_paid = current_paid + received

    recalculate_payment_status(invoice)

    after = invoice.to_dict()
    log_activity(
        current_user.id,
        "Updated Invoice",
        "Invoice",
        invoice.id,
        changed_fields(before, after),
    )
    db.session.commit()
    return json_success(invoice_payload(invoice))


@bp.route("/api/invoices/<int:invoice_id>", methods=["DELETE"])
@login_required
def delete_invoice(invoice_id):
    invoice = Invoice.query.get_or_404(invoice_id)
    detail = json.dumps(invoice.to_dict())
    log_activity(current_user.id, "Deleted Invoice", "Invoice", invoice_id, detail)
    db.session.delete(invoice)
    db.session.commit()
    return json_success({"deleted": invoice_id})
