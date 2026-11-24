"""Public deletion request pathway for Google Play, with CSRF protection.

A submitted email is only a request, not evidence of account ownership.
An administrator must verify the request before deleting any account.
"""
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods, require_GET

from .models import AccountDeletionRequest


@csrf_protect
@require_http_methods(["GET", "POST"])
def account_deletion_page(request):
    kind = request.POST.get("kind") if request.method == "POST" else "deletion"
    if kind not in {"privacy", "deletion"}:
        kind = "deletion"
    context = {"kind": kind, "submitted": False}
    if request.method == "POST":
        email = str(request.POST.get("email", "")).strip().lower()
        message = str(request.POST.get("message", "")).strip()
        if len(email) > 254 or len(message) > 1000:
            context["error"] = "Проверьте длину введённых данных."
        else:
            try:
                validate_email(email)
            except ValidationError:
                context["error"] = "Укажите действующий адрес электронной почты."
            else:
                # Limit repeated submissions for the same address; never reveal
                # whether this email is associated with a user account.
                recent = AccountDeletionRequest.objects.filter(
                    email__iexact=email,
                    kind=kind,
                    created_at__gte=timezone.now() - timedelta(hours=24),
                ).count()
                if recent < 3:
                    AccountDeletionRequest.objects.create(
                        email=email, kind=kind, message=message,
                    )
                context["submitted"] = True
    return render(request, "api/account_deletion.html", context)


@require_GET
def privacy_policy_page(request):
    return render(request, "api/privacy_policy.html")
