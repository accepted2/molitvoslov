import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import MemorialBook, PersonalPrayer, PersonalPrayerBook, PersonalPrayerBookItem


class MemorialBookApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()

        self.user = user_model.objects.create_user(
            username="memorial-owner",
            email="owner@example.com",
            password="test-password",
        )

        self.other_user = user_model.objects.create_user(
            username="other-user",
            email="other@example.com",
            password="test-password",
        )

        self.list_url = reverse("memorial-books-list")

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.user)

    def test_memorial_books_require_authentication(self):
        response = self.client.get(self.list_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_authenticated_user_can_create_memorial_book(self):
        self.authenticate()

        sync_id = uuid.uuid4()

        response = self.client.post(
            self.list_url,
            {
                "sync_id": str(sync_id),
                "title": "Родные",
                "health_names": [
                    "Иоанн",
                    "Мария",
                ],
                "repose_names": [
                    "Петр",
                ],
                "updated_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        book = MemorialBook.objects.get(sync_id=sync_id)

        self.assertEqual(
            book.user,
            self.user,
        )

        self.assertEqual(
            book.title,
            "Родные",
        )

        self.assertEqual(
            book.health_names,
            [
                "Иоанн",
                "Мария",
            ],
        )

        self.assertEqual(
            book.repose_names,
            [
                "Петр",
            ],
        )

    def test_post_with_same_sync_id_updates_existing_book(self):
        self.authenticate()

        sync_id = uuid.uuid4()
        first_updated_at = timezone.now() - timedelta(hours=2)
        newer_updated_at = timezone.now() - timedelta(hours=1)

        first_response = self.client.post(
            self.list_url,
            {
                "sync_id": str(sync_id),
                "title": "Старое название",
                "health_names": [
                    "Анна",
                ],
                "repose_names": [],
                "updated_at": first_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            first_response.status_code,
            status.HTTP_201_CREATED,
        )

        second_response = self.client.post(
            self.list_url,
            {
                "sync_id": str(sync_id),
                "title": "Обновлённый помянник",
                "health_names": [
                    "Анна",
                    "Николай",
                ],
                "repose_names": [
                    "Алексий",
                ],
                "updated_at": newer_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            MemorialBook.objects.filter(
                user=self.user,
                sync_id=sync_id,
            ).count(),
            1,
        )

        book = MemorialBook.objects.get(
            user=self.user,
            sync_id=sync_id,
        )

        self.assertEqual(
            book.title,
            "Обновлённый помянник",
        )

        self.assertEqual(
            book.health_names,
            [
                "Анна",
                "Николай",
            ],
        )

        self.assertEqual(
            book.repose_names,
            [
                "Алексий",
            ],
        )

    def test_user_cannot_see_another_users_memorial_book(self):
        MemorialBook.objects.create(
            user=self.other_user,
            title="Чужой помянник",
            health_names=[
                "Мария",
            ],
        )

        self.authenticate()

        response = self.client.get(self.list_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            len(response.data),
            0,
        )

    def test_delete_soft_deletes_memorial_book(self):
        book = MemorialBook.objects.create(
            user=self.user,
            title="Для удаления",
            health_names=[
                "Иоанн",
            ],
        )

        self.authenticate()

        detail_url = reverse(
            "memorial-books-detail",
            kwargs={
                "sync_id": str(book.sync_id),
            },
        )

        response = self.client.delete(detail_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_204_NO_CONTENT,
        )

        book.refresh_from_db()

        self.assertIsNotNone(book.deleted_at)

        visible_response = self.client.get(self.list_url)

        self.assertEqual(
            visible_response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            len(visible_response.data),
            0,
        )

        all_response = self.client.get(
            self.list_url,
            {
                "include_deleted": "1",
            },
        )

        self.assertEqual(
            all_response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            len(all_response.data),
            1,
        )


class PersonalPrayerBookApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="prayer-book-owner",
            email="prayer@example.com",
            password="test-password",
        )
        self.other_user = user_model.objects.create_user(
            username="prayer-book-other",
            email="other-prayer@example.com",
            password="test-password",
        )
        self.client.force_authenticate(user=self.user)

    def test_create_prayer_book_prayer_and_item(self):
        book_sync_id = uuid.uuid4()
        prayer_sync_id = uuid.uuid4()
        item_sync_id = uuid.uuid4()
        now = timezone.now().isoformat()

        book_response = self.client.post(
            reverse("personal-prayer-books-list"),
            {
                "sync_id": str(book_sync_id),
                "title": "Перед дорогой",
                "description": "Личный сборник",
                "updated_at": now,
            },
            format="json",
        )
        self.assertEqual(book_response.status_code, status.HTTP_201_CREATED)

        prayer_response = self.client.post(
            reverse("personal-prayers-list"),
            {
                "sync_id": str(prayer_sync_id),
                "title": "Молитва путешествующего",
                "text": "Господи, благослови путь.",
                "origin_type": "custom",
                "origin_data": {"created_in_app": True},
                "updated_at": now,
            },
            format="json",
        )
        self.assertEqual(prayer_response.status_code, status.HTTP_201_CREATED)

        item_response = self.client.post(
            reverse("personal-prayer-book-items-list"),
            {
                "sync_id": str(item_sync_id),
                "book_sync_id": str(book_sync_id),
                "prayer_sync_id": str(prayer_sync_id),
                "order": 0,
                "updated_at": now,
            },
            format="json",
        )
        self.assertEqual(item_response.status_code, status.HTTP_201_CREATED)

        book = PersonalPrayerBook.objects.get(sync_id=book_sync_id)
        prayer = PersonalPrayer.objects.get(sync_id=prayer_sync_id)
        item = PersonalPrayerBookItem.objects.get(sync_id=item_sync_id)

        self.assertEqual(book.user, self.user)
        self.assertEqual(prayer.user, self.user)
        self.assertEqual(item.book, book)
        self.assertEqual(item.prayer, prayer)

        detail = self.client.get(
            reverse(
                "personal-prayer-books-detail",
                kwargs={"sync_id": str(book_sync_id)},
            )
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail.data["items"]), 1)
        self.assertEqual(
            detail.data["items"][0]["prayer"]["text"],
            "Господи, благослови путь.",
        )

    def test_cannot_add_another_users_prayer(self):
        foreign_book = PersonalPrayerBook.objects.create(
            user=self.other_user,
            title="Чужой сборник",
        )
        foreign_prayer = PersonalPrayer.objects.create(
            user=self.other_user,
            title="Чужая молитва",
            text="Текст",
        )

        response = self.client.post(
            reverse("personal-prayer-book-items-list"),
            {
                "book_sync_id": str(foreign_book.sync_id),
                "prayer_sync_id": str(foreign_prayer.sync_id),
                "order": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
