from django.conf import settings
from django.contrib.auth import get_user_model

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token

from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GoogleAccount


User = get_user_model()


def serialize_user(user, google_account=None):
    return {
        "id": user.id,
        "email": user.email or "",
        "name": (
            google_account.name
            if google_account
            else " ".join(part for part in [user.first_name, user.last_name] if part).strip()
        ),
        "picture": google_account.picture_url if google_account else "",
    }


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_id_token = str(request.data.get("id_token") or "").strip()

        if not raw_id_token:
            return Response(
                {"detail": "id_token обязателен."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audience = str(getattr(settings, "GOOGLE_OAUTH_WEB_CLIENT_ID", "") or "").strip()

        if not audience:
            return Response(
                {"detail": "Google OAuth не настроен на сервере."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            payload = google_id_token.verify_oauth2_token(
                raw_id_token,
                GoogleRequest(),
                audience,
            )
        except ValueError:
            return Response(
                {"detail": "Недействительный Google ID token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        google_sub = str(payload.get("sub") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        email_verified = bool(payload.get("email_verified"))
        name = str(payload.get("name") or "").strip()
        picture_url = str(payload.get("picture") or "").strip()

        if not google_sub:
            return Response(
                {"detail": "Google не вернул идентификатор пользователя."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not email or not email_verified:
            return Response(
                {"detail": "Google-почта не подтверждена."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        google_account = (
            GoogleAccount.objects.select_related("user").filter(google_sub=google_sub).first()
        )

        if google_account:
            user = google_account.user
        else:
            # Не связываем аккаунты только по email автоматически.
            # Это исключает случайную привязку к старому Django-пользователю.
            username = f"google_{google_sub}"[:150]

            user = User.objects.create(
                username=username,
                email=email,
            )
            user.set_unusable_password()

            if name:
                parts = name.split(maxsplit=1)
                user.first_name = parts[0][:150]
                user.last_name = parts[1][:150] if len(parts) > 1 else ""

            user.save()

            google_account = GoogleAccount.objects.create(
                user=user,
                google_sub=google_sub,
                email=email,
                name=name,
                picture_url=picture_url,
            )

        changed_fields = []

        if user.email != email:
            user.email = email
            changed_fields.append("email")

        google_account.email = email
        google_account.name = name
        google_account.picture_url = picture_url
        google_account.save()

        if changed_fields:
            user.save(update_fields=changed_fields)

        token, _ = Token.objects.get_or_create(user=user)

        return Response(
            {
                "token": token.key,
                "user": serialize_user(user, google_account),
            },
            status=status.HTTP_200_OK,
        )


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        google_account = getattr(request.user, "google_account", None)

        return Response(
            {
                "user": serialize_user(
                    request.user,
                    google_account,
                )
            }
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
