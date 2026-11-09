from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status


class AccountPreferencesTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="owner")
        self.other = User.objects.create_user(username="other")
        self.url = reverse("account-preferences")

    def test_login_required(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_global_update_does_not_replace_reader_override(self):
        self.client.force_authenticate(user=self.owner)
        original = self.client.patch(self.url, {
            "settings": {"defaultMode": "russian", "fontSize": 19, "interfaceScale": 1.1},
            "reader_overrides": {"canon:123": {
                "fontSize": 25, "palette": "custom",
                "customBackground": "#112233", "customText": "#FFFFFF",
            }},
            "reader_modes": {"prayer_rule:morning": "both"},
        }, format="json")
        self.assertEqual(original.status_code, status.HTTP_200_OK)
        changed = self.client.patch(self.url, {
            "settings": {"palette": "night", "fontSize": 22},
        }, format="json")
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(changed.data["reader_overrides"]["canon:123"]["fontSize"], 25)
        self.assertEqual(changed.data["reader_modes"]["prayer_rule:morning"], "both")
        self.assertEqual(changed.data["settings"]["fontSize"], 22)

    def test_per_user_isolation(self):
        self.client.force_authenticate(user=self.owner)
        self.client.patch(self.url, {"settings": {"palette": "night"}}, format="json")
        self.client.force_authenticate(user=self.other)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["settings"], {})

    def test_override_can_be_reset_without_global_reset(self):
        self.client.force_authenticate(user=self.owner)
        self.client.patch(self.url, {"reader_overrides": {"text:psalm": {"fontSize": 23}}}, format="json")
        response = self.client.patch(self.url, {"reader_overrides": {"text:psalm": None}}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("text:psalm", response.data["reader_overrides"])

    def test_rejects_invalid_palette_and_document_keys(self):
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(self.client.patch(self.url, {"settings": {"palette": "unknown"}}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.client.patch(self.url, {"reader_overrides": {"../../secret": {"fontSize": 20}}}, format="json").status_code, status.HTTP_400_BAD_REQUEST)
