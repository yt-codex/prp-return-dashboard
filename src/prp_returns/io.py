from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path

from .features import clean_text


FIELD_MAP = {
    "Project Name": "project_name",
    "Transacted Price ($)": "price",
    "Area (SQFT)": "area_sqft",
    "Sale Date": "sale_date",
    "Address": "address",
    "Type of Sale": "type_of_sale",
    "Property Type": "property_type",
    "Tenure": "tenure",
    "Completion Date": "completion_date",
    "Postal Code": "postal_code",
    "Postal District": "postal_district",
    "Planning Region": "planning_region",
    "Planning Area": "planning_area",
}


def parse_number(value: object) -> float | None:
    text = clean_text(value).replace(",", "")
    if not text or text in {"-", "N.A", "NA"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_sale_date(value: object):
    text = clean_text(value)
    if not text:
        return None
    for fmt in ("%d %b %Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return None


def read_csv_with_fallback(path: Path) -> list[dict]:
    last_error = None
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with path.open(newline="", encoding=encoding) as handle:
                return list(csv.DictReader(handle))
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    return []


def read_transactions(source_dir: Path) -> tuple[list[dict], dict]:
    files = sorted(source_dir.glob("*.csv"))
    rows: list[dict] = []
    latest_month = None
    for path in files:
        match = re.search(r"(\d{4}-\d{2})", path.name)
        if match:
            latest_month = max(latest_month or match.group(1), match.group(1))
        for raw in read_csv_with_fallback(path):
            row = {target: clean_text(raw.get(source)) for source, target in FIELD_MAP.items()}
            row["price"] = parse_number(raw.get("Transacted Price ($)"))
            row["area_sqft"] = parse_number(raw.get("Area (SQFT)"))
            row["sale_date"] = parse_sale_date(raw.get("Sale Date"))
            if row["postal_district"]:
                row["postal_district"] = row["postal_district"].zfill(2)
            rows.append(row)
    metadata = {"source_files": len(files), "latest_source_month": latest_month}
    return rows, metadata
