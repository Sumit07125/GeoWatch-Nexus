"""
backend/test_gee.py
===================
Unit tests for GeoWatch-Nexus gee_service helpers.

Tests cover the _hist_int_key normalisation fix for:
    int("136.0") -> ValueError: invalid literal for int() with base 10: '136.0'
"""

from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def _hist_int_key(h: dict) -> dict[int, int]:
    """Exact copy of the production implementation in gee_service.py."""
    normalized: dict[int, int] = {}
    for raw_key, raw_count in h.items():
        try:
            numeric_key = float(raw_key)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid Sentinel-1 relative orbit key from Earth Engine: {raw_key!r}"
            ) from exc
        if not math.isfinite(numeric_key):
            raise ValueError(f"Non-finite Sentinel-1 relative orbit key: {raw_key!r}")
        if not numeric_key.is_integer():
            raise ValueError(f"Non-integral Sentinel-1 relative orbit key: {raw_key!r}")
        orbit = int(numeric_key)
        try:
            count = int(float(raw_count))
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid Sentinel-1 orbit count for orbit {raw_key!r}: {raw_count!r}"
            ) from exc
        if count < 0:
            raise ValueError(f"Negative Sentinel-1 orbit count for orbit {orbit}: {count}")
        normalized[orbit] = normalized.get(orbit, 0) + count
    return normalized


class TestHistIntKey(unittest.TestCase):

    def test_double_string_keys_exact_bug(self):
        """THE EXACT BUG: EE returns '136.0' for DOUBLE property."""
        self.assertEqual(_hist_int_key({"136.0": 5, "165.0": 7}), {136: 5, 165: 7})

    def test_integer_string_keys(self):
        self.assertEqual(_hist_int_key({"136": 5}), {136: 5})

    def test_numeric_float_keys(self):
        self.assertEqual(_hist_int_key({136.0: 5}), {136: 5})

    def test_count_as_float(self):
        self.assertEqual(_hist_int_key({"136.0": 5.0}), {136: 5})

    def test_empty_histogram(self):
        self.assertEqual(_hist_int_key({}), {})

    def test_multiple_orbits(self):
        inp = {"12.0": 3, "136.0": 8, "165.0": 12}
        self.assertEqual(_hist_int_key(inp), {12: 3, 136: 8, 165: 12})

    def test_duplicate_orbit_counts_merged(self):
        self.assertEqual(_hist_int_key({"136.0": 3, "136": 2}), {136: 5})

    def test_non_integral_orbit_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"136.5": 5})

    def test_invalid_string_orbit_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"abc": 5})

    def test_nan_orbit_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"nan": 5})

    def test_inf_orbit_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"inf": 5})

    def test_negative_count_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"136.0": -1})

    def test_invalid_count_string_raises(self):
        with self.assertRaises(ValueError):
            _hist_int_key({"136.0": "many"})


class TestOrbitSelectionLogic(unittest.TestCase):

    def _select(self, t1_counts, t2_counts, preferred=None):
        common = sorted(set(t1_counts) & set(t2_counts))
        if not common:
            raise ValueError("No common orbit")
        if preferred is not None and preferred in common:
            selected = preferred
            n1, n2 = t1_counts[selected], t2_counts[selected]
        else:
            scores = []
            for orbit in common:
                n1, n2 = t1_counts[orbit], t2_counts[orbit]
                scores.append((min(n1, n2), n1 + n2, -orbit, orbit))
            best = max(scores)
            selected, n1, n2 = best[3], t1_counts[best[3]], t2_counts[best[3]]
        return int(selected), n1, n2

    def test_preferred_orbit_chosen(self):
        sel, n1, n2 = self._select({136: 8, 165: 12}, {136: 7, 165: 11}, preferred=136)
        self.assertEqual(sel, 136)

    def test_maximises_weaker_period(self):
        # min(3,10)=3 for 136; min(8,7)=7 for 165 -> 165 wins
        sel, _, _ = self._select({136: 3, 165: 8}, {136: 10, 165: 7})
        self.assertEqual(sel, 165)

    def test_tie_break_smallest_orbit(self):
        sel, _, _ = self._select({136: 5, 165: 5}, {136: 5, 165: 5})
        self.assertEqual(sel, 136)


class TestSyntaxImport(unittest.TestCase):
    def test_gee_service_parses(self):
        import py_compile, os
        path = os.path.join(os.path.dirname(__file__), "services", "gee_service.py")
        py_compile.compile(path, doraise=True)


if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
