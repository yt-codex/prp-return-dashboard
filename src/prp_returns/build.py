from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .aggregation import aggregate_returns
from .costs import ASSUMPTIONS
from .io import read_transactions
from .pairs import make_repeat_sale_pairs
from .returns import RETURN_DEFINITIONS, returns_for_pair


SUMMARY_DIMENSIONS = [
    "property_segment",
    "tenure_group",
    "buy_sale_type_group",
    "planning_region",
    "planning_area",
    "postal_district",
    "age_at_purchase_bucket",
    "holding_period_bucket",
    "buy_year",
    "sell_year",
]

TREND_BUY_COHORT_MIN_OBSERVATION_YEARS = 3


def filter_rows_for_trend_basis(rows: list[dict], basis: str, latest_source_month: str | None) -> list[dict]:
    if not latest_source_month:
        return rows
    try:
        latest_year_text, latest_month_text = latest_source_month.split("-", 1)
        latest_year = int(latest_year_text)
        latest_month = int(latest_month_text)
    except ValueError:
        return rows

    if basis == "buy_year":
        max_buy_year = latest_year - TREND_BUY_COHORT_MIN_OBSERVATION_YEARS
        return [row for row in rows if int(row.get("buy_year", latest_year + 1)) <= max_buy_year]
    if basis == "sell_year" and latest_month < 12:
        return [row for row in rows if int(row.get("sell_year", latest_year)) < latest_year]
    return rows


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def build(source_dir: Path, out_dir: Path, min_n: int) -> dict:
    transactions, source_meta = read_transactions(source_dir)
    valid_rows = [row for row in transactions if row.get("sale_date") and row.get("price")]
    pairs = make_repeat_sale_pairs(valid_rows)
    return_rows = [row for pair in pairs for row in returns_for_pair(pair)]

    summary = []
    for dimension in SUMMARY_DIMENSIONS:
        for row in aggregate_returns(return_rows, [dimension], min_n=min_n):
            row["cut"] = dimension
            row["value"] = row.pop(dimension)
            summary.append(row)

    trend_rows = []
    trend_filter_fields = ["property_segment", "tenure_group", "planning_region", "holding_period_bucket"]
    for basis in ("buy_year", "sell_year"):
        trend_source_rows = filter_rows_for_trend_basis(return_rows, basis, source_meta.get("latest_source_month"))
        for row in aggregate_returns(trend_source_rows, [basis], min_n=min_n):
            row["time_basis"] = basis
            row["year"] = row.pop(basis)
            for field in trend_filter_fields:
                row[field] = "All"
            trend_rows.append(row)
        for field in trend_filter_fields:
            for row in aggregate_returns(trend_source_rows, [basis, field], min_n=min_n):
                row["time_basis"] = basis
                row["year"] = row.pop(basis)
                value = row.pop(field)
                for filter_field in trend_filter_fields:
                    row[filter_field] = value if filter_field == field else "All"
                trend_rows.append(row)

    metadata = {
        **source_meta,
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "transaction_rows": len(transactions),
        "valid_transaction_rows": len(valid_rows),
        "repeat_sale_pairs": len(pairs),
        "return_rows": len(return_rows),
        "min_n": min_n,
        "return_definitions": RETURN_DEFINITIONS,
        "assumptions": ASSUMPTIONS,
        "trend_policy": {
            "buy_year": f"Excludes buy cohorts with less than {TREND_BUY_COHORT_MIN_OBSERVATION_YEARS} years of observation from the latest source month.",
            "sell_year": "Excludes the latest sell year when the source month is not December, because it is an incomplete calendar year.",
        },
        "privacy": "Assets contain aggregate statistics only; raw rows, addresses, postal codes, and unit-level chains are not exported.",
    }

    write_json(out_dir / "summary.json", summary)
    write_json(out_dir / "trend.json", trend_rows)
    write_json(out_dir / "metadata.json", metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Build aggregate repeat-sale return assets.")
    parser.add_argument("--source", type=Path, default=Path("../data/realis_residential_transactions_monthly"))
    parser.add_argument("--out", type=Path, default=Path("docs/assets"))
    parser.add_argument("--min-n", type=int, default=5)
    args = parser.parse_args()
    metadata = build(args.source, args.out, args.min_n)
    print(
        f"Built assets from {metadata['transaction_rows']} rows, "
        f"{metadata['repeat_sale_pairs']} repeat-sale pairs, latest source {metadata['latest_source_month']}."
    )


if __name__ == "__main__":
    main()
