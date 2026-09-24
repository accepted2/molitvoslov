import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    Akathist,
    Canon,
    Category,
    CategoryText,
    DailyQuote,
    Kathisma,
    PrayerRule,
    Psalter,
    Text,
)
from api.serializers import (
    AkathistSerializer,
    AkathistSummarySerializer,
    CanonSerializer,
    CanonSummarySerializer,
    CategorySerializer,
    CategoryTextSerializer,
    DailyQuoteSerializer,
    KathismaSerializer,
    PrayerRuleSerializer,
    PsalterSerializer,
    TextSerializer,
)


class Command(BaseCommand):
    help = 'Экспортирует весь публичный контент для офлайн-версии приложения.'

    def add_arguments(self, parser):
        default_output = (
            settings.BASE_DIR.parent
            / 'molitvoslov-app'
            / 'src'
            / 'data'
            / 'offlineContent.json'
        )

        parser.add_argument(
            '--output',
            default=str(default_output),
            help='Куда сохранить offlineContent.json',
        )

    def handle(self, *args, **options):
        output_path = Path(options['output']).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        categories_qs = Category.objects.all().order_by('order', 'id')
        categories = CategorySerializer(categories_qs, many=True).data

        category_texts = {}
        for category in categories_qs:
            rows = (
                CategoryText.objects
                .filter(category=category)
                .select_related('category', 'text')
                .prefetch_related('text__categories')
                .order_by('order', 'id')
            )
            category_texts[category.slug] = CategoryTextSerializer(
                rows,
                many=True,
            ).data

        texts_qs = (
            Text.objects
            .filter(is_visible=True)
            .prefetch_related('categories')
            .order_by('id')
        )
        texts = {
            item['slug']: item
            for item in TextSerializer(texts_qs, many=True).data
        }

        prayer_rules_qs = (
            PrayerRule.objects
            .filter(is_visible=True)
            .prefetch_related(
                'items__text__categories',
                'items__footnotes',
                'footnotes',
            )
            .order_by('id')
        )
        prayer_rule_list = PrayerRuleSerializer(
            prayer_rules_qs,
            many=True,
        ).data
        prayer_rules = {
            'list': prayer_rule_list,
            'by_slug': {
                item['slug']: item
                for item in prayer_rule_list
            },
        }

        psalters_qs = (
            Psalter.objects
            .filter(is_visible=True)
            .prefetch_related('kathismas__psalms')
            .order_by('id')
        )
        psalter_list = PsalterSerializer(psalters_qs, many=True).data
        psalters = {
            'list': psalter_list,
            'by_slug': {
                item['slug']: item
                for item in psalter_list
            },
        }

        kathismas_qs = (
            Kathisma.objects
            .select_related('psalter')
            .prefetch_related(
                'psalms__verses',
                'glories__after_psalm',
                'glories__after_verse',
            )
            .order_by('number', 'id')
        )
        kathisma_list = KathismaSerializer(kathismas_qs, many=True).data
        kathismas = {
            'by_number': {
                str(item['number']): item
                for item in kathisma_list
            },
        }

        akathists_qs = (
            Akathist.objects
            .filter(is_visible=True)
            .order_by('id')
        )
        akathist_list = AkathistSummarySerializer(
            akathists_qs,
            many=True,
        ).data

        akathist_details_qs = (
            akathists_qs
            .select_related('troparion', 'kontakion_before')
            .prefetch_related('sections__text__categories')
        )
        akathist_details = AkathistSerializer(
            akathist_details_qs,
            many=True,
        ).data
        akathists = {
            'list': akathist_list,
            'by_slug': {
                item['slug']: item
                for item in akathist_details
            },
        }

        canons_qs = (
            Canon.objects
            .filter(is_visible=True)
            .order_by('id')
        )
        canon_list = CanonSummarySerializer(canons_qs, many=True).data
        canon_details = CanonSerializer(
            canons_qs.prefetch_related('sections__text__categories'),
            many=True,
        ).data
        canons = {
            'list': canon_list,
            'by_slug': {
                item['slug']: item
                for item in canon_details
            },
        }

        daily_quotes = DailyQuoteSerializer(
            DailyQuote.objects
            .filter(is_active=True)
            .order_by('order', 'id'),
            many=True,
        ).data

        payload = {
            'schema_version': 1,
            'generated_at': timezone.now().isoformat(),
            'categories': categories,
            'category_texts': category_texts,
            'texts': texts,
            'prayer_rules': prayer_rules,
            'psalters': psalters,
            'kathismas': kathismas,
            'akathists': akathists,
            'canons': canons,
            'daily_quotes': daily_quotes,
        }

        with output_path.open('w', encoding='utf-8') as file:
            json.dump(
                payload,
                file,
                ensure_ascii=False,
                indent=2,
            )
            file.write('\n')

        self.stdout.write(
            self.style.SUCCESS(
                f'Офлайн-контент сохранён: {output_path}'
            )
        )
        self.stdout.write(
            'Категории: {categories}; правила: {rules}; '
            'акафисты: {akathists}; каноны: {canons}; '
            'кафизмы: {kathismas}; цитаты: {quotes}'.format(
                categories=len(categories),
                rules=len(prayer_rules['list']),
                akathists=len(akathists['list']),
                canons=len(canons['list']),
                kathismas=len(kathismas['by_number']),
                quotes=len(daily_quotes),
            )
        )
