import re


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


def normalize_akathist_title(value):
    value = (value or "").strip().casefold().replace("ё", "е")

    value = re.sub(
        r"[^0-9a-zа-я]+",
        " ",
        value,
        flags=re.IGNORECASE,
    )

    return " ".join(value.split())


_CURATED_TITLES = {
    entry["key"]: normalize_akathist_title(entry["title"]) for entry in CURATED_AKATHISTS
}


def find_curated_akathist(*, slug="", title=""):
    slug = (slug or "").strip()
    normalized_title = normalize_akathist_title(title)

    for entry in CURATED_AKATHISTS:
        if slug and slug in entry["slugs"]:
            return entry

        if normalized_title and normalized_title == _CURATED_TITLES[entry["key"]]:
            return entry

    return None


def is_curated_akathist(value=None, *, slug="", title=""):
    if value is not None:
        slug = getattr(
            value,
            "slug",
            slug,
        )
        title = getattr(
            value,
            "title",
            title,
        )

    return (
        find_curated_akathist(
            slug=slug,
            title=title,
        )
        is not None
    )
