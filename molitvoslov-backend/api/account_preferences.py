"""Authenticated, per-account settings. Never accepts a user id from the client."""
import re

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AccountPreferences


ALLOWED_MODES = {"church", "russian", "both", "traditional"}
ALLOWED_PALETTES = {"parchment", "warm", "ivory", "night", "custom"}
COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
SCOPE = re.compile(r"^[A-Za-z0-9_-]{1,40}:[^\s]{1,180}$")


def validate_settings(values, *, scoped=False):
    if not isinstance(values, dict):
        raise ValueError("settings must be an object")
    allowed = {"fontSize", "palette", "customBackground", "customText"}
    if not scoped:
        allowed |= {"defaultMode", "interfaceScale", "language"}
    result = {}
    for key, value in values.items():
        if key not in allowed:
            raise ValueError("Unknown setting: " + str(key)[:60])
        if key == "fontSize":
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not 14 <= value <= 28:
                raise ValueError("fontSize must be between 14 and 28")
            value = int(value)
        elif key in ("customBackground", "customText"):
            if not isinstance(value, str) or not COLOR.fullmatch(value):
                raise ValueError("Invalid color")
            value = value.upper()
        elif key == "defaultMode":
            if value not in ALLOWED_MODES:
                raise ValueError("Invalid reader language")
        elif key == "palette":
            if value not in ALLOWED_PALETTES:
                raise ValueError("Invalid palette")
        elif key == "language":
            if value not in ("ru", "uk"):
                raise ValueError("Invalid app language")
        elif key == "interfaceScale":
            if isinstance(value, bool) or value not in (1, 1.1, 1.25):
                raise ValueError("Invalid interface scale")
        result[key] = value
    return result


def validate_overrides(values, *, modes=False):
    if not isinstance(values, dict) or len(values) > 500:
        raise ValueError("Overrides must be an object with up to 500 entries")
    result = {}
    for key, value in values.items():
        if not isinstance(key, str) or not SCOPE.fullmatch(key):
            raise ValueError("Invalid document key")
        if value is None:
            result[key] = None
        elif modes:
            if value not in ALLOWED_MODES:
                raise ValueError("Invalid document language")
            result[key] = value
        else:
            result[key] = validate_settings(value, scoped=True)
    return result


def serialize(row):
    return {
        "settings": row.settings,
        "reader_overrides": row.reader_overrides,
        "reader_modes": row.reader_modes,
        "updated_at": row.updated_at.isoformat(),
    }


class AccountPreferencesView(APIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get(self, request):
        row, _ = AccountPreferences.objects.get_or_create(user=request.user)
        return Response(serialize(row))

    def patch(self, request):
        data = request.data
        if not isinstance(data, dict):
            return Response({"detail": "JSON object required"}, status=status.HTTP_400_BAD_REQUEST)
        if any(key not in {"settings", "reader_overrides", "reader_modes"} for key in data):
            return Response({"detail": "Unknown section"}, status=status.HTTP_400_BAD_REQUEST)
        if not data:
            return Response({"detail": "Empty update"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed = {}
            if "settings" in data:
                parsed["settings"] = validate_settings(data["settings"])
            if "reader_overrides" in data:
                parsed["reader_overrides"] = validate_overrides(data["reader_overrides"])
            if "reader_modes" in data:
                parsed["reader_modes"] = validate_overrides(data["reader_modes"], modes=True)
        except (ValueError, TypeError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            row, _ = AccountPreferences.objects.get_or_create(user=request.user)
            row = AccountPreferences.objects.select_for_update().get(pk=row.pk)
            if "settings" in parsed:
                row.settings = {**row.settings, **parsed["settings"]}
            for field in ("reader_overrides", "reader_modes"):
                if field in parsed:
                    merged = dict(getattr(row, field))
                    for key, value in parsed[field].items():
                        if value is None:
                            merged.pop(key, None)
                        else:
                            merged[key] = value
                    if len(merged) > 1000:
                        return Response({"detail": "Too many document preferences"}, status=status.HTTP_400_BAD_REQUEST)
                    setattr(row, field, merged)
            row.save()
        return Response(serialize(row))
