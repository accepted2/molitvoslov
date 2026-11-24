"""Release guard for five recovered Misc Prayers after deliberate re-categorization.

The original published prayers must remain complete. Three St John prayers
may move from Misc Prayers into the dedicated St John category; the two Optina
prayers must remain at the Misc Prayers root. A removed St John root link is
allowed only if the same prayer is linked under St John or if an identical full
text is linked there under another slug.

No public content, database or user-owned records are modified.
"""
import re
import unicodedata

ROOT = "raznye-molitvy"
MAIN = "ioann-kronshtadtsky-molitvy"
THANKS = "molitvy-ioanna-kronshtadtskogo"
VOLUMES = "ioann-kronshtadtsky-moya-zhizn-vo-khriste"
RELOCATABLE = frozenset({
    "molitva-svyatogo-pravednogo-ioanna-kronshtadtskogo",
    "molitva-inaya-svyatogo-pravednogo-ioanna-kronshtadtskogo",
    "molitva-ko-presvyatoj-troice-svyatogo-pravednogo-ioanna-kronshtadtskogo",
})


def normalized_body(value):
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = "".join(
        ch for ch in value if unicodedata.category(ch) not in ("Mn", "Me")
    )
    return re.sub(r"\s+", " ", re.sub(
        r"[^а-яa-z0-9іїєґ]+", " ", value.replace("ё", "е")
    )).strip()


def readable_bodies(prayer):
    bodies = []
    for key in ("content", "translation", "traditional_content", "translation_uk"):
        normalized = normalized_body((prayer or {}).get(key))
        if len(normalized) >= 70:
            bodies.append(normalized)
    return set(bodies)


def linked_slugs(rows):
    return {
        (row.get("text") or {}).get("slug")
        for row in rows or []
        if isinstance(row, dict) and isinstance(row.get("text"), dict)
        and isinstance(row["text"].get("slug"), str)
    }


def validate_restored_prayers(payload, prayers, root_slug=ROOT):
    texts = payload.get("texts") or {}
    links_by_category = payload.get("category_texts") or {}
    original_links = linked_slugs(links_by_category.get(root_slug))
    categories = {
        item.get("slug"): item
        for item in payload.get("categories") or []
        if isinstance(item, dict)
    }
    accepted_links = set(original_links)

    relocated = set(RELOCATABLE) - original_links
    if relocated:
        root = categories.get(ROOT)
        main = categories.get(MAIN)
        thanks = categories.get(THANKS)
        volumes = categories.get(VOLUMES)
        if not root or not main or not thanks or not volumes:
            raise RuntimeError(
                "IOANN PRAYERS RELOCATED BUT THEIR CATEGORY TREE IS MISSING"
            )
        if (main.get("parent") != root.get("id") or
                thanks.get("parent") != main.get("id") or
                volumes.get("parent") != main.get("id")):
            raise RuntimeError(
                "IOANN PRAYERS RELOCATED BUT THEIR CATEGORY TREE IS INCONSISTENT"
            )
        for slug in (MAIN, THANKS, VOLUMES):
            accepted_links.update(linked_slugs(links_by_category.get(slug)))

    missing_text = [
        prayer["slug"] for prayer in prayers if prayer["slug"] not in texts
    ]
    empty = [
        prayer["slug"] for prayer in prayers
        if prayer["slug"] in texts and
        not str(texts[prayer["slug"]].get("content") or "").strip()
    ]

    missing_links = []
    matches = []
    protected_nested = set()
    for slug in (MAIN, THANKS, VOLUMES):
        protected_nested.update(linked_slugs(links_by_category.get(slug)))
    nested_bodies = {}
    for slug in protected_nested:
        if slug in texts:
            for body in readable_bodies(texts[slug]):
                nested_bodies.setdefault(body, set()).add(slug)

    for prayer in prayers:
        slug = prayer["slug"]
        if slug in original_links:
            continue
        if slug not in RELOCATABLE:
            missing_links.append(slug)  # Optina must stay at root.
            continue
        if slug in accepted_links:
            continue
        actual = texts.get(slug) or {}
        found = set()
        for body in readable_bodies(actual):
            found.update(nested_bodies.get(body) or set())
        found.discard(slug)
        if found:
            matches.append((slug, sorted(found)[0]))
        else:
            missing_links.append(slug)

    if missing_text or empty or missing_links:
        raise RuntimeError(
            "APK MISC PRAYERS INCOMPLETE; refusing release. "
            "Missing prayer texts: " + repr(missing_text) +
            "; missing original or verified relocated links: " + repr(missing_links) +
            "; empty original texts: " + repr(empty)
        )
    print(
        "RECOVERED MISC PRAYERS VERIFIED: 5 complete texts, "
        "root/authorized nested links or verified full-text duplicates"
    )
    for old_slug, new_slug in matches:
        print("  Verified relocated duplicate:", old_slug, "==", new_slug)
