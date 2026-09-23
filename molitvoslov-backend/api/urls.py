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
)


router = DefaultRouter()

router.register(
   'categories',
   CategoryViewSet
)

router.register(
   'texts',
   TextViewSet
)

router.register(
   'prayer-rules',
   PrayerRuleViewSet
)

router.register(
   'prayer-rule-items',
   PrayerRuleItemViewSet
)

router.register(
   'collections',
   UserCollectionViewSet,
   basename='collections'
)

router.register(
   'collection-items',
   CollectionItemViewSet,
   basename='collection-items'
)

router.register(
   'bookmarks',
   BookmarkViewSet,
   basename='bookmarks'
)
router.register(
   'psalters',
   PsalterViewSet
)
router.register(
   'kathismas',
   KathismaViewSet
)
router.register(
   'psalms',
   PsalmViewSet
)
router.register(
   'psalm-verses',
   PsalmVerseViewSet
)
router.register(
   'kathisma-glories',
   KathismaGloryViewSet
)
router.register(
   'akathists',
   AkathistViewSet,
   basename='akathist'
)

router.register(
   'akathist-sections',
   AkathistSectionViewSet
)
router.register(
   'canons',
   CanonViewSet,
   basename='canon'
)

router.register(
   'canon-sections',
   CanonSectionViewSet
)

router.register(
   'daily-quotes',
   DailyQuoteViewSet,
   basename='daily-quotes'
)

router.register(
   'saved-items',
   SavedItemViewSet,
   basename='saved-items'
)

router.register(
   'reading-progress',
   ReadingProgressViewSet,
   basename='reading-progress'
)


urlpatterns = [
   path(
      '',
      include(router.urls)
   ),
]