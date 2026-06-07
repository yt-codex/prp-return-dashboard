from __future__ import annotations

import re
from datetime import date


UNKNOWN = "Other/Unknown"


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def property_segment(raw: object) -> str:
    value = clean_text(raw).lower()
    if not value:
        return UNKNOWN
    if "executive condominium" in value:
        return "Executive condominium"
    if value in {"apartment", "condominium"} or "condominium" in value or "apartment" in value:
        return "Private non-landed"
    landed_terms = ("terrace", "semi-detached", "detached", "bungalow", "strata landed")
    if any(term in value for term in landed_terms):
        return "Landed"
    return UNKNOWN


def tenure_group(raw: object) -> str:
    value = clean_text(raw).lower()
    if not value:
        return UNKNOWN
    if "freehold" in value or re.search(r"\b999\b", value):
        return "Freehold/999-year"
    if re.search(r"\b99\b", value):
        return "99-year leasehold"
    return UNKNOWN


def sale_type_group(raw: object) -> str:
    value = clean_text(raw).lower()
    if value == "new sale":
        return "New Sale"
    if value == "resale":
        return "Resale"
    if value == "sub sale":
        return "Sub Sale"
    return "Other"


def completion_year(raw: object) -> int | None:
    value = clean_text(raw)
    if not value or value.lower() in {"uncompleted", "n.a", "na", "-"}:
        return None
    match = re.search(r"(19|20)\d{2}", value)
    return int(match.group(0)) if match else None


def age_bucket(completion: object, buy_date: date) -> str:
    year = completion_year(completion)
    if year is None:
        return "Uncompleted/Unknown"
    age = buy_date.year - year
    if age < 0:
        return "Uncompleted/Unknown"
    if age <= 5:
        return "0-5 years"
    if age <= 10:
        return "6-10 years"
    if age <= 20:
        return "11-20 years"
    if age <= 30:
        return "21-30 years"
    return "31+ years"


SQFT_PER_SQM = 10.7639

FLOOR_AREA_BUCKETS = [
    ("Shoebox / micro (<50 sqm / <538 sqft)", 0, 50),
    ("Compact (50-70 sqm / 538-753 sqft)", 50, 70),
    ("Mid-size (70-90 sqm / 753-969 sqft)", 70, 90),
    ("Standard family (90-120 sqm / 969-1,292 sqft)", 90, 120),
    ("Large family (120-150 sqm / 1,292-1,615 sqft)", 120, 150),
    ("Very large / luxury (≥150 sqm / ≥1,615 sqft)", 150, None),
]


def holding_period_bucket(years: float) -> str:
    if years < 1:
        return "<1 year"
    if years < 3:
        return "1-3 years"
    if years < 5:
        return "3-5 years"
    if years < 10:
        return "5-10 years"
    return "10+ years"


def floor_area_bucket(area_sqft: object) -> str:
    try:
        sqft = float(area_sqft or 0)
    except (TypeError, ValueError):
        return "Unknown area"
    if sqft <= 0:
        return "Unknown area"

    sqm = sqft / SQFT_PER_SQM
    for label, lower, upper in FLOOR_AREA_BUCKETS:
        if sqm >= lower and (upper is None or sqm < upper):
            return label
    return "Unknown area"

