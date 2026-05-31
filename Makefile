PYTHON ?= python3
SOURCE ?= ../data/realis_residential_transactions_monthly
MIN_N ?= 20

.PHONY: update test serve clean

update:
	PYTHONPATH=src $(PYTHON) -m prp_returns.build --source "$(SOURCE)" --out docs/assets --min-n $(MIN_N)

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests -v

serve:
	$(PYTHON) -m http.server 8000 --directory docs

clean:
	rm -f docs/assets/summary.json docs/assets/trend.json docs/assets/metadata.json
