from datetime import date, datetime, timedelta
from io import BytesIO

from flask import Blueprint, request, send_file
from flask_login import login_required

from models import Client, Compliance, Invoice, Project, Prospect
from routes._utils import decimal_to_float, json_error, json_success

bp = Blueprint("analytics", __name__)


def shift_month(month_start, offset):
    year = month_start.year
    month = month_start.month + offset
    while month > 12:
        month -= 12
        year += 1
    while month < 1:
        month += 12
        year -= 1
    return date(year, month, 1)


def amount_outstanding(invoice):
    return max(0.0, decimal_to_float(invoice.amount) - decimal_to_float(invoice.amount_paid))


def calculate_aged_debtors(invoices, today):
    aged = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    for invoice in invoices:
        bal = amount_outstanding(invoice)
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
    return aged


def parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def in_period(value, start_date, end_date):
    if value is None:
        return False
    return start_date <= value <= end_date


def as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def resolve_period_from_request(today):
    period = (request.args.get("period") or "quarter").strip().lower()
    if period not in {"month", "quarter", "year", "all", "custom"}:
        period = "quarter"

    if period == "all":
        return {
            "period": "all",
            "start_date": None,
            "end_date": None,
            "label": "All Time",
            "error": None,
        }

    if period == "custom":
        start_date = parse_iso_date(request.args.get("start_date"))
        end_date = parse_iso_date(request.args.get("end_date"))
        if not start_date or not end_date:
            return {
                "period": period,
                "start_date": None,
                "end_date": None,
                "label": "Custom",
                "error": "For custom period, start_date and end_date are required in YYYY-MM-DD format.",
            }
        if start_date > end_date:
            return {
                "period": period,
                "start_date": None,
                "end_date": None,
                "label": "Custom",
                "error": "start_date cannot be later than end_date.",
            }
        return {
            "period": period,
            "start_date": start_date,
            "end_date": end_date,
            "label": f"Custom ({start_date.isoformat()} to {end_date.isoformat()})",
            "error": None,
        }

    month_open = date(today.year, today.month, 1)
    if period == "month":
        start_date = month_open
        label = "This Month"
    elif period == "year":
        start_date = date(today.year, 1, 1)
        label = "Year to Date"
    else:
        start_date = shift_month(month_open, -2)
        label = "Last 3 Months"

    return {
        "period": period,
        "start_date": start_date,
        "end_date": today,
        "label": label,
        "error": None,
    }


def month_key_range(today, start_date, end_date):
    month_keys = []
    if start_date and end_date:
        cursor = date(start_date.year, start_date.month, 1)
        end_month = date(end_date.year, end_date.month, 1)
        while cursor <= end_month:
            month_keys.append(cursor.strftime("%Y-%m"))
            cursor = shift_month(cursor, 1)
    else:
        opening = date(today.year, today.month, 1)
        for i in range(5, -1, -1):
            month_keys.append(shift_month(opening, -i).strftime("%Y-%m"))
    return month_keys


