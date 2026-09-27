import re

from django.db import migrations


CURATED_AKATHISTS = (
    {
        "key": "nikolay",
        "title": "Акафист святителю Николаю Чудотворцу",
        "slugs": (
            "akafist-svyatitelyu-nikolayu",
            "akafist-svjatitelju-nikolaju-chudotvorcu",
        ),
    },
    {
        "key": "vsetsaritsa",
        "title": "Акафист Пресвятой Богородице пред иконой «Всецарица»",
        "slugs": (
            "akafist-presvyatoy-bogorodice-pred-ikonoy-vsecarica",
            "akafist-presvjatoj-bogorodice-pred-ikonoj-vsecarica",
        ),
    },
    {
        "key": "spiridon",
        "title": "Акафист святителю Спиридону Тримифунтскому, чудотворцу",
        "slugs": (
            "akafist-svyatitelyu-spiridonu-trimifuntskomu",
            "akafist-svjatitelju-spiridonu-trimifuntskomu-chudotvorcu",
        ),
    },
    {
        "key": "panteleimon",
        "title": "Акафист святому великомученику и целителю Пантелеимону",
        "slugs": (
            "akafist-svyatomu-velikomucheniku-i-celitelyu-panteleimonu",
            "akafist-svjatomu-velikomucheniku-i-celitelju-panteleimonu",
        ),
    },
    {
        "key": "great_bogoroditsa",
        "title": "Акафист Пресвятой Богородице (Великий акафист)",
        "slugs": (
            "velikiy-akafist-presvyatoy-bogorodice",
            "akafist-presvjatoj-bogorodice-velikij-akafist-chitaemyj-v-subbotu-akafista",
        ),
    },
    {
        "key": "iisus_sladchayshiy",
        "title": "Акафист Иисусу Сладчайшему",
        "slugs": ("akafist-iisusu-sladchajshemu",),
    },
    {
        "key": "rozhdestvo_bogoroditsy",
        "title": "Акафист Рождеству Пресвятой Богородицы",
        "slugs": (
            "akafist-rozhdestvu-presvjatoj-bogorodicy",
            "akafist-rozhdestvu-presvyatoy-bogorodicy",
        ),
    },
    {
        "key": "arkhangel_mikhail",
        "title": "Акафист архангелу Божию Михаилу",
        "slugs": (
            "akafist-arhangelu-bozhiju-mihailu",
            "akafist-arhangelu-bozhiyu-mihailu",
        ),
    },
    {
        "key": "blagoveshchenie",
        "title": "Акафист Благовещению Пресвятой Богородицы",
        "slugs": (
            "akafist-blagoveshheniju-presvjatoj-bogorodicy",
            "akafist-blagoveshcheniyu-presvyatoy-bogorodicy",
        ),
    },
    {
        "key": "bogoyavlenie",
        "title": "Акафист Богоявлению Господню",
        "slugs": (
            "akafist-bogojavleniju-gospodnju",
            "akafist-bogoyavleniyu-gospodnyu",
        ),
    },
    {
        "key": "strasti_hristovy",
        "title": "Акафист Божественным Страстям Христовым",
        "slugs": ("akafist-bozhestvennym-strastjam-hristovym",),
    },
    {
        "key": "krest_1",
        "title": "Акафист Честному и Животворящему Кресту Господню",
        "slugs": ("akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju",),
    },
    {
        "key": "krest_2",
        "title": "Акафист Честному и Животворящему Кресту Господню (2-й)",
        "slugs": ("akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju-2-j",),
    },
    {
        "key": "krest_3",
        "title": "Акафист Честному и Животворящему Кресту Господню (3-й)",
        "slugs": ("akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju-3-j",),
    },
    {
        "key": "vera_nadezhda_lyubov",
        "title": "Акафист мученицам Вере, Надежде, Любови и матери их Софии",
        "slugs": ("akafist-muchenicam-vere-nadezhde-ljubovi-i-materi-ih-sofii",),
    },
)


def normalize_title(value):
    value = (value or "").strip().casefold().replace("ё", "е")
    value = re.sub(
        r"[^0-9a-zа-я]+",
        " ",
        value,
        flags=re.IGNORECASE,
    )
    return " ".join(value.split())


def find_entry(slug, title):
    normalized = normalize_title(title)

    for entry in CURATED_AKATHISTS:
        if slug in entry["slugs"]:
            return entry

        if normalized == normalize_title(entry["title"]):
            return entry

    return None


def prune_akathists(apps, schema_editor):
    Akathist = apps.get_model(
        "api",
        "Akathist",
    )
    SavedItem = apps.get_model(
        "api",
        "SavedItem",
    )
    ReadingProgress = apps.get_model(
        "api",
        "ReadingProgress",
    )

    grouped = {entry["key"]: [] for entry in CURATED_AKATHISTS}
    delete_ids = []

    for item in Akathist.objects.all().order_by("id"):
        entry = find_entry(
            item.slug,
            item.title,
        )

        if entry is None:
            delete_ids.append(item.id)
            continue

        grouped[entry["key"]].append(item)

    for entry in CURATED_AKATHISTS:
        matches = grouped[entry["key"]]

        if len(matches) <= 1:
            continue

        priority = {slug: index for index, slug in enumerate(entry["slugs"])}

        matches.sort(
            key=lambda item: (
                priority.get(
                    item.slug,
                    999,
                ),
                item.id,
            )
        )

        delete_ids.extend(item.id for item in matches[1:])

    if not delete_ids:
        return

    SavedItem.objects.filter(
        source_type="akathist",
        source_id__in=delete_ids,
    ).delete()

    ReadingProgress.objects.filter(
        source_type="akathist",
        source_id__in=delete_ids,
    ).delete()

    Akathist.objects.filter(id__in=delete_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        (
            "api",
            "0022_bibletranslation_biblebook_biblechapter_bibleverse",
        ),
    ]

    operations = [
        migrations.RunPython(
            prune_akathists,
            migrations.RunPython.noop,
        ),
    ]
