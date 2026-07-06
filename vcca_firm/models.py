from datetime import date, datetime
from decimal import Decimal

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class SerializableMixin:
    def to_dict(self):
        data = {}
        for column in self.__table__.columns:
            value = getattr(self, column.name)
            if isinstance(value, (datetime, date)):
                value = value.isoformat()
            elif isinstance(value, Decimal):
                value = float(value)
            data[column.name] = value
        return data


class User(UserMixin, SerializableMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(80), nullable=False, default="")
    last_name = db.Column(db.String(80), nullable=False, default="")
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    email = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="User")
    status = db.Column(db.String(10), default="Active")
    must_reset = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)


class Prospect(SerializableMixin, db.Model):
    __tablename__ = "prospects"

    id = db.Column(db.Integer, primary_key=True)
    company_name = db.Column(db.String(150), nullable=False, index=True)
    contact_person = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100), index=True)
    service_required = db.Column(db.String(100), index=True)
    lead_source = db.Column(db.String(80))
    marketing_status = db.Column(db.String(50), default="New", index=True)
    quotation_status = db.Column(db.String(30), default="None", index=True)
    notes = db.Column(db.Text)
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Quotation(SerializableMixin, db.Model):
    __tablename__ = "quotations"

    id = db.Column(db.Integer, primary_key=True)
    prospect_id = db.Column(db.Integer, db.ForeignKey("prospects.id", ondelete="CASCADE"), index=True)
    quotation_ref = db.Column(db.String(50), unique=True, nullable=False, index=True)
    service_description = db.Column(db.Text)
    amount = db.Column(db.Numeric(12, 2))
    currency = db.Column(db.String(30), nullable=False, default="USD", index=True)
    sent_date = db.Column(db.Date)
    status = db.Column(db.String(20), default="Pending", index=True)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Client(SerializableMixin, db.Model):
    __tablename__ = "clients"

    id = db.Column(db.Integer, primary_key=True)
    prospect_id = db.Column(db.Integer, db.ForeignKey("prospects.id"), index=True)
    quotation_id = db.Column(db.Integer, db.ForeignKey("quotations.id"), index=True)
    company_name = db.Column(db.String(150), nullable=False, index=True)
    contact_person = db.Column(db.String(100))
    phone = db.Column(db.String(30))
    email = db.Column(db.String(100), index=True)
    service_type = db.Column(db.String(100), index=True)
    engagement_letter_status = db.Column(db.String(30), default="Outstanding", index=True)
    engagement_letter_date = db.Column(db.Date)
    onboarding_complete = db.Column(db.Boolean, default=False, index=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Project(SerializableMixin, db.Model):
    __tablename__ = "projects"

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    service_type = db.Column(db.String(80), nullable=False, index=True)
    description = db.Column(db.Text)
    start_date = db.Column(db.Date, index=True)
    expected_completion = db.Column(db.Date, index=True)
    actual_completion = db.Column(db.Date)
    status = db.Column(db.String(30), default="Not Started", index=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Invoice(SerializableMixin, db.Model):
    __tablename__ = "invoices"

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"), index=True)
    invoice_ref = db.Column(db.String(50), unique=True, nullable=False, index=True)
    currency = db.Column(db.String(30), nullable=False, default="USD", index=True)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    amount_paid = db.Column(db.Numeric(12, 2), default=0)
    issue_date = db.Column(db.Date, nullable=False)
    due_date = db.Column(db.Date, nullable=False, index=True)
    payment_status = db.Column(db.String(20), default="Unpaid", index=True)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class Compliance(SerializableMixin, db.Model):
    __tablename__ = "compliance"

    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("clients.id", ondelete="CASCADE"), index=True)
    tax_type = db.Column(db.String(80), nullable=False, index=True)
    tax_period = db.Column(db.String(50))
    filing_deadline = db.Column(db.Date, index=True)
    filing_date = db.Column(db.Date)
    status = db.Column(db.String(30), default="Pending", index=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class ActivityLog(SerializableMixin, db.Model):
    __tablename__ = "activity_log"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), index=True)
    action = db.Column(db.String(100), index=True)
    entity_type = db.Column(db.String(50), index=True)
    entity_id = db.Column(db.Integer, index=True)
    detail = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


def log_activity(user_id, action, entity_type, entity_id=None, detail=""):
    entry = ActivityLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )
    db.session.add(entry)
