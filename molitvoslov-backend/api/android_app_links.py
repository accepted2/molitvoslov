"""Verified Android App Links for public and invitation share URLs.

The HTTPS URL stays universal. Android opens an installed, verified APK
directly, while devices without it receive the existing web landing.
The signing-certificate SHA-256 fingerprint is NOT a secret, but it must be
taken from the actual APK signing certificate (and later Google Play signing).
"""

import os
import re

from django.http import JsonResponse
from django.views.decorators.http import require_GET

PACKAGE_NAME = "com.accepted2.molitvoslov"
FINGERPRINT_ENV = "ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS"


def normalize_fingerprint(value):
    candidate = re.sub(r"[:\s]", "", str(value or "")).upper()
    if not re.fullmatch(r"[0-9A-F]{64}", candidate):
        return None
    return ":".join(candidate[i : i + 2] for i in range(0, 64, 2))


def configured_fingerprints():
    raw = os.environ.get(FINGERPRINT_ENV, "")
    fingerprints = []
    for part in re.split(r"[,;\n]", raw):
        parsed = normalize_fingerprint(part)
        if parsed and parsed not in fingerprints:
            fingerprints.append(parsed)
    return fingerprints


@require_GET
def android_asset_links(request):
    """Google must fetch /.well-known/assetlinks.json without redirects."""
    fingerprints = configured_fingerprints()
    if not fingerprints:
        # Never claim a verified association without the release APK signature.
        response = JsonResponse(
            {"detail": "Android App Links signing fingerprint is not configured."},
            status=503,
        )
        response["Cache-Control"] = "no-store"
        return response

    response = JsonResponse(
        [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": PACKAGE_NAME,
                    "sha256_cert_fingerprints": fingerprints,
                },
            },
        ],
        safe=False,
    )
    response["Cache-Control"] = "public, max-age=3600"
    return response
