from django.db import migrations, models


ROOT_SLUG = "raznye-molitvy"
SUBCATEGORY_SLUG = "molitvy-pered-evangeliem"

PLACEHOLDER_TEXTS = [
    {
        "slug": "molitva-pered-nachalom-dobrogo-dela-placeholder",
        "title": "Молитва перед началом доброго дела",
        "category": ROOT_SLUG,
        "order": 20,
    },
    {
        "slug": "molitva-pered-chteniem-svyashchennogo-pisaniya-placeholder",
        "title": "Молитва перед чтением Священного Писания",
        "category": ROOT_SLUG,
        "order": 30,
    },
    {
        "slug": "molitva-posle-chteniya-svyashchennogo-pisaniya-placeholder",
        "title": "Молитва после чтения Священного Писания",
        "category": ROOT_SLUG,
        "order": 40,
    },
    {
        "slug": "molitva-pered-evangeliem-pervaya-placeholder",
        "title": "Молитва перед Евангелием первая",
        "category": SUBCATEGORY_SLUG,
        "order": 10,
    },
    {
        "slug": "molitva-pered-evangeliem-vtoraya-placeholder",
        "title": "Молитва перед Евангелием вторая",
        "category": SUBCATEGORY_SLUG,
        "order": 20,
    },
]


def seed_misc_prayers(apps, schema_editor):
    Category = apps.get_model("api", "Category")
    Text = apps.get_model("api", "Text")
    CategoryText = apps.get_model("api", "CategoryText")

    root, _ = Category.objects.get_or_create(
        slug=ROOT_SLUG,
        defaults={
            "name": "Разные молитвы",
            "order": 70,
            "icon": "book",
        },
    )

    subcategory, _ = Category.objects.get_or_create(
        slug=SUBCATEGORY_SLUG,
        defaults={
            "name": "Молитвы перед чтением Евангелия",
            "parent": root,
            "order": 10,
            "icon": "book",
        },
    )

    if subcategory.parent_id != root.id:
        subcategory.parent = root
        subcategory.save(update_fields=["parent"])

    categories = {
        ROOT_SLUG: root,
        SUBCATEGORY_SLUG: subcategory,
    }

    placeholder_church = "Текст церковнославянской версии будет добавлен позже."
    placeholder_russian = "Русский перевод будет добавлен позже."

    for item in PLACEHOLDER_TEXTS:
        text, _ = Text.objects.get_or_create(
            slug=item["slug"],
            defaults={
                "title": item["title"],
                "description": "",
                "content": placeholder_church,
                "traditional_content": "",
                "translation": placeholder_russian,
                "language": "cu",
                "description_position": "before",
                "is_visible": True,
            },
        )

        CategoryText.objects.get_or_create(
            category=categories[item["category"]],
            text=text,
            defaults={"order": item["order"]},
        )


def remove_misc_prayer_placeholders(apps, schema_editor):
    Category = apps.get_model("api", "Category")
    Text = apps.get_model("api", "Text")

    Text.objects.filter(slug__in=[item["slug"] for item in PLACEHOLDER_TEXTS]).delete()
    Category.objects.filter(slug=SUBCATEGORY_SLUG).delete()
    Category.objects.filter(slug=ROOT_SLUG).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0040_saveditem_bookmark_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="text",
            name="traditional_content",
            field=models.TextField(
                blank=True,
                help_text=(
                    "Отдельный текст в традиционной церковнославянской орфографии. "
                    "Это не шрифтовая замена основного текста."
                ),
                verbose_name="Церковнославянский — традиционное написание",
            ),
        ),
        migrations.AddField(
            model_name="psalter",
            name="prayers_before_traditional",
            field=models.TextField(
                blank=True,
                verbose_name="Молитвы перед чтением Псалтири — ЦС традиционный",
            ),
        ),
        migrations.AddField(
            model_name="psalter",
            name="prayers_after_traditional",
            field=models.TextField(
                blank=True,
                verbose_name="Молитвы после чтения Псалтири — ЦС традиционный",
            ),
        ),
        migrations.AddField(
            model_name="kathisma",
            name="prayers_after_traditional",
            field=models.TextField(
                blank=True,
                verbose_name="Молитвы после кафизмы — ЦС традиционный",
            ),
        ),
        migrations.AddField(
            model_name="psalm",
            name="title_church_slavonic_traditional",
            field=models.CharField(
                blank=True,
                max_length=500,
                verbose_name="Заголовок на ЦС — традиционное написание",
            ),
        ),
        migrations.AddField(
            model_name="psalmverse",
            name="church_slavonic_traditional",
            field=models.TextField(
                blank=True,
                verbose_name="Церковнославянский текст — традиционное написание",
            ),
        ),
        migrations.AddField(
            model_name="bibletranslation",
            name="script_variant",
            field=models.CharField(
                choices=[
                    ("modern", "Современное гражданское письмо"),
                    ("church_civil", "Церковнославянский — гражданское письмо"),
                    ("church_traditional", "Церковнославянский — традиционное письмо"),
                ],
                default="modern",
                max_length=32,
                verbose_name="Вариант письма",
            ),
        ),
        migrations.RunPython(seed_misc_prayers, remove_misc_prayer_placeholders),
    ]
