# Singapore Private Residential Repeat-Sale Return Dashboard

Static GitHub Pages-ready dashboard for historical repeat-sale returns using local REALIS private residential monthly transaction CSVs.

## Quick Start

```bash
make update
make test
make serve
```

The static site lives in `docs/` and can be served by GitHub Pages. The generated assets in `docs/assets/` are compact aggregate JSON files only; they do not include raw transaction rows, addresses, postal codes, or unit-level chains.

## Data Pipeline

`make update` reads CSVs from `../data/realis_residential_transactions_monthly` by default. Override with:

```bash
make update SOURCE=/path/to/monthly/csvs MIN_N=10
```

The pipeline:

1. Reads all monthly CSVs in the source directory.
2. Normalizes an exact unit key from `Project Name + Address + Postal Code`.
3. Parses prices, areas, sale dates, and relevant categorical fields.
4. Sorts transactions within each exact unit and emits sequential pairs only: each observed sale to the next observed sale.
5. Excludes invalid pairs with missing/non-positive prices or non-increasing sale dates.
6. Engineers segment, tenure, sale type, location, age, year, and holding-period buckets.
7. Computes pre-defined return definitions and exports aggregate percentiles.

## Return Definitions

No ABSD is included, under an own-stay simplifying assumption.

- `gross_unlevered`: price-only CAGR.
- `net_basic`: includes buyer stamp duty, seller stamp duty where applicable, sale agent commission, and legal fee proxies.
- `net_full`: `net_basic` plus property tax and MCST/maintenance proxies.
- `levered_basic`: default LTV/downpayment mortgage equity CAGR with amortization, mortgage interest paid, and selected transaction costs.
- `levered_full`: `levered_basic` plus property tax and MCST/maintenance proxies.

See `docs/assets/metadata.json` after `make update` for the exact assumption values used in the build.

## Cuts

The dashboard includes aggregate cuts by property segment, tenure group, buy sale type, planning region, planning area, postal district, age at purchase, holding-period bucket, buy year, and sell year. Apartment and Condominium are combined as `Private non-landed`; Freehold and 999-year are combined as `Freehold/999-year`.

Time trend assets are seasoned for comparability: buy-year trends exclude purchase cohorts with less than 3 years of observation from the latest source month, and sell-year trends exclude the latest calendar year when the source month is not December.

## Caveats

Repeat-sale returns are based on observed transactions only. Renovation costs, rental income, vacancy, CPF usage/accrued interest, refinancing, buyer-specific stamp duties beyond BSD, and household-specific tax treatment are not modeled. The exact unit key depends on consistency of project, address, and postal code strings in the CSV source.