def build_analytics_payload(period_details=None):
    today = date.today()
    period = period_details or {
        "period": "all",
        "start_date": None,
        "end_date": None,
        "label": "All Time",
    }
    start_date = period.get("start_date")
    end_date = period.get("end_date")

    invoices = Invoice.query.all()
    projects = Project.query.all()
    prospects = Prospect.query.all()
    clients = Client.query.all()

    filtered_invoices = invoices
    if start_date and end_date:
        filtered_invoices = [
            invoice
            for invoice in invoices
            if in_period(invoice.issue_date, start_date, end_date)
        ]

    filtered_projects = projects
    if start_date and end_date:
        filtered_projects = [
            project
            for project in projects
            if in_period(project.start_date or as_date(project.created_at), start_date, end_date)
        ]

    filtered_prospects = prospects
    if start_date and end_date:
        filtered_prospects = [
            prospect for prospect in prospects if in_period(as_date(prospect.created_at), start_date, end_date)
        ]

    filtered_clients = clients
    if start_date and end_date:
        filtered_clients = [
            client for client in clients if in_period(as_date(client.created_at), start_date, end_date)
        ]

    totals_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    collected_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}
    outstanding_by_currency = {"USD": 0.0, "SCR": 0.0, "Euro": 0.0}

    overdue_invoices = 0
    unpaid_invoices = 0

    for invoice in filtered_invoices:
        currency = invoice.currency if invoice.currency in totals_by_currency else "USD"
        amount = decimal_to_float(invoice.amount)
        paid = decimal_to_float(invoice.amount_paid)
        outstanding = max(0.0, amount - paid)

        totals_by_currency[currency] += amount
        collected_by_currency[currency] += paid
        outstanding_by_currency[currency] += outstanding

        if outstanding > 0:
            unpaid_invoices += 1
        if outstanding > 0 and invoice.due_date and invoice.due_date < today:
            overdue_invoices += 1

    overdue_projects = 0
    active_projects = 0
    for project in filtered_projects:
        if project.status != "Completed":
            active_projects += 1
        if project.expected_completion and project.expected_completion < today and project.status != "Completed":
            overdue_projects += 1

    compliance_rows = Compliance.query.filter(
        Compliance.status == "Pending",
        Compliance.filing_deadline.isnot(None),
    ).all()
    if start_date and end_date:
        compliance_rows = [
            item for item in compliance_rows if in_period(item.filing_deadline, start_date, end_date)
        ]
    compliance_overdue = sum(1 for item in compliance_rows if item.filing_deadline and item.filing_deadline < today)
    compliance_due_14 = sum(
        1
        for item in compliance_rows
        if item.filing_deadline and today <= item.filing_deadline <= (today + timedelta(days=14))
    )

    month_keys = month_key_range(today, start_date, end_date)
    invoiced_map = {key: 0.0 for key in month_keys}
    collected_map = {key: 0.0 for key in month_keys}

    for invoice in filtered_invoices:
        if not invoice.issue_date:
            continue
        key = invoice.issue_date.strftime("%Y-%m")
        if key in invoiced_map:
            invoiced_map[key] += decimal_to_float(invoice.amount)
            collected_map[key] += decimal_to_float(invoice.amount_paid)

    monthly_financials = [
        {
            "month": key,
            "invoiced": round(invoiced_map[key], 2),
            "collected": round(collected_map[key], 2),
            "outstanding": round(max(0.0, invoiced_map[key] - collected_map[key]), 2),
        }
        for key in month_keys
    ]

    client_names = {c.id: c.company_name for c in Client.query.with_entities(Client.id, Client.company_name).all()}
    outstanding_by_client = {}
    for invoice in filtered_invoices:
        if not invoice.client_id:
            continue
        outstanding_by_client[invoice.client_id] = outstanding_by_client.get(invoice.client_id, 0.0) + amount_outstanding(invoice)

    top_clients = sorted(
        [
            {
                "client_id": client_id,
                "client": client_names.get(client_id, f"Client #{client_id}"),
                "outstanding": round(amount, 2),
            }
            for client_id, amount in outstanding_by_client.items()
            if amount > 0
        ],
        key=lambda row: row["outstanding"],
        reverse=True,
    )[:8]

    aged = calculate_aged_debtors(filtered_invoices, today)

    payload = {
        "as_of": today.isoformat(),
        "period": {
            "preset": period.get("period"),
            "label": period.get("label"),
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "kpis": {
            "total_prospects": len(filtered_prospects),
            "total_clients": len(filtered_clients),
            "active_projects": active_projects,
            "overdue_projects": overdue_projects,
            "unpaid_invoices": unpaid_invoices,
            "overdue_invoices": overdue_invoices,
            "compliance_due_14_days": compliance_due_14,
            "compliance_overdue": compliance_overdue,
        },
        "financials": {
            "total_invoiced_by_currency": {k: round(v, 2) for k, v in totals_by_currency.items()},
            "total_collected_by_currency": {k: round(v, 2) for k, v in collected_by_currency.items()},
            "outstanding_by_currency": {k: round(v, 2) for k, v in outstanding_by_currency.items()},
        },
        "aged_debtors": aged,
        "monthly_financials": monthly_financials,
        "top_clients_by_outstanding": top_clients,
    }
    return payload


@bp.route("/api/analytics", methods=["GET"])
@login_required
def get_analytics():
    period_details = resolve_period_from_request(date.today())
    if period_details.get("error"):
        return json_error(period_details["error"], status=400)
    return json_success(build_analytics_payload(period_details=period_details))


@bp.route("/api/analytics/report.pdf", methods=["GET"])
@login_required
def export_analytics_pdf():
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
    except Exception:
        return json_error("PDF export requires reportlab. Please install dependencies.", status=500)

    period_details = resolve_period_from_request(date.today())
    if period_details.get("error"):
        return json_error(period_details["error"], status=400)

    data = build_analytics_payload(period_details=period_details)

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    def draw_title_block():
        pdf.setFillColor(colors.HexColor("#102a4c"))
        pdf.rect(0, height - 52 * mm, width, 52 * mm, stroke=0, fill=1)
        pdf.setFillColor(colors.HexColor("#e58a2b"))
        pdf.rect(0, height - 54 * mm, width, 2 * mm, stroke=0, fill=1)

        pdf.setFillColor(colors.white)
        pdf.setFont("Helvetica-Bold", 21)
        pdf.drawString(16 * mm, height - 24 * mm, "VCCA Analytics Report")
        pdf.setFont("Helvetica", 11)
        pdf.drawString(16 * mm, height - 31 * mm, f"Generated: {data['as_of']}")
        pdf.drawString(16 * mm, height - 37 * mm, f"Period: {data['period']['label']}")

    def draw_kpis(top_y):
        k = data["kpis"]
        rows = [
            ("Total Prospects", str(k["total_prospects"])),
            ("Total Clients", str(k["total_clients"])),
            ("Active Projects", str(k["active_projects"])),
            ("Overdue Projects", str(k["overdue_projects"])),
            ("Unpaid Invoices", str(k["unpaid_invoices"])),
            ("Overdue Invoices", str(k["overdue_invoices"])),
            ("Compliance Due in 14 Days", str(k["compliance_due_14_days"])),
            ("Compliance Overdue", str(k["compliance_overdue"])),
        ]

        pdf.setFillColor(colors.HexColor("#163a64"))
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(16 * mm, top_y, "Key Performance Indicators")

        y = top_y - 6 * mm
        box_w = (width - 40 * mm) / 2
        box_h = 10 * mm
        for index, (label, value) in enumerate(rows):
            col = index % 2
            row = index // 2
            x = 16 * mm + col * (box_w + 8 * mm)
            yy = y - row * (box_h + 3 * mm)
            pdf.setFillColor(colors.HexColor("#f4f8fe"))
            pdf.setStrokeColor(colors.HexColor("#d6e0ee"))
            pdf.roundRect(x, yy - box_h, box_w, box_h, 3 * mm, stroke=1, fill=1)
            pdf.setFillColor(colors.HexColor("#607691"))
            pdf.setFont("Helvetica", 8)
            pdf.drawString(x + 3 * mm, yy - 3.8 * mm, label)
            pdf.setFillColor(colors.HexColor("#102a4c"))
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawRightString(x + box_w - 3 * mm, yy - 3.8 * mm, value)

        return y - 4 * (box_h + 3 * mm) - 2 * mm

    def draw_currency_table(title, table_data, top_y):
        pdf.setFillColor(colors.HexColor("#163a64"))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(16 * mm, top_y, title)

        y = top_y - 4 * mm
        row_h = 7 * mm
        col1_x = 16 * mm
        col2_x = 90 * mm
        pdf.setStrokeColor(colors.HexColor("#d8e0eb"))
        for currency in ("USD", "SCR", "Euro"):
            pdf.setFillColor(colors.HexColor("#ffffff"))
            pdf.rect(col1_x, y - row_h, 55 * mm, row_h, stroke=1, fill=1)
            pdf.rect(col2_x, y - row_h, 35 * mm, row_h, stroke=1, fill=1)
            pdf.setFillColor(colors.HexColor("#102a4c"))
            pdf.setFont("Helvetica", 9)
            pdf.drawString(col1_x + 2 * mm, y - 4.5 * mm, currency)
            value = f"{table_data.get(currency, 0):,.2f}"
            pdf.drawRightString(col2_x + 33 * mm, y - 4.5 * mm, value)
            y -= row_h
        return y - 3 * mm

    def draw_aged_bars(top_y):
        aged = data["aged_debtors"]
        labels = [("0-30", aged["0_30"]), ("31-60", aged["31_60"]), ("61-90", aged["61_90"]), ("90+", aged["90_plus"])]
        max_value = max([1.0] + [v for _, v in labels])

        pdf.setFillColor(colors.HexColor("#163a64"))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(120 * mm, top_y, "Aged Debtors")

        chart_x = 120 * mm
        chart_y = top_y - 31 * mm
        chart_w = 70 * mm
        bar_h = 5 * mm

        for i, (label, value) in enumerate(labels):
            y = chart_y + (3 - i) * 8 * mm
            bar_w = (value / max_value) * (chart_w - 24 * mm)
            pdf.setFillColor(colors.HexColor("#ecf2fb"))
            pdf.rect(chart_x + 18 * mm, y, chart_w - 24 * mm, bar_h, stroke=0, fill=1)
            pdf.setFillColor(colors.HexColor("#e58a2b"))
            pdf.rect(chart_x + 18 * mm, y, bar_w, bar_h, stroke=0, fill=1)
            pdf.setFillColor(colors.HexColor("#607691"))
            pdf.setFont("Helvetica", 8)
            pdf.drawString(chart_x, y + 1.5 * mm, label)
            pdf.setFillColor(colors.HexColor("#102a4c"))
            pdf.drawRightString(chart_x + chart_w, y + 1.5 * mm, f"{value:,.2f}")

        pdf.setFillColor(colors.HexColor("#102a4c"))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(chart_x, chart_y - 5 * mm, f"Total: {aged['total']:,.2f}")

    def draw_top_clients(top_y):
        clients = data["top_clients_by_outstanding"]
        pdf.setFillColor(colors.HexColor("#163a64"))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(16 * mm, top_y, "Top Outstanding Clients")

        y = top_y - 6 * mm
        if not clients:
            pdf.setFillColor(colors.HexColor("#607691"))
            pdf.setFont("Helvetica", 9)
            pdf.drawString(16 * mm, y, "No outstanding balances.")
            return y - 8 * mm

        pdf.setStrokeColor(colors.HexColor("#d8e0eb"))
        pdf.setFillColor(colors.HexColor("#f4f8fe"))
        pdf.rect(16 * mm, y - 7 * mm, 178 * mm, 7 * mm, stroke=1, fill=1)
        pdf.setFillColor(colors.HexColor("#607691"))
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(18 * mm, y - 4.5 * mm, "Client")
        pdf.drawRightString(191 * mm, y - 4.5 * mm, "Outstanding")
        y -= 7 * mm

        for row in clients[:6]:
            pdf.setFillColor(colors.white)
            pdf.rect(16 * mm, y - 7 * mm, 178 * mm, 7 * mm, stroke=1, fill=1)
            pdf.setFillColor(colors.HexColor("#102a4c"))
            pdf.setFont("Helvetica", 8)
            name = (row["client"] or "")[:55]
            pdf.drawString(18 * mm, y - 4.5 * mm, name)
            pdf.drawRightString(191 * mm, y - 4.5 * mm, f"{row['outstanding']:,.2f}")
            y -= 7 * mm
        return y - 3 * mm

    draw_title_block()
    cursor = height - 60 * mm
    cursor = draw_kpis(cursor)
    cursor = draw_currency_table("Invoiced by Currency", data["financials"]["total_invoiced_by_currency"], cursor)
    cursor = draw_currency_table("Collected by Currency", data["financials"]["total_collected_by_currency"], cursor)
    draw_aged_bars(height - 120 * mm)
    draw_top_clients(cursor)

    pdf.showPage()
    pdf.save()

    buffer.seek(0)
    file_name = f"vcca_analytics_report_{data['as_of']}.pdf"
    return send_file(buffer, mimetype="application/pdf", as_attachment=True, download_name=file_name)
