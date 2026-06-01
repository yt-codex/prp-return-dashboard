from __future__ import annotations

import math
from datetime import date


ASSUMPTIONS = {
    "absd": "Excluded: own-stay/no ABSD assumption.",
    "bsd": "Residential BSD uses current marginal rates: 1% first S$180k, 2% next S$180k, 3% next S$640k, 4% next S$500k, 5% next S$1.5m, 6% above S$3m.",
    "ssd": "Historical residential SSD schedule by acquisition date: none before 20 Feb 2010; transitional BSD-based regimes in 2010; 16/12/8/4% for 14 Jan 2011-10 Mar 2017 acquisitions; 12/8/4% for 11 Mar 2017-3 Jul 2025 acquisitions; 16/12/8/4% for acquisitions from 4 Jul 2025.",
    "agent_commission": "Modeled as one sale-side agent commission on disposal only; no buyer-agent commission is charged. Actual commissions are negotiable and can differ.",
    "sale_agent_commission_rate": 0.02,
    "legal_fee_buy": 3000,
    "legal_fee_sell": 3000,
    "property_tax_rate_annual": 0.002,
    "maintenance_psf_monthly": 0.35,
    "default_ltv": 0.75,
    "mortgage_interest_rate_annual": 0.02,
    "mortgage_term_years": 25,
}


def marginal_tax(amount: float, brackets: list[tuple[float | None, float]]) -> float:
    remaining = max(0.0, amount)
    total = 0.0
    for width, rate in brackets:
        taxable = remaining if width is None else min(remaining, width)
        if taxable <= 0:
            break
        total += taxable * rate
        remaining -= taxable
    return round(total, 2)


def buyer_stamp_duty(price: float) -> float:
    return marginal_tax(
        price,
        [
            (180_000, 0.01),
            (180_000, 0.02),
            (640_000, 0.03),
            (500_000, 0.04),
            (1_500_000, 0.05),
            (None, 0.06),
        ],
    )


def pre_2018_bsd(price: float) -> float:
    return marginal_tax(price, [(180_000, 0.01), (180_000, 0.02), (None, 0.03)])


def years_held_inclusive(buy_date: date, sell_date: date) -> int:
    years = sell_date.year - buy_date.year
    if (sell_date.month, sell_date.day) > (buy_date.month, buy_date.day):
        years += 1
    return max(1, years)


def seller_stamp_duty(price: float, buy_date: date, sell_date: date) -> float:
    if sell_date <= buy_date:
        return 0.0

    first_ssd = date(2010, 2, 20)
    second_ssd = date(2010, 8, 30)
    third_ssd = date(2011, 1, 14)
    fourth_ssd = date(2017, 3, 11)
    fifth_ssd = date(2025, 7, 4)
    holding_year = years_held_inclusive(buy_date, sell_date)

    if buy_date < first_ssd:
        return 0.0
    if buy_date < second_ssd:
        return pre_2018_bsd(price) if holding_year <= 1 else 0.0
    if buy_date < third_ssd:
        bsd = pre_2018_bsd(price)
        if holding_year <= 1:
            return bsd
        if holding_year <= 2:
            return round(bsd * 2 / 3, 2)
        if holding_year <= 3:
            return round(bsd / 3, 2)
        return 0.0
    if buy_date < fourth_ssd:
        rates = {1: 0.16, 2: 0.12, 3: 0.08, 4: 0.04}
        return round(price * rates.get(holding_year, 0.0), 2)
    if buy_date < fifth_ssd:
        rates = {1: 0.12, 2: 0.08, 3: 0.04}
        return round(price * rates.get(holding_year, 0.0), 2)
    rates = {1: 0.16, 2: 0.12, 3: 0.08, 4: 0.04}
    return round(price * rates.get(holding_year, 0.0), 2)


def annualized_return(start_value: float, end_value: float, years: float) -> float | None:
    if start_value <= 0 or end_value <= 0 or years <= 0:
        return None
    if years < 1:
        return end_value / start_value - 1
    return (end_value / start_value) ** (1 / years) - 1


def outstanding_principal(principal: float, annual_rate: float, term_years: int, elapsed_years: float) -> float:
    if principal <= 0:
        return 0.0
    months_total = max(1, int(round(term_years * 12)))
    months_elapsed = max(0, min(months_total, int(math.floor(elapsed_years * 12))))
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return max(0.0, principal * (1 - months_elapsed / months_total))
    payment = principal * monthly_rate / (1 - (1 + monthly_rate) ** -months_total)
    balance = principal * (1 + monthly_rate) ** months_elapsed - payment * (
        ((1 + monthly_rate) ** months_elapsed - 1) / monthly_rate
    )
    return max(0.0, balance)


def total_interest_paid(principal: float, annual_rate: float, term_years: int, elapsed_years: float) -> float:
    months_total = max(1, int(round(term_years * 12)))
    months_elapsed = max(0, min(months_total, int(math.floor(elapsed_years * 12))))
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return 0.0
    payment = principal * monthly_rate / (1 - (1 + monthly_rate) ** -months_total)
    principal_repaid = principal - outstanding_principal(principal, annual_rate, term_years, elapsed_years)
    return max(0.0, payment * months_elapsed - principal_repaid)
