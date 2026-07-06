import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from html import escape

from flask import jsonify, request


PASSWORD_POLICY = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$")


def json_success(data=None, **extra):
    payload = {"success": True, "data": data}
    payload.update(extra)
    return jsonify(payload)


def json_error(message, status=400):
    return jsonify({"success": False, "error": message}), status


def parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def sanitize_text(value):
    if value is None:
        return None
    return escape(str(value).strip())


def sanitize_payload(payload):
    clean = {}
    for key, value in payload.items():
        if isinstance(value, str):
            clean[key] = sanitize_text(value)
        else:
            clean[key] = value
    return clean


def get_json_payload():
    body = request.get_json(silent=True) or {}
    return sanitize_payload(body)


def decimal_or_none(value):
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def decimal_to_float(value):
    if value is None:
        return 0.0
    return float(value)


def int_or_none(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "" or value.lower() in {"null", "none"}:
            return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def bool_from_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def changed_fields(before, after):
    delta = {}
    for key, before_value in before.items():
        after_value = after.get(key)
        if str(before_value) != str(after_value):
            delta[key] = {"from": before_value, "to": after_value}
    return json.dumps(delta)


def validate_password_policy(password):
    return bool(PASSWORD_POLICY.match(password or ""))
