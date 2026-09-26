# Источник Библии

Для раздела «Библия» используется русский Синодальный перевод из репозитория
bibleonline/rst.

Закреплённая ревизия:

    2de3062388a2c067bc602399bda7149eec918ceb

Формат: USFM, каталог usfm/rst78.

Репозиторий источника указывает Copyright: Public Domain и Extended Copyright:
Public Domain. eBible.org независимо маркирует русский Синодальный перевод как
Public Domain.

Используется rst78, а не rst66: приложению нужен полный православный набор.
В машинном каталоге rst78 находится 78 USFM-файлов: 51 единица Ветхого Завета
и 27 книг Нового Завета. Формулировка «77 книг» в описании печатных изданий не
противоречит этому: «Молитва Манассии» в USFM вынесена отдельной машинной
единицей.

## Pipeline

Из каталога molitvoslov-backend:

    python manage.py migrate
    python manage.py import_bible_synodal --download
    python manage.py export_bible_content

Первый запуск скачивает BookNames.xml и 78 USFM-файлов только из закреплённой
ревизии. Рядом создаётся source_manifest.json с SHA-256 каждого файла.

Повторный import_bible_synodal идемпотентен: существующие книги, главы и стихи
обновляются на месте, поэтому их ID сохраняются. Удаляются только записи,
которых больше нет в закреплённом источнике.

Проверка парсера без записи в БД:

    python manage.py import_bible_synodal --check-only

Библия экспортируется отдельно от общего offlineContent.json в
molitvoslov-app/src/data/offlineBible.json.
