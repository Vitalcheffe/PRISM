# Data sources

All 47 baseline lever values are real, sourced from:

- **World Bank Open Data (WDI)** — indicators with exact codes (e.g., `NY.GDP.MKTP.CD`, `SP.POP.TOTL`, `SL.UEM.TOTL.ZS`, `BX.KLT.DINV.CD.WD`)
- **Loi de Finances Maroc 2023** — fiscal levers (vat_rate, corporate_tax, subsidies_budget, public_wage_bill)
- **Bank Al-Maghrib** — monetary levers (policy_rate, reserve_ratio, exchange_rate, money_supply)
- **IMF Article IV Consultation** — macro levers (debt_to_gdp, fiscal_deficit, current_account, fx_reserves)
- **UN PAGE Morocco** — social levers (hdi, school_enrollment, life_expectancy, gender_index)

Zero mock data. Every lever traces to a real source. See `docs/data-provenance-{dark,light}.png` for the visual mapping.

The `results.json` file in the parent directory is auto-generated from the actual `SimulationEngine` after 100 ticks of steady-state. It is not hand-edited.
