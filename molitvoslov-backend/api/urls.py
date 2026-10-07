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
)
from .mobile_content import MobileContentView
from .bible_content import BibleContentView

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
    path("mobile-content/", MobileContentView.as_view(), name="mobile-content"),
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
    path(
        "auth/logout/",
        LogoutView.as_view(),
        name="logout",
    ),
    path("", include(router.urls)),
]
