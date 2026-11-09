"""Stable, separate client-side IDs for Church Slavonic offline Bible.

These are presentation identifiers for the app, not Django database PKs.
The Russian Synodal translation retains its original database IDs.
"""

CSL_TRANSLATION_CODE = "csl_traditional"


def bible_client_id(code, entity, db_id, *, order=0, chapter=0, verse=0):
    if code != CSL_TRANSLATION_CODE:
        return db_id
    if entity == "translation":
        return 500_000
    if entity == "book":
        return 500_000 + int(order)
    if entity == "chapter":
        return 10_000_000 + int(order) * 1_000 + int(chapter)
    if entity == "verse":
        return 100_000_000 + int(order) * 1_000_000 + int(chapter) * 1_000 + int(verse)
    raise ValueError(f"Unknown Bible entity kind: {entity}")
