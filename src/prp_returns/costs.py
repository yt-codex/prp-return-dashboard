from __future__ import annotations

import math


ASSUMPTIONS = {
    "absd": "Excluded: own-stay/no ABSD assumption.",
    "bsd": "Residential BSD uses current marginal rates: 1% first S$180k, 2% next S$180k, 3% next S$640k, 4% next S$500k, 5% next S$1.5m, 6% above S$3m.",
    "ssd": "Simplified current SSD schedule: 12% under 1 year, 8% 1-2 years, 4% 2-3 years, 0% after 3 years.",
    "agent_commission_rate": 0.02,
    "legal_fee_buy": 3000,
    "legal_fee_sell": 3000,
    "property_tax_rate_annual": 0.002,
    "maintenance_psf_monthly": 0.35,
    "default_ltv": 0.75,
    "mortgage_interest_rate_annual": 0.035,
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


def seller_stamp_duty(price: float, holding_years: float) -> float:
    if holding_years < 1:
        rate = 0.12
    elif holding_years < 2:
        rate = 0.08
    elif holding_years < 3:
        rate = 0.04
    else:
        rate = 0.0
    return round(price * rate, 2)


def annualized_return(start_value: float, end_value: float, years: float) -> float | None:
    if start_value <= 0 or end_value <= 0 or years <= 0:
        return None
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

