"""Regression tests: ETag checks must not reserialize the complete public/Bible DB."""
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .bible_content import BibleContentView
from .mobile_content import MobileContentView


class CachedContentTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()

    def tearDown(self):
        cache.clear()

    @patch('api.mobile_content.build_mobile_content_payload')
    def test_public_304_avoids_second_serialization(self, build):
        build.return_value = {'content_version': 'revision1', 'schema_version': 1}
        url = '/api/mobile-content/'
        first = MobileContentView.as_view()(self.factory.get(url))
        second = MobileContentView.as_view()(self.factory.get(url, HTTP_IF_NONE_MATCH='"revision1"'))
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 304)
        self.assertEqual(build.call_count, 1)

    @patch('api.bible_content.build_bible_content_payload')
    def test_bible_304_avoids_second_serialization(self, build):
        build.return_value = {'content_version': 'revision2', 'schema_version': 1}
        url = '/api/bible-content/?translation=rst'
        first = BibleContentView.as_view()(self.factory.get(url))
        second = BibleContentView.as_view()(self.factory.get(url, HTTP_IF_NONE_MATCH='"revision2"'))
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 304)
        self.assertEqual(build.call_count, 1)
