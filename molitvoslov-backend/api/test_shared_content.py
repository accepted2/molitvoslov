"""Access control and independent-copy tests for invitation sharing."""
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    MemorialBook, MemorialPhoto, PersonalPrayer,
    PersonalPrayerBook, PersonalPrayerBookItem, PersonalPrayerPhoto,
    SavedItem, SharedContentImport, SharedContentInvitation,
)


class SharedContentTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(
            username="share-owner", email="owner@example.org"
        )
        self.recipient = User.objects.create_user(
            username="share-recipient", email="recipient@example.org"
        )
        self.stranger = User.objects.create_user(
            username="share-stranger", email="stranger@example.org"
        )
        self.memorial = MemorialBook.objects.create(
            user=self.owner,
            title="Помянник семьи",
            health_names=["Анна", "Иоанн"],
            repose_names=["Мария"],
        )
        MemorialPhoto.objects.create(
            book=self.memorial,
            storage_path="private/owner-memorial-photo.jpg",
            content_type="image/jpeg",original_name="family.jpg",
        )
        self.book = PersonalPrayerBook.objects.create(
            user=self.owner, title="Домашние молитвы", description="Молитвы утром"
        )
        for index, title in enumerate(["Первая молитва", "Вторая молитва"]):
            prayer = PersonalPrayer.objects.create(
                user=self.owner, title=title, text=f"Текст № {index}"
            )
            PersonalPrayerBookItem.objects.create(
                book=self.book, prayer=prayer, order=index
            )
            PersonalPrayerPhoto.objects.create(
                prayer=prayer,
                storage_path=f"private/owner-prayer-{index}.jpg",
                content_type="image/jpeg",original_name="prayer.jpg",
            )

    def make_share(self, kind, **params):
        self.client.force_authenticate(user=self.owner)
        res=self.client.post(reverse("shared-create"), {
            "kind":kind, **params
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(len(res.data["token"]), 43)
        self.assertNotIn(self.owner.email, res.data["token"])
        return res.data["token"]

    def test_link_holder_can_preview_without_login_but_cannot_import(self):
        self.client.force_authenticate(user=None)
        res=self.client.post(reverse("shared-create"), {
            "kind":"quote", "title":"Пример", "text":"Текст"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        token=self.make_share("quote",title="Пример",text="Текст")
        self.client.force_authenticate(user=None)
        preview=self.client.get(reverse("shared-preview",args=[token]))
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["content"]["text"], "Текст")
        self.assertFalse(preview.data["imported"])
        self.assertEqual(
            self.client.post(reverse("shared-import",args=[token])).status_code,401)

    def test_anonymous_memorial_and_prayerbook_preview_without_storage_leak(self):
        for kind, source in (
            ("memorial", self.memorial), ("prayerbook", self.book)
        ):
            token=self.make_share(kind,source_sync_id=str(source.sync_id))
            self.client.force_authenticate(user=None)
            res=self.client.get(reverse("shared-preview",args=[token]))
            self.assertEqual(res.status_code, 200, res.data)
            self.assertFalse(res.data["imported"])
            self.assertNotIn("storage_path", str(res.data))
            self.assertNotIn("private/owner-", str(res.data))
            if kind == "memorial":
                self.assertEqual(res.data["content"]["health_names"], ["Анна", "Иоанн"])
                self.assertEqual(res.data["content"]["repose_names"], ["Мария"])
            else:
                self.assertEqual(
                    [entry["title"] for entry in res.data["content"]["prayers"]],
                    ["Первая молитва", "Вторая молитва"],
                )
                self.assertEqual(
                    [entry["text"] for entry in res.data["content"]["prayers"]],
                    ["Текст № 0", "Текст № 1"],
                )
            self.assertEqual(
                self.client.post(reverse("shared-import", args=[token])).status_code,
                status.HTTP_401_UNAUTHORIZED,
            )

    def test_quote_import_is_independent_and_idempotent(self):
        token=self.make_share("quote",title="Слово",text="Бог есть любовь")
        invitation=SharedContentInvitation.objects.get()
        self.assertNotEqual(invitation.token_hash, token)
        self.assertNotIn(token, str(invitation.snapshot))
        self.client.force_authenticate(user=self.recipient)
        preview=self.client.get(reverse("shared-preview",args=[token]))
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.data["content"]["text"],"Бог есть любовь")
        self.assertEqual(preview.data["imported"],False)
        first=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(first.status_code,201,first.data)
        copy=SavedItem.objects.get(user=self.recipient)
        self.assertEqual(copy.text,"Бог есть любовь")
        self.assertEqual(copy.source_type,"shared_quote")
        self.assertFalse(SavedItem.objects.filter(user=self.owner).exists())
        duplicate=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(duplicate.status_code,200)
        self.assertTrue(duplicate.data["already_imported"])
        self.assertEqual(first.data["sync_id"],duplicate.data["sync_id"])
        self.assertEqual(SavedItem.objects.filter(user=self.recipient).count(),1)
        self.assertEqual(SharedContentImport.objects.count(),1)

    @patch("api.shared_invitations.upload_bytes")
    @patch("api.shared_invitations.download_bytes",return_value=b"private-image")
    def test_memorial_preview_and_import_copy_photos_safely(self,download,upload):
        token=self.make_share("memorial",source_sync_id=str(self.memorial.sync_id))
        self.client.force_authenticate(user=self.recipient)
        preview=self.client.get(reverse("shared-preview",args=[token]))
        self.assertEqual(preview.status_code,200)
        self.assertNotIn("photos",preview.data["content"])
        self.assertEqual(preview.data["content"]["photo_count"],1)
        self.assertNotIn("private/owner-memorial-photo.jpg",str(preview.data))
        self.assertEqual(preview.data["content"]["health_names"],["Анна","Иоанн"])
        imported=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(imported.status_code,201)
        copy=MemorialBook.objects.get(user=self.recipient)
        self.assertNotEqual(copy.sync_id,self.memorial.sync_id)
        self.assertEqual(copy.health_names,["Анна","Иоанн"])
        self.assertEqual(copy.repose_names,["Мария"])
        self.assertEqual(copy.photos.count(),1)
        self.assertEqual(self.memorial.photos.count(),1)
        photo=copy.photos.get()
        self.assertNotEqual(photo.storage_path,
                            self.memorial.photos.get().storage_path)
        self.assertIn(f"user-{self.recipient.pk}/",photo.storage_path)
        download.assert_called_once()
        upload.assert_called_once()
        self.assertEqual(upload.call_args.args[1],b"private-image")
        # Editing the copy never modifies the original names.
        copy.health_names=["Георгий"]
        copy.save()
        self.memorial.refresh_from_db()
        self.assertEqual(self.memorial.health_names,["Анна","Иоанн"])

    @patch("api.shared_invitations.upload_bytes")
    @patch("api.shared_invitations.download_bytes",return_value=b"prayer-image")
    def test_personal_book_import_clones_prayers_with_photos(self,download,upload):
        token=self.make_share("prayerbook",source_sync_id=str(self.book.sync_id))
        self.client.force_authenticate(user=self.recipient)
        result=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(result.status_code,201)
        copied=PersonalPrayerBook.objects.get(user=self.recipient)
        self.assertNotEqual(copied.sync_id,self.book.sync_id)
        entries=list(copied.items.order_by("order"))
        self.assertEqual([e.prayer.title for e in entries],
                         ["Первая молитва","Вторая молитва"])
        self.assertEqual([e.prayer.text for e in entries],
                         ["Текст № 0","Текст № 1"])
        self.assertTrue(all(e.prayer.user_id==self.recipient.pk for e in entries))
        self.assertTrue(all(e.prayer.photos.count()==1 for e in entries))
        self.assertEqual(download.call_count,2)
        self.assertEqual(upload.call_count,2)
        self.assertTrue(all(e.prayer.photos.first().storage_path.startswith(
            f"user-{self.recipient.pk}/personal-prayers/") for e in entries))
        self.assertEqual(PersonalPrayerPhoto.objects.filter(
            prayer__user=self.owner).count(),2)

    @patch("api.shared_invitations.upload_bytes")
    @patch("api.shared_invitations.download_bytes",side_effect=RuntimeError("Storage failed"))
    def test_photo_failure_rolls_back_memorial_import(self,download,upload):
        token=self.make_share("memorial",source_sync_id=str(self.memorial.sync_id))
        self.client.force_authenticate(user=self.recipient)
        response=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(response.status_code,503)
        self.assertFalse(MemorialBook.objects.filter(user=self.recipient).exists())
        self.assertFalse(SharedContentImport.objects.filter(recipient=self.recipient).exists())
        upload.assert_not_called()

    @patch("api.shared_invitations.delete_object")
    @patch("api.shared_invitations.upload_bytes",
           side_effect=[None,RuntimeError("Second file unavailable")])
    @patch("api.shared_invitations.download_bytes",return_value=b"prayer-image")
    def test_partial_photo_copy_cleans_all_and_rolls_back(
            self,download,upload,delete):
        token=self.make_share("prayerbook",source_sync_id=str(self.book.sync_id))
        self.client.force_authenticate(user=self.recipient)
        response=self.client.post(reverse("shared-import",args=[token]))
        self.assertEqual(response.status_code,503)
        self.assertNotIn("private/owner-prayer",str(response.data))
        self.assertEqual(upload.call_count,2)
        self.assertEqual(delete.call_count,2)
        self.assertFalse(PersonalPrayerBook.objects.filter(
            user=self.recipient).exists())
        self.assertFalse(PersonalPrayer.objects.filter(
            user=self.recipient).exists())
        self.assertFalse(SharedContentImport.objects.filter(
            recipient=self.recipient).exists())

    def test_cannot_share_another_persons_private_book(self):
        self.client.force_authenticate(user=self.stranger)
        for kind,sync_id in [
            ("memorial",self.memorial.sync_id),
            ("prayerbook",self.book.sync_id),
        ]:
            res=self.client.post(reverse("shared-create"),{
                "kind":kind,"source_sync_id":str(sync_id)
            },format="json")
            self.assertEqual(res.status_code,404)
        invalid=self.client.post(reverse("shared-create"),{
            "kind":"memorial","source_sync_id":"not-a-uuid"
        },format="json")
        self.assertEqual(invalid.status_code,400)

    def test_revocation_and_expiry_block_unimported_recipient(self):
        token=self.make_share("quote",title="Короткое",text="Молитва")
        self.client.force_authenticate(user=self.stranger)
        revoke=self.client.post(reverse("shared-revoke",args=[token]))
        self.assertEqual(revoke.status_code,404)
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(
            self.client.post(reverse("shared-revoke",args=[token])).status_code,
            204,
        )
        self.client.force_authenticate(user=self.recipient)
        self.assertEqual(
            self.client.post(reverse("shared-import",args=[token])).status_code,
            404,
        )
        next_token=self.make_share("quote",title="Ещё",text="Текст")
        invite=SharedContentInvitation.objects.get(
            token_hash__isnull=False,kind="quote",revoked_at__isnull=True)
        invite.expires_at=timezone.now()-timedelta(seconds=1)
        invite.save()
        self.client.force_authenticate(user=self.recipient)
        self.assertEqual(
            self.client.get(reverse("shared-preview",args=[next_token])).status_code,404)

    def test_public_web_page_does_not_leak_private_names(self):
        token=self.make_share("memorial",source_sync_id=str(self.memorial.sync_id))
        self.client.force_authenticate(user=None)
        response=self.client.get(reverse("public-content-share"),{"invite":token})
        self.assertEqual(response.status_code,200)
        self.assertNotContains(response,"Анна")
        self.assertNotContains(response,"Мария")
        self.assertContains(response,"molitvoslov://shared/")
        bad=self.client.get(reverse("public-content-share"),{"invite":"bad"})
        self.assertEqual(bad.status_code,400)
