from collections import defaultdict
from datetime import date, timedelta

from flask import Blueprint, render_template, session
from flask_login import current_user, login_required
from sqlalchemy import func

from models import Client, Compliance, Invoice, Project, Prospect, Quotation, db
from routes._utils import decimal_to_float, json_success

bp = Blueprint("dashboard", __name__)


@bp.route("/")
def home():
    return render_template("base.html")


@bp.route("/app")
@login_required
def app_page():
    return render_template("app.html", must_reset_notice=session.pop("must_reset_notice", False))


@bp.route("/api/dashboard", methods=["GET"])
@login_required
def get_dashboard():
    today = date.today()
    in_progress_statuses = ["In Progress", "Under Review"]

    total_prospects = Prospect.query.count()
    quotations_sent = Quotation.query.count()
    quotations_accepted = Quotation.query.filter_by(status="Accepted").count()
    confirmed_clients = Client.query.count()
    projects_in_progress = Project.query.filter(Project.status.in_(in_progress_statuses)).count()

    invoices = Invoice.query.all()
    invoices_outstanding = sum(
        1 for invoice in invoices if decimal_to_float(invoice.amount) > decimal_to_float(invoice.amount_paid)
    )
    revenue_collected_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    for invoice in invoices:
        currency = invoice.currency if getattr(invoice, "currency", None) in revenue_collected_by_currency else "USD"
        revenue_collected_by_currency[currency] += decimal_to_float(invoice.amount_paid)

    tax_returns_submitted = Compliance.query.filter(
        Compliance.status.in_(["Submitted", "Acknowledged"])
    ).count()
    client_conversion_rate = round((quotations_accepted / quotations_sent) * 100, 2) if quotations_sent else 0

    overdue_projects = []
    overdue_rows = (
        db.session.query(Project, Client)
        .join(Client, Client.id == Project.client_id)
        .filter(Project.expected_completion < today)
        .filter(Project.status != "Completed")
        .all()
    )
    for project, client in overdue_rows:
        overdue_projects.append(
            {
                "project_id": project.id,
                "project_name": project.description or project.service_type,
                "client": client.company_name,
                "days_overdue": (today - project.expected_completion).days,
            }
        )

    upcoming_compliance = []
    upcoming_rows = (
        db.session.query(Compliance, Client)
        .join(Client, Client.id == Compliance.client_id)
        .filter(Compliance.filing_deadline >= today)
        .filter(Compliance.filing_deadline <= today + timedelta(days=14))
        .filter(Compliance.status == "Pending")
        .all()
    )
    for item, client in upcoming_rows:
        days_remaining = (item.filing_deadline - today).days
        upcoming_compliance.append(
            {
                "id": item.id,
                "client": client.company_name,
                "tax_type": item.tax_type,
                "deadline": item.filing_deadline.isoformat() if item.filing_deadline else None,
                "days_remaining": days_remaining,
                "urgent": days_remaining <= 7,
            }
        )

    buckets = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    buckets_by_currency = {
        "USD": {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0},
        "SCR": {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0},
        "Euro": {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0},
    }
    for invoice in invoices:
        balance = decimal_to_float(invoice.amount) - decimal_to_float(invoice.amount_paid)
        if balance <= 0 or not invoice.due_date or invoice.due_date >= today:
            continue
        days = (today - invoice.due_date).days
        currency = invoice.currency if getattr(invoice, "currency", None) in buckets_by_currency else "USD"
        if days <= 30:
            buckets["0_30"] += balance
            buckets_by_currency[currency]["0_30"] += balance
        elif days <= 60:
            buckets["31_60"] += balance
            buckets_by_currency[currency]["31_60"] += balance
        elif days <= 90:
            buckets["61_90"] += balance
            buckets_by_currency[currency]["61_90"] += balance
        else:
            buckets["90_plus"] += balance
            buckets_by_currency[currency]["90_plus"] += balance
    buckets["total"] = round(sum(buckets.values()), 2)
    for key in ("0_30", "31_60", "61_90", "90_plus"):
        buckets[key] = round(buckets[key], 2)

    for currency, row in buckets_by_currency.items():
        row["total"] = round(sum(row.values()), 2)
        for key in ("0_30", "31_60", "61_90", "90_plus"):
            row[key] = round(row[key], 2)

    monthly_map = defaultdict(float)
    month_keys = []
    for i in range(11, -1, -1):
        m = (today.replace(day=1) - timedelta(days=i * 31)).replace(day=1)
        key = m.strftime("%Y-%m")
        month_keys.append(key)
        monthly_map[key] = 0.0

    for invoice in invoices:
        if not invoice.issue_date:
            continue
        key = invoice.issue_date.strftime("%Y-%m")
        if key in monthly_map:
            monthly_map[key] += decimal_to_float(invoice.amount_paid)

    monthly_revenue = [
        {"month": key, "amount": round(monthly_map[key], 2)} for key in month_keys
    ]

    data = {
        "kpis": {
            "total_prospects": total_prospects,
            "quotations_sent": quotations_sent,
            "quotations_accepted": quotations_accepted,
            "confirmed_clients": confirmed_clients,
            "projects_in_progress": projects_in_progress,
            "invoices_outstanding": invoices_outstanding,
            "revenue_collected_by_currency": {k: round(v, 2) for k, v in revenue_collected_by_currency.items()},
            "tax_returns_submitted": tax_returns_submitted,
            "client_conversion_rate": client_conversion_rate,
        },
        "overdue_projects": overdue_projects,
        "upcoming_compliance": upcoming_compliance,
        "aged_debtors": buckets,
        "aged_debtors_by_currency": buckets_by_currency,
        "monthly_revenue": monthly_revenue,
    }
    return json_success(data)
