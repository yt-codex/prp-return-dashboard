from __future__ import annotations

from .costs import (
    ASSUMPTIONS,
    annualized_return,
    buyer_stamp_duty,
    outstanding_principal,
    seller_stamp_duty,
    total_interest_paid,
)
from .features import age_bucket, floor_area_bucket, holding_period_bucket, property_segment, sale_type_group, tenure_group
from .pairs import RepeatSalePair


RETURN_DEFINITIONS = {
    "gross_unlevered": "Price-only return before transaction costs, taxes, maintenance, and financing. Annualized for holding periods of at least 1 year; simple holding-period return under 1 year.",
    "net_basic": "Unlevered return after BSD, SSD when applicable, sale agent commission, and legal fee proxies. Annualized for holding periods of at least 1 year; simple under 1 year.",
    "net_full": "net_basic plus property tax and MCST/maintenance proxies during the holding period. Annualized for holding periods of at least 1 year; simple under 1 year.",
    "levered_basic": "Equity return using default LTV mortgage, amortization, BSD, SSD, sale agent commission, legal fee proxies, and mortgage interest paid. Annualized for holding periods of at least 1 year; simple under 1 year.",
    "levered_full": "levered_basic plus property tax and MCST/maintenance proxies during the holding period. Annualized for holding periods of at least 1 year; simple under 1 year.",
}


def pair_features(pair: RepeatSalePair) -> dict:
    buy = pair.buy
    return {
        "property_segment": property_segment(buy.get("property_type")),
        "tenure_group": tenure_group(buy.get("tenure")),
        "buy_sale_type_group": sale_type_group(buy.get("type_of_sale")),
        "planning_region": buy.get("planning_region") or "Unknown",
        "planning_area": buy.get("planning_area") or "Unknown",
        "postal_district": buy.get("postal_district") or "Unknown",
        "holding_period_bucket": holding_period_bucket(pair.holding_years),
        "floor_area_bucket": floor_area_bucket(buy.get("area_sqft")),
        "buy_year": pair.buy_date.year,
        "sell_year": pair.sell_date.year,
        "age_at_purchase_bucket": age_bucket(buy.get("completion_date"), pair.buy_date),
    }


def cost_components(pair: RepeatSalePair) -> dict:
    area = pair.buy.get("area_sqft") or 0
    years = pair.holding_years
    buy_price = pair.buy_price
    sell_price = pair.sell_price
    annual_property_tax = ((buy_price + sell_price) / 2) * ASSUMPTIONS["property_tax_rate_annual"]
    maintenance = area * ASSUMPTIONS["maintenance_psf_monthly"] * 12 * years if area else 0.0
    loan = buy_price * ASSUMPTIONS["default_ltv"]
    return {
        "bsd": buyer_stamp_duty(buy_price),
        "ssd": seller_stamp_duty(sell_price, pair.buy_date, pair.sell_date),
        "sale_agent": sell_price * ASSUMPTIONS["sale_agent_commission_rate"],
        "buy_legal": ASSUMPTIONS["legal_fee_buy"],
        "sell_legal": ASSUMPTIONS["legal_fee_sell"],
        "property_tax": annual_property_tax * years,
        "maintenance": maintenance,
        "loan": loan,
        "outstanding_principal": outstanding_principal(
            loan,
            ASSUMPTIONS["mortgage_interest_rate_annual"],
            ASSUMPTIONS["mortgage_term_years"],
            years,
        ),
        "interest_paid": total_interest_paid(
            loan,
            ASSUMPTIONS["mortgage_interest_rate_annual"],
            ASSUMPTIONS["mortgage_term_years"],
            years,
        ),
    }


def returns_for_pair(pair: RepeatSalePair) -> list[dict]:
    costs = cost_components(pair)
    years = pair.holding_years
    basic_buy_costs = costs["bsd"] + costs["buy_legal"]
    basic_sell_costs = costs["ssd"] + costs["sale_agent"] + costs["sell_legal"]
    full_holding_costs = costs["property_tax"] + costs["maintenance"]
    downpayment = pair.buy_price - costs["loan"]

    definitions = {
        "gross_unlevered": annualized_return(pair.buy_price, pair.sell_price, years),
        "net_basic": annualized_return(pair.buy_price + basic_buy_costs, pair.sell_price - basic_sell_costs, years),
        "net_full": annualized_return(
            pair.buy_price + basic_buy_costs + full_holding_costs,
            pair.sell_price - basic_sell_costs,
            years,
        ),
        "levered_basic": annualized_return(
            downpayment + basic_buy_costs + costs["interest_paid"],
            pair.sell_price - basic_sell_costs - costs["outstanding_principal"],
            years,
        ),
        "levered_full": annualized_return(
            downpayment + basic_buy_costs + costs["interest_paid"] + full_holding_costs,
            pair.sell_price - basic_sell_costs - costs["outstanding_principal"],
            years,
        ),
    }

    base = pair_features(pair)
    base["holding_years"] = round(years, 3)
    rows = []
    for name, value in definitions.items():
        if value is None:
            continue
        row = dict(base)
        row["return_definition"] = name
        row["return"] = value
        rows.append(row)
    return rows
