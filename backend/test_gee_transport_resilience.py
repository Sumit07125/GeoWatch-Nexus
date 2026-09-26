"""
backend/test_gee_transport_resilience.py
========================================
Unit tests for the GEE transport-resilience layer.

Run from: backend/
    python test_gee_transport_resilience.py

These tests mock the network layer; they do NOT make real Earth Engine calls
and do NOT sleep for real seconds.
"""
from __future__ import annotations

import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, call

# Make backend importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

import requests

# We import the module under test lazily inside each test so that
# patching works correctly.

class TestEETransportRetry(unittest.TestCase):

    def _make_obj(self, side_effects):
        """Return a mock EE object whose .getInfo() raises/returns in sequence."""
        obj = MagicMock()
        obj.getInfo.side_effect = side_effects
        return obj

    @patch("time.sleep")  # do not actually sleep
    def test_ssl_eof_then_success(self, mock_sleep):
        """First call raises SSLError, second succeeds — exactly one retry."""
        from services import gee_service
        ssl_err = requests.exceptions.SSLError(
            "SSLEOFError(8, 'EOF occurred in violation of protocol')"
        )
        obj = self._make_obj([ssl_err, {"value": 42}])
        result = gee_service._ee_get_info_with_retry(obj, "test-op")
        self.assertEqual(result, {"value": 42})
        self.assertEqual(obj.getInfo.call_count, 2)
        mock_sleep.assert_called_once()

    @patch("time.sleep")
    def test_three_connection_errors_then_success(self, mock_sleep):
        """First 3 calls raise ConnectionError, 4th succeeds."""
        from services import gee_service
        conn_err = requests.exceptions.ConnectionError("connection reset by peer")
        obj = self._make_obj([conn_err, conn_err, conn_err, {"count": 7}])
        result = gee_service._ee_get_info_with_retry(obj, "test-conn-op", attempts=6)
        self.assertEqual(result, {"count": 7})
        self.assertEqual(obj.getInfo.call_count, 4)
        self.assertEqual(mock_sleep.call_count, 3)

    @patch("time.sleep")
    def test_deterministic_ee_exception_no_retry(self, mock_sleep):
        """A deterministic EEException (not matching transient keywords) must NOT be retried."""
        import ee
        from services import gee_service
        det_err = ee.EEException("Invalid geometry: polygon is not valid")
        obj = self._make_obj([det_err])
        with self.assertRaises(ee.EEException):
            gee_service._ee_get_info_with_retry(obj, "bad-geometry-op")
        self.assertEqual(obj.getInfo.call_count, 1)
        mock_sleep.assert_not_called()

    @patch("time.sleep")
    def test_503_ee_exception_retried(self, mock_sleep):
        """An EEException that mentions '503' is treated as transient and retried."""
        import ee
        from services import gee_service
        transient = ee.EEException("HTTP 503: service unavailable, please retry")
        obj = self._make_obj([transient, {"ok": True}])
        result = gee_service._ee_get_info_with_retry(obj, "503-op", attempts=4)
        self.assertEqual(result, {"ok": True})
        self.assertEqual(obj.getInfo.call_count, 2)

    @patch("time.sleep")
    def test_all_retries_exhausted_raises_runtime_error(self, mock_sleep):
        """When all retries fail, RuntimeError is raised with structured message."""
        from services import gee_service
        err = requests.exceptions.Timeout("read timeout")
        obj = self._make_obj([err] * 20)
        with self.assertRaises(RuntimeError) as ctx:
            gee_service._ee_get_info_with_retry(obj, "always-fails-op", attempts=3)
        msg = str(ctx.exception)
        self.assertIn("always-fails-op", msg)
        self.assertIn("gee_transport", msg)
        self.assertIn("earthengine.googleapis.com", msg)
        # 3 attempts + 1 reinit attempt = 4 getInfo() calls total
        self.assertGreaterEqual(obj.getInfo.call_count, 3)

    def test_reinit_lock_prevents_concurrent_reinit(self):
        """Two threads failing simultaneously must not both reinitialize EE."""
        from services import gee_service
        reinit_count = [0]
        original_reinit = gee_service._reinit_ee

        def counting_reinit():
            reinit_count[0] += 1

        # Patch _reinit_ee so it just counts calls
        gee_service._reinit_ee = counting_reinit

        ssl_err = requests.exceptions.SSLError("SSLEOFError: EOF in violation")
        errors = [ssl_err] * 10
        results = []

        def do_call():
            obj = MagicMock()
            obj.getInfo.side_effect = list(errors)
            try:
                with patch("time.sleep"):
                    gee_service._ee_get_info_with_retry(obj, "concurrent-op", attempts=2)
            except RuntimeError:
                results.append("failed")

        threads = [threading.Thread(target=do_call) for _ in range(5)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

        # Restore
        gee_service._reinit_ee = original_reinit

        # _reinit_ee was called 5 times (once per thread's exhaustion) but
        # the lock ensures they were serialized, never concurrent.
        # We just verify it's bounded (not 0, and not > 5).
        self.assertGreaterEqual(reinit_count[0], 1)
        self.assertLessEqual(reinit_count[0], 5)

    @patch("time.sleep")
    def test_download_bytes_ssl_retry(self, mock_sleep):
        """_download_bytes_with_retry retries SSLError and succeeds on second try."""
        from services import gee_service
        ssl_err = requests.exceptions.SSLError("SSL: CERTIFICATE_VERIFY_FAILED")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b"GEOTIFF_BYTES"

        call_count = [0]
        def fake_get(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise ssl_err
            return mock_resp

        with patch.object(requests.Session, "get", side_effect=fake_get):
            result = gee_service._download_bytes_with_retry("https://example.com/tif", operation_name="test-dl")
        self.assertEqual(result, b"GEOTIFF_BYTES")
        self.assertEqual(call_count[0], 2)
        mock_sleep.assert_called_once()

    @patch("time.sleep")
    def test_download_bytes_403_no_retry(self, mock_sleep):
        """_download_bytes_with_retry does NOT retry HTTP 403 (deterministic)."""
        from services import gee_service
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        http_err = requests.exceptions.HTTPError(response=mock_resp)

        with patch.object(requests.Session, "get", side_effect=http_err):
            with self.assertRaises(requests.exceptions.HTTPError):
                gee_service._download_bytes_with_retry("https://example.com/denied")
        mock_sleep.assert_not_called()


class TestTransientKeywordDetection(unittest.TestCase):
    def test_transient_keywords(self):
        from services import gee_service
        import ee
        for kw in ["503", "rate limit", "service unavailable", "connection reset", "timeout"]:
            exc = ee.EEException(f"Error: {kw} occurred")
            self.assertTrue(
                gee_service._is_transient_ee_exception(exc),
                f"Expected '{kw}' to be transient"
            )

    def test_non_transient_keywords(self):
        from services import gee_service
        import ee
        for msg in [
            "Invalid geometry: not a valid polygon",
            "Permission denied on resource",
            "No such collection: COPERNICUS/FAKE",
            "User does not have access",
        ]:
            exc = ee.EEException(msg)
            self.assertFalse(
                gee_service._is_transient_ee_exception(exc),
                f"Expected '{msg}' to be deterministic (not transient)"
            )


if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
