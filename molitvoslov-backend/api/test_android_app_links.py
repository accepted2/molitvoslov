"""Regression tests for verified HTTPS App Links and legacy web fallback."""
from unittest.mock import patch

from django.test import SimpleTestCase

from .android_app_links import normalize_fingerprint


class AndroidAppLinksTests(SimpleTestCase):
    def test_normalize_fingerprint(self):
        raw = "a1" * 32
        self.assertEqual(normalize_fingerprint(raw), ":".join(["A1"] * 32))
        self.assertEqual(normalize_fingerprint(":".join(["a1"] * 32)), ":".join(["A1"] * 32))
        self.assertIsNone(normalize_fingerprint("not-a-real-fingerprint"))

    @patch.dict("os.environ", {"ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS": ""})
    def test_unconfigured_does_not_announce_a_fake_association(self):
        response = self.client.get("/.well-known/assetlinks.json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response["Cache-Control"], "no-store")

    @patch.dict(
        "os.environ",
        {"ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS":
         ("ab" * 32) + "," + (":".join(["cd"] * 32))},
    )
    def test_assetlinks_directly_served_at_domain_root(self):
        response = self.client.get("/.well-known/assetlinks.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertNotIn("Location", response)
        payload = response.json()
        self.assertEqual(payload[0]["relation"], ["delegate_permission/common.handle_all_urls"])
        self.assertEqual(payload[0]["target"]["namespace"], "android_app")
        self.assertEqual(payload[0]["target"]["package_name"], "com.accepted2.molitvoslov")
        self.assertEqual(payload[0]["target"]["sha256_cert_fingerprints"], [
            ":".join(["AB"] * 32), ":".join(["CD"] * 32)
        ])

    def test_invalid_method(self):
        response = self.client.post("/.well-known/assetlinks.json")
        self.assertEqual(response.status_code, 405)
