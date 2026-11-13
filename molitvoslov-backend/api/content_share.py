"""Public landing for shared liturgical content, without private user data."""
import re
from urllib.parse import unquote

from django.http import HttpResponseBadRequest
from django.shortcuts import render
from django.views.decorators.http import require_GET


PATTERNS = (
    r"bible/[\w.-]+/[1-9]\d{0,2}",
    r"(?:akathist|canon|prayer|reader|hours)/[\w.-]+",
    r"kathisma/(?:[1-9]|1\d|20)",
    r"saint/20\d{2}-\d{2}-\d{2}/(?:life|troparion|kontakion|prayer)",
    r"psalter",
)


def is_public_path(path):
    return isinstance(path, str) and len(path) <= 240 and any(
        re.fullmatch(p, path, flags=re.UNICODE) for p in PATTERNS
    )


@require_GET
def public_share_page(request):
    path = str(request.GET.get("path", ""))
    # Query parameters arrive already URL-decoded from Django.
    if not is_public_path(path):
        return HttpResponseBadRequest("Недопустимая ссылка.")
    return render(request, "api/content_share.html", {
        "app_uri": "molitvoslov://" + path,
        "share_type": path.split("/", 1)[0],
    })
