import os

from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connections, transaction

from api.models import BibleBook, BibleChapter, BibleTranslation, BibleVerse


REMOTE_ALIAS = "supabase_sync"

TRANSLATION_FIELDS = [
    "name",
    "language",
    "script_variant",
    "source_url",
    "source_revision",
    "license_name",
    "is_visible",
]

BOOK_FIELDS = [
    "testament",
    "section",
    "name",
    "short_name",
    "slug",
    "canonical_order",
    "is_appendix",
]


class Command(BaseCommand):
    help = (
        "Синхронизировать один перевод Библии из локальной SQLite в Supabase. "
        "Создание новых строк сохраняет локальные primary key, чтобы bundled/offline "
        "Библия, закладки и прогресс использовали те же book/chapter/verse id. "
        "Удаления не выполняются."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--translation",
            default="rst",
            help="Код перевода BibleTranslation. По умолчанию rst.",
        )

        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--dry-run", action="store_true")
        mode.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        self._assert_local_source()
        self._configure_supabase_connection()
        self._check_remote()

        code = str(options["translation"] or "").strip()
        if not code:
            raise CommandError("Не указан код перевода.")

        plan = self._build_plan(code)
        self._print_plan(plan)

        if options["dry_run"]:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY-RUN: Supabase не изменён."))
            return

        with transaction.atomic(using=REMOTE_ALIAS):
            self._apply(plan)
            self._reset_remote_sequences()

        verify = self._build_plan(code)

        if self._has_changes(verify):
            self._print_plan(verify, prefix="Остались расхождения после APPLY:")
            raise CommandError("Проверка после записи не прошла.")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "APPLY завершён. Перевод Библии синхронизирован и проверен. "
                "Удаления не выполнялись."
            )
        )

    def _assert_local_source(self):
        engine = connections["default"].settings_dict.get("ENGINE", "")
        if engine != "django.db.backends.sqlite3":
            raise CommandError(
                "Источник должен быть локальной SQLite. " "Не задавайте Supabase как default."
            )

    def _configure_supabase_connection(self):
        password = os.environ.get("SUPABASE_SYNC_DB_PASSWORD", "").strip()
        if not password:
            raise CommandError("Не задан SUPABASE_SYNC_DB_PASSWORD.")

        connections.databases[REMOTE_ALIAS] = {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get(
                "SUPABASE_SYNC_DB_NAME",
                os.environ.get("SUPABASE_DB_NAME", "postgres"),
            ),
            "USER": os.environ.get(
                "SUPABASE_SYNC_DB_USER",
                os.environ.get(
                    "SUPABASE_DB_USER",
                    "postgres.gguwppijpnpjpmpkiumd",
                ),
            ),
            "PASSWORD": password,
            "HOST": os.environ.get(
                "SUPABASE_SYNC_DB_HOST",
                os.environ.get(
                    "SUPABASE_DB_HOST",
                    "aws-1-eu-central-1.pooler.supabase.com",
                ),
            ),
            "PORT": os.environ.get(
                "SUPABASE_SYNC_DB_PORT",
                os.environ.get("SUPABASE_DB_PORT", "5432"),
            ),
            "CONN_MAX_AGE": 0,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": "require"},
            "TIME_ZONE": None,
            "AUTOCOMMIT": True,
            "ATOMIC_REQUESTS": False,
            "TEST": {
                "CHARSET": None,
                "COLLATION": None,
                "MIGRATE": True,
                "MIRROR": None,
                "NAME": None,
            },
        }

    def _check_remote(self):
        try:
            connections[REMOTE_ALIAS].ensure_connection()
            BibleTranslation.objects.using(REMOTE_ALIAS).count()
            BibleBook.objects.using(REMOTE_ALIAS).count()
            BibleChapter.objects.using(REMOTE_ALIAS).count()
            BibleVerse.objects.using(REMOTE_ALIAS).count()
        except Exception as error:
            raise CommandError(f"Не удалось подключиться к Supabase: {error}") from error

    def _local_translation(self, code):
        translation = BibleTranslation.objects.using("default").filter(code=code).first()
        if translation is None:
            raise CommandError(f"Локально нет BibleTranslation code={code!r}.")
        return translation

    @staticmethod
    def _changed_fields(remote, local, fields):
        return [field for field in fields if getattr(remote, field) != getattr(local, field)]

    def _build_plan(self, code):
        local_translation = self._local_translation(code)
        remote_translation = BibleTranslation.objects.using(REMOTE_ALIAS).filter(code=code).first()

        if remote_translation is not None and remote_translation.pk != local_translation.pk:
            raise CommandError(
                f"BibleTranslation {code!r}: local id={local_translation.pk}, "
                f"Supabase id={remote_translation.pk}. "
                "Остановлено, чтобы не сломать стабильные ID."
            )

        local_books = list(
            BibleBook.objects.using("default")
            .filter(translation=local_translation)
            .order_by("canonical_order", "id")
        )
        remote_books = (
            {
                item.code: item
                for item in BibleBook.objects.using(REMOTE_ALIAS)
                .filter(translation__code=code)
                .order_by("canonical_order", "id")
            }
            if remote_translation is not None
            else {}
        )

        book_create = []
        book_update = []

        for local in local_books:
            remote = remote_books.get(local.code)
            if remote is None:
                book_create.append(local)
                continue

            if remote.pk != local.pk:
                raise CommandError(
                    f"Книга {local.code}: local id={local.pk}, "
                    f"Supabase id={remote.pk}. "
                    "Остановлено, чтобы не сломать закладки/прогресс."
                )

            changed = self._changed_fields(remote, local, BOOK_FIELDS)
            if changed:
                book_update.append((local, remote, changed))

        local_book_by_id = {item.pk: item for item in local_books}
        local_chapters = list(
            BibleChapter.objects.using("default")
            .filter(book__translation=local_translation)
            .select_related("book")
            .order_by("book__canonical_order", "number", "id")
        )

        remote_chapters = (
            {
                (item.book.code, item.number): item
                for item in BibleChapter.objects.using(REMOTE_ALIAS)
                .filter(book__translation__code=code)
                .select_related("book")
                .order_by("book__canonical_order", "number", "id")
            }
            if remote_translation is not None
            else {}
        )

        chapter_create = []

        for local in local_chapters:
            key = (local.book.code, local.number)
            remote = remote_chapters.get(key)
            if remote is None:
                chapter_create.append(local)
                continue

            if remote.pk != local.pk:
                raise CommandError(
                    f"Глава {local.book.code} {local.number}: "
                    f"local id={local.pk}, Supabase id={remote.pk}. "
                    "Остановлено, чтобы сохранить стабильные ID."
                )

        local_verses = list(
            BibleVerse.objects.using("default")
            .filter(chapter__book__translation=local_translation)
            .select_related("chapter__book")
            .order_by(
                "chapter__book__canonical_order",
                "chapter__number",
                "number",
                "id",
            )
        )

        remote_verses = (
            {
                (item.chapter.book.code, item.chapter.number, item.number): item
                for item in BibleVerse.objects.using(REMOTE_ALIAS)
                .filter(chapter__book__translation__code=code)
                .select_related("chapter__book")
                .order_by(
                    "chapter__book__canonical_order",
                    "chapter__number",
                    "number",
                    "id",
                )
            }
            if remote_translation is not None
            else {}
        )

        verse_create = []
        verse_update = []

        for local in local_verses:
            key = (
                local.chapter.book.code,
                local.chapter.number,
                local.number,
            )
            remote = remote_verses.get(key)

            if remote is None:
                verse_create.append(local)
                continue

            if remote.pk != local.pk:
                raise CommandError(
                    f"Стих {key[0]} {key[1]}:{key[2]}: "
                    f"local id={local.pk}, Supabase id={remote.pk}. "
                    "Остановлено, чтобы сохранить стабильные ID."
                )

            if remote.text != local.text:
                verse_update.append((local, remote))

        remote_book_keys = set(remote_books)
        local_book_keys = {item.code for item in local_books}
        remote_chapter_keys = set(remote_chapters)
        local_chapter_keys = {(item.book.code, item.number) for item in local_chapters}
        remote_verse_keys = set(remote_verses)
        local_verse_keys = {
            (item.chapter.book.code, item.chapter.number, item.number) for item in local_verses
        }

        translation_fields = (
            TRANSLATION_FIELDS
            if remote_translation is None
            else self._changed_fields(
                remote_translation,
                local_translation,
                TRANSLATION_FIELDS,
            )
        )

        return {
            "code": code,
            "local_translation": local_translation,
            "remote_translation": remote_translation,
            "translation_create": remote_translation is None,
            "translation_fields": translation_fields,
            "local_books": local_books,
            "remote_books": remote_books,
            "book_create": book_create,
            "book_update": book_update,
            "local_chapters": local_chapters,
            "remote_chapters": remote_chapters,
            "chapter_create": chapter_create,
            "local_verses": local_verses,
            "remote_verses": remote_verses,
            "verse_create": verse_create,
            "verse_update": verse_update,
            "remote_extra_books": sorted(remote_book_keys - local_book_keys),
            "remote_extra_chapters": sorted(remote_chapter_keys - local_chapter_keys),
            "remote_extra_verses": sorted(remote_verse_keys - local_verse_keys),
        }

    @staticmethod
    def _has_changes(plan):
        return bool(
            plan["translation_create"]
            or plan["translation_fields"]
            or plan["book_create"]
            or plan["book_update"]
            or plan["chapter_create"]
            or plan["verse_create"]
            or plan["verse_update"]
        )

    def _print_plan(self, plan, prefix="План синхронизации:"):
        self.stdout.write("")
        self.stdout.write(self.style.HTTP_INFO(f"---- BibleTranslation {plan['code']} ----"))
        self.stdout.write(
            "Локально: "
            f"книг={len(plan['local_books'])}; "
            f"глав={len(plan['local_chapters'])}; "
            f"стихов={len(plan['local_verses'])}."
        )
        self.stdout.write(prefix)

        if plan["translation_create"]:
            self.stdout.write(f"  CREATE BibleTranslation id={plan['local_translation'].pk}")
        elif plan["translation_fields"]:
            self.stdout.write("  UPDATE BibleTranslation: " + ", ".join(plan["translation_fields"]))

        self.stdout.write(
            f"  Books: CREATE {len(plan['book_create'])}; " f"UPDATE {len(plan['book_update'])}."
        )
        self.stdout.write(f"  Chapters: CREATE {len(plan['chapter_create'])}.")
        self.stdout.write(
            f"  Verses: CREATE {len(plan['verse_create'])}; "
            f"UPDATE text {len(plan['verse_update'])}."
        )

        extras = (
            len(plan["remote_extra_books"])
            + len(plan["remote_extra_chapters"])
            + len(plan["remote_extra_verses"])
        )
        if extras:
            self.stdout.write(
                self.style.WARNING(
                    "  В Supabase есть строки, которых нет локально: "
                    f"books={len(plan['remote_extra_books'])}, "
                    f"chapters={len(plan['remote_extra_chapters'])}, "
                    f"verses={len(plan['remote_extra_verses'])}. "
                    "Они НЕ будут удалены."
                )
            )

        if not self._has_changes(plan):
            self.stdout.write("  Изменений нет.")

    def _apply(self, plan):
        local_translation = plan["local_translation"]
        remote_translation = plan["remote_translation"]

        if plan["translation_create"]:
            remote_translation = BibleTranslation(
                id=local_translation.pk,
                code=local_translation.code,
            )
            for field in TRANSLATION_FIELDS:
                setattr(
                    remote_translation,
                    field,
                    getattr(local_translation, field),
                )
            remote_translation.save(
                using=REMOTE_ALIAS,
                force_insert=True,
            )
        elif plan["translation_fields"]:
            for field in plan["translation_fields"]:
                setattr(
                    remote_translation,
                    field,
                    getattr(local_translation, field),
                )
            remote_translation.save(
                using=REMOTE_ALIAS,
                update_fields=plan["translation_fields"],
            )

        remote_books = dict(plan["remote_books"])

        new_books = []
        for local in plan["book_create"]:
            item = BibleBook(
                id=local.pk,
                translation=remote_translation,
                code=local.code,
            )
            for field in BOOK_FIELDS:
                setattr(item, field, getattr(local, field))
            new_books.append(item)

        if new_books:
            BibleBook.objects.using(REMOTE_ALIAS).bulk_create(
                new_books,
                batch_size=200,
            )
            remote_books.update({item.code: item for item in new_books})

        changed_books = []
        changed_book_fields = set()

        for local, remote, fields in plan["book_update"]:
            for field in fields:
                setattr(remote, field, getattr(local, field))
                changed_book_fields.add(field)
            changed_books.append(remote)

        if changed_books:
            BibleBook.objects.using(REMOTE_ALIAS).bulk_update(
                changed_books,
                sorted(changed_book_fields),
                batch_size=200,
            )

        remote_chapters = dict(plan["remote_chapters"])
        new_chapters = []

        for local in plan["chapter_create"]:
            item = BibleChapter(
                id=local.pk,
                book=remote_books[local.book.code],
                number=local.number,
            )
            new_chapters.append(item)

        if new_chapters:
            BibleChapter.objects.using(REMOTE_ALIAS).bulk_create(
                new_chapters,
                batch_size=500,
            )

        # После создания глав перечитываем только текущий перевод:
        # это проще и надёжнее для 37k стихов, чем собирать FK вручную.
        remote_chapters = {
            (item.book.code, item.number): item
            for item in BibleChapter.objects.using(REMOTE_ALIAS)
            .filter(book__translation__code=plan["code"])
            .select_related("book")
        }

        new_verses = []
        for local in plan["verse_create"]:
            key = (local.chapter.book.code, local.chapter.number)
            new_verses.append(
                BibleVerse(
                    id=local.pk,
                    chapter=remote_chapters[key],
                    number=local.number,
                    text=local.text,
                )
            )

        if new_verses:
            BibleVerse.objects.using(REMOTE_ALIAS).bulk_create(
                new_verses,
                batch_size=1000,
            )

        changed_verses = []
        for local, remote in plan["verse_update"]:
            remote.text = local.text
            changed_verses.append(remote)

        if changed_verses:
            BibleVerse.objects.using(REMOTE_ALIAS).bulk_update(
                changed_verses,
                ["text"],
                batch_size=1000,
            )

    def _reset_remote_sequences(self):
        models = [
            BibleTranslation,
            BibleBook,
            BibleChapter,
            BibleVerse,
        ]
        sql_list = connections[REMOTE_ALIAS].ops.sequence_reset_sql(
            no_style(),
            models,
        )

        if not sql_list:
            return

        with connections[REMOTE_ALIAS].cursor() as cursor:
            for sql in sql_list:
                cursor.execute(sql)
