from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from prp_returns.io import read_transactions
from prp_returns.aggregation import aggregate_returns
from prp_returns.build import filter_rows_for_trend_basis
from prp_returns.costs import buyer_stamp_duty, seller_stamp_duty
from prp_returns.features import property_segment, tenure_group
from prp_returns.pairs import make_repeat_sale_pairs


def tx(project, address, postal, sale_date, price, property_type="Condominium", tenure="99 yrs from 01/01/2000"):
    return {
        "project_name": project,
        "address": address,
        "postal_code": postal,
        "sale_date": date.fromisoformat(sale_date),
        "price": price,
        "property_type": property_type,
        "tenure": tenure,
        "type_of_sale": "Resale",
        "completion_date": "2010",
        "planning_region": "Central Region",
        "planning_area": "Outram",
        "postal_district": "03",
    }


class PipelineTests(unittest.TestCase):
    def test_make_repeat_sale_pairs_uses_only_next_observed_same_exact_unit(self):
        rows = [
            tx("Alpha", "1 ROAD #01-01", "123456", "2020-01-01", 1_000_000),
            tx("Alpha", "1 ROAD #01-01", "123456", "2021-01-01", 1_100_000),
            tx("Alpha", "1 ROAD #01-01", "123456", "2022-01-01", 1_300_000),
            tx("Alpha", "1 ROAD #01-02", "123456", "2021-06-01", 900_000),
        ]

        pairs = make_repeat_sale_pairs(rows)

        self.assertEqual(
            [(p.buy_price, p.sell_price) for p in pairs],
            [(1_000_000, 1_100_000), (1_100_000, 1_300_000)],
        )

    def test_make_repeat_sale_pairs_excludes_invalid_dates_and_prices(self):
        rows = [
            tx("Beta", "2 ROAD #01-01", "123456", "2020-01-01", 0),
            tx("Beta", "2 ROAD #01-01", "123456", "2021-01-01", 1_100_000),
            tx("Gamma", "3 ROAD #01-01", "123456", "2022-01-01", 1_000_000),
            tx("Gamma", "3 ROAD #01-01", "123456", "2022-01-01", 1_050_000),
        ]

        self.assertEqual(make_repeat_sale_pairs(rows), [])

    def test_property_segment(self):
        cases = [
            ("Apartment", "Private non-landed"),
            ("Condominium", "Private non-landed"),
            ("Executive Condominium", "Executive condominium"),
            ("Terrace House", "Landed"),
            ("Semi-Detached House", "Landed"),
            ("", "Other/Unknown"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(property_segment(raw), expected)

    def test_tenure_group(self):
        cases = [
            ("Freehold", "Freehold/999-year"),
            ("999 yrs from 01/01/1885", "Freehold/999-year"),
            ("99 yrs from 01/01/2020", "99-year leasehold"),
            ("103 yrs from 01/01/1978", "Other/Unknown"),
            ("", "Other/Unknown"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(tenure_group(raw), expected)

    def test_buyer_stamp_duty_residential_2023_rates(self):
        cases = [
            (180_000, 1_800),
            (360_000, 5_400),
            (1_000_000, 24_600),
            (2_000_000, 69_600),
            (4_000_000, 179_600),
        ]
        for price, expected in cases:
            with self.subTest(price=price):
                self.assertEqual(buyer_stamp_duty(price), expected)

    def test_seller_stamp_duty_current_simplified_schedule(self):
        cases = [
            (1_000_000, 0.5, 120_000),
            (1_000_000, 1.5, 80_000),
            (1_000_000, 2.5, 40_000),
            (1_000_000, 3.1, 0),
        ]
        for price, holding_years, expected in cases:
            with self.subTest(holding_years=holding_years):
                self.assertEqual(seller_stamp_duty(price, holding_years), expected)

    def test_aggregate_returns_reports_percentiles_loss_share_and_n(self):
        rows = [
            {"segment": "A", "definition": "gross", "return": -0.10},
            {"segment": "A", "definition": "gross", "return": 0.00},
            {"segment": "A", "definition": "gross", "return": 0.10},
            {"segment": "A", "definition": "gross", "return": 0.20},
        ]

        result = aggregate_returns(rows, ["segment"], "definition", "return")

        self.assertEqual(
            result,
            [
                {
                    "segment": "A",
                    "return_definition": "gross",
                    "n": 4,
                    "median": 0.05,
                    "p25": -0.025,
                    "p75": 0.125,
                    "loss_share": 0.25,
                }
            ],
        )

    def test_read_transactions_accepts_windows_encoded_csvs(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "2024-01.csv"
            path.write_bytes(
                (
                    "Project Name,Transacted Price ($),Area (SQFT),Sale Date,Address,Type of Sale,"
                    "Property Type,Tenure,Completion Date,Postal Code,Postal District,Planning Region,Planning Area\n"
                    "CAFÉ COURT,\"1,000,000\",1000,01 Jan 2024,1 TEST ROAD #01-01,Resale,"
                    "Condominium,Freehold,2010,123456,03,Central Region,Outram\n"
                ).encode("cp1252")
            )

            rows, metadata = read_transactions(Path(tmp))

        self.assertEqual(metadata["latest_source_month"], "2024-01")
        self.assertEqual(rows[0]["project_name"], "CAFÉ COURT")
        self.assertEqual(rows[0]["price"], 1_000_000)

    def test_filter_rows_for_trend_basis_excludes_immature_buy_cohorts_and_partial_sell_year(self):
        rows = [
            {"buy_year": 2022, "sell_year": 2025},
            {"buy_year": 2023, "sell_year": 2026},
            {"buy_year": 2024, "sell_year": 2025},
            {"buy_year": 2026, "sell_year": 2026},
        ]

        buy_rows = filter_rows_for_trend_basis(rows, "buy_year", "2026-04")
        sell_rows = filter_rows_for_trend_basis(rows, "sell_year", "2026-04")

        self.assertEqual([row["buy_year"] for row in buy_rows], [2022, 2023])
        self.assertEqual([row["sell_year"] for row in sell_rows], [2025, 2025])


if __name__ == "__main__":
    unittest.main()
