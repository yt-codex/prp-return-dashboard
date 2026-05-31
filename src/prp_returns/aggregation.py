from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


def quantile(values: list[float], q: float) -> float | None:
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    if len(xs) == 1:
        return round(xs[0], 6)
    pos = (len(xs) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    frac = pos - lo
    return round(xs[lo] * (1 - frac) + xs[hi] * frac, 6)


def aggregate_returns(
    rows: Iterable[dict[str, Any]],
    dims: list[str],
    definition_field: str = "return_definition",
    return_field: str = "return",
    min_n: int = 1,
) -> list[dict[str, Any]]:
    groups: dict[tuple[Any, ...], list[float]] = defaultdict(list)
    for row in rows:
        value = row.get(return_field)
        if value is None:
            continue
        key = tuple(row.get(dim, "All") for dim in dims) + (row.get(definition_field),)
        groups[key].append(float(value))
    out = []
    for key, vals in groups.items():
        if len(vals) < min_n:
            continue
        rec = {dim: key[i] for i, dim in enumerate(dims)}
        rec["return_definition"] = key[-1]
        rec["n"] = len(vals)
        rec["median"] = quantile(vals, 0.5)
        rec["p25"] = quantile(vals, 0.25)
        rec["p75"] = quantile(vals, 0.75)
        rec["loss_share"] = round(sum(1 for v in vals if v < 0) / len(vals), 6)
        out.append(rec)
    return sorted(out, key=lambda r: tuple(str(r.get(dim, "")) for dim in dims) + (str(r["return_definition"]),))
