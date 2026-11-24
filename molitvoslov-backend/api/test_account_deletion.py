"""Regression tests for authenticated account deletion and public requests."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    AccountDeletionRequest,
    AccountPreferences,
    GoogleAccount,
    MemorialBook,
    MemorialPhoto,
    SavedItem,
)


class DeleteAccountAPITests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="deleting_user", email="delete@example.com"
        )
        GoogleAccount.objects.create(
            user=self.user,
            google_sub="google-12345",
            email="delete@example.com",
        )
        SavedItem.objects.create(
            user=self.user,
            save_type="fragment",
            source_type="bible",
            source_id=1,
            anchor_type="verse",
            anchor_id=1,
            text="Saved passage",
        )
        AccountPreferences.objects.create(
            user=self.user, settings={"palette": "night"}
        )
        self.book = MemorialBook.objects.create(user=self.user, title="My memorial")
        self.photo = MemorialPhoto.objects.create(
            book=self.book, storage_path="user-1/my-photo.webp",
        )
        self.url = reverse("delete-account")

    def test_requires_authentication_and_explicit_confirmation(self):
        response = self.client.post(
            self.url, {"confirmation": "DELETE"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url, {"confirmation": "NO"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(get_user_model().objects.filter(pk=self.user.pk).exists())

    @patch("api.auth_views.delete_object")
    def test_removes_storage_and_all_owned_database_rows(self, remove):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url, {"confirmation": "DELETE"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        remove.assert_called_once_with("user-1/my-photo.webp")
        self.assertFalse(get_user_model().objects.filter(pk=self.user.pk).exists())
        self.assertFalse(SavedItem.objects.filter(user_id=self.user.pk).exists())
        self.assertFalse(GoogleAccount.objects.filter(user_id=self.user.pk).exists())
        self.assertFalse(AccountPreferences.objects.filter(user_id=self.user.pk).exists())
        self.assertFalse(MemorialPhoto.objects.filter(book_id=self.book.pk).exists())

    @patch("api.auth_views.delete_object", side_effect=RuntimeError("Storage unavailable"))
    def test_does_not_delete_account_if_storage_cleanup_fails(self, remove):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            self.url, {"confirmation": "DELETE"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertTrue(get_user_model().objects.filter(pk=self.user.pk).exists())
        self.assertTrue(SavedItem.objects.filter(user_id=self.user.pk).exists())
        self.assertTrue(MemorialPhoto.objects.filter(book_id=self.book.pk).exists())


class PublicDeletionPageTests(TestCase):
    def test_public_deletion_and_privacy_pages_are_accessible(self):
        response = self.client.get(reverse("account-deletion-web"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Молитвослов")
        privacy = self.client.get(reverse("privacy-policy"))
        self.assertEqual(privacy.status_code, 200)
        self.assertContains(privacy, "Политика конфиденциальности")

    def test_request_is_not_an_unverified_account_deletion(self):
        response = self.client.post(reverse("account-deletion-web"), {
            "email": "OWNER@EXAMPLE.COM",
            "kind": "deletion",
        })
        self.assertEqual(response.status_code, 200)
        request = AccountDeletionRequest.objects.get()
        self.assertEqual(request.email, "owner@example.com")
        self.assertEqual(request.status, "pending")
        self.assertEqual(request.kind, "deletion")

    def test_rate_limit_and_invalid_email(self):
        url = reverse("account-deletion-web")
        self.client.post(url, {"email": "invalid", "kind": "privacy"})
        self.assertEqual(AccountDeletionRequest.objects.count(), 0)
        for _ in range(5):
            self.client.post(url, {"email": "owner@example.com", "kind": "privacy"})
        self.assertEqual(AccountDeletionRequest.objects.count(), 3)

    def test_csrf_protection_on_public_request(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post(reverse("account-deletion-web"), {
            "email": "owner@example.com", "kind": "deletion"
        })
        self.assertEqual(response.status_code, 403)
        self.assertEqual(AccountDeletionRequest.objects.count(), 0)
