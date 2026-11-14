from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    TextViewSet,
    PrayerRuleViewSet,
    PrayerRuleItemViewSet,
    UserCollectionViewSet,
    CollectionItemViewSet,
    BookmarkViewSet,
    PsalterViewSet,
    KathismaViewSet,
    PsalmViewSet,
    PsalmVerseViewSet,
    KathismaGloryViewSet,
    ReadingProgressViewSet,
    AkathistViewSet,
    AkathistSectionViewSet,
    CanonViewSet,
    CanonSectionViewSet,
    DailyQuoteViewSet,
    SavedItemViewSet,
    MemorialBookViewSet,
    MemorialPhotoViewSet,
    PersonalPrayerBookViewSet,
    PersonalPrayerViewSet,
    PersonalPrayerBookItemViewSet,
    PersonalPrayerPhotoViewSet,
)

from .auth_views import (
    GoogleAuthView,
    CurrentUserView,
    LogoutView,
    DeleteAccountView,
)
from .account_preferences import AccountPreferencesView
from .content_share import public_share_page
from .shared_invitations import (
    create_shared_invitation, preview_shared_invitation,
    import_shared_invitation, revoke_shared_invitation, preview_shared_photo,
)
from .mobile_content import MobileContentView
from .bible_content import BibleContentView
from .content_updates import OfflineContentUpdatesView, OfflineContentObjectView, OfflineContentManifestView

router = DefaultRouter()

router.register("categories", CategoryViewSet)

router.register("texts", TextViewSet)

router.register("prayer-rules", PrayerRuleViewSet)

router.register("prayer-rule-items", PrayerRuleItemViewSet)

router.register("collections", UserCollectionViewSet, basename="collections")

router.register("collection-items", CollectionItemViewSet, basename="collection-items")

router.register("bookmarks", BookmarkViewSet, basename="bookmarks")
router.register("psalters", PsalterViewSet)
router.register("kathismas", KathismaViewSet)
router.register("psalms", PsalmViewSet)
router.register("psalm-verses", PsalmVerseViewSet)
router.register("kathisma-glories", KathismaGloryViewSet)
router.register("akathists", AkathistViewSet, basename="akathist")

router.register("akathist-sections", AkathistSectionViewSet)
router.register("canons", CanonViewSet, basename="canon")

router.register("canon-sections", CanonSectionViewSet)

router.register("daily-quotes", DailyQuoteViewSet, basename="daily-quotes")

router.register("saved-items", SavedItemViewSet, basename="saved-items")

router.register("reading-progress", ReadingProgressViewSet, basename="reading-progress")

router.register("memorial-books", MemorialBookViewSet, basename="memorial-books")

router.register("memorial-photos", MemorialPhotoViewSet, basename="memorial-photos")

router.register(
    "personal-prayer-books", PersonalPrayerBookViewSet, basename="personal-prayer-books"
)
router.register("personal-prayers", PersonalPrayerViewSet, basename="personal-prayers")
router.register(
    "personal-prayer-book-items",
    PersonalPrayerBookItemViewSet,
    basename="personal-prayer-book-items",
)
router.register(
    "personal-prayer-photos", PersonalPrayerPhotoViewSet, basename="personal-prayer-photos"
)

urlpatterns = [
    path('share/', public_share_page, name='public-content-share'),
    path("shared/create/", create_shared_invitation, name="shared-create"),
    path("shared/<str:token>/", preview_shared_invitation, name="shared-preview"),
    path("shared/<str:token>/photo/<int:index>/", preview_shared_photo, name="shared-photo"),
    path("shared/<str:token>/import/", import_shared_invitation, name="shared-import"),
    path("shared/<str:token>/revoke/", revoke_shared_invitation, name="shared-revoke"),
    path("account-preferences/", AccountPreferencesView.as_view(), name="account-preferences"),
    path("mobile-content/", MobileContentView.as_view(), name="mobile-content"),
    path("content-updates/", OfflineContentUpdatesView.as_view(), name="content-updates"),
    path("content-updates/manifest/", OfflineContentManifestView.as_view(), name="content-update-manifest"),
    path("content-updates/item/", OfflineContentObjectView.as_view(), name="content-update-item"),
    path("bible-content/", BibleContentView.as_view(), name="bible-content"),
    path("calendar/", include("api.calendar_urls")),
    path(
        "auth/google/",
        GoogleAuthView.as_view(),
        name="google-auth",
    ),
    path(
        "auth/me/",
        CurrentUserView.as_view(),
        name="current-user",
    ),
    path("auth/delete-account/", DeleteAccountView.as_view(), name="delete-account"),
    path(
        "auth/logout/",
        LogoutView.as_view(),
        name="logout",
    ),
    path("", include(router.urls)),
]
