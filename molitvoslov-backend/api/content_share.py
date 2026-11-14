"""Public landing for shared liturgical content, without private user data."""

import os
import re
from urllib.parse import unquote

from django.http import HttpResponseBadRequest
from django.shortcuts import render
from django.views.decorators.http import require_GET


PATTERNS = (
    r"bible/[\w.-]+/[1-9]\d{0,2}(?:/(?:rst|csl_traditional)(?:/[1-9]\d{0,2})?)?",
    r"bible-book/[\w.-]+(?:/(?:rst|csl_traditional))?",
    r"(?:akathist|canon|prayer|reader|hours)/[\w.-]+(?:/[1-9]\d{0,8})?",
    r"kathisma/(?:[1-9]|1\d|20)(?:/[1-9]\d{0,2}/(?:church|russian|traditional|both))?",
    r"saint/20\d{2}-\d{2}-\d{2}/(?:life|troparion|kontakion|prayer)(?:/[\w.-]+)?",
    r"psalter",
)


def is_public_path(path):
    return (
        isinstance(path, str)
        and len(path) <= 240
        and any(re.fullmatch(p, path, flags=re.UNICODE) for p in PATTERNS)
    )


@require_GET
def public_share_page(request):
    # The fallback page is only seen when Android App Links are not verified,
    # the APK is missing, or the messenger opens links inside its own browser.
    # Do not advertise an unpublished Play Store listing.
    store_url = os.environ.get("MOLITVOSLOV_PLAY_STORE_URL", "").strip()
    if not store_url.startswith(
        "https://play.google.com/store/apps/details?id=com.accepted2.molitvoslov"
    ):
        store_url = ""
    invite = str(request.GET.get("invite", ""))
    if invite:
        # The public landing never previews private names or texts.
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", invite):
            return HttpResponseBadRequest("Недопустимая ссылка.")
        return render(
            request,
            "api/content_share.html",
            {
                "app_uri": "molitvoslov://shared/" + invite,
                "is_invitation": True,
                "store_url": store_url,
            },
        )
    path = str(request.GET.get("path", ""))
    # Query parameters arrive already URL-decoded from Django.
    if not is_public_path(path):
        return HttpResponseBadRequest("Недопустимая ссылка.")
    return render(
        request,
        "api/content_share.html",
        {
            "app_uri": "molitvoslov://" + path,
            "share_type": path.split("/", 1)[0],
            "store_url": store_url,
        },
    )
