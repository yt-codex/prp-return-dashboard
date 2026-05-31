from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable

from .features import clean_text


@dataclass(frozen=True)
class RepeatSalePair:
    buy: dict
    sell: dict
    buy_price: float
    sell_price: float
    buy_date: date
    sell_date: date
    holding_years: float


def unit_key(row: dict) -> tuple[str, str, str]:
    return (
        clean_text(row.get("project_name")).upper(),
        clean_text(row.get("address")).upper(),
        clean_text(row.get("postal_code")).upper(),
    )


def make_repeat_sale_pairs(rows: Iterable[dict]) -> list[RepeatSalePair]:
    by_unit: dict[tuple[str, str, str], list[dict]] = {}
    for row in rows:
        if not row.get("sale_date") or not row.get("price") or row.get("price") <= 0:
            continue
        key = unit_key(row)
        if not all(key):
            continue
        by_unit.setdefault(key, []).append(row)

    pairs: list[RepeatSalePair] = []
    for unit_rows in by_unit.values():
        ordered = sorted(unit_rows, key=lambda row: (row["sale_date"], row["price"]))
        for buy, sell in zip(ordered, ordered[1:]):
            buy_date = buy["sale_date"]
            sell_date = sell["sale_date"]
            if sell_date <= buy_date:
                continue
            buy_price = float(buy["price"])
            sell_price = float(sell["price"])
            if buy_price <= 0 or sell_price <= 0:
                continue
            holding_years = (sell_date - buy_date).days / 365.25
            if holding_years <= 0:
                continue
            pairs.append(
                RepeatSalePair(
                    buy=buy,
                    sell=sell,
                    buy_price=buy_price,
                    sell_price=sell_price,
                    buy_date=buy_date,
                    sell_date=sell_date,
                    holding_years=holding_years,
                )
            )
    return pairs

