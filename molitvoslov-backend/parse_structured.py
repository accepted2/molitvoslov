from docx import Document
import json
import re


DOCX_PATH = "files/utrennie.docx"
JSON_PATH = "files/utrennie_structured.json"


document = Document(DOCX_PATH)


# Заголовки молитв, содержимое которых может состоять
# из нескольких абзацев Word.
#
# Это исключения именно для конкретного документа.
MERGE_BY_TITLE = {
    "Молитва оптинских старцев[2]",
}


def is_rule_title(paragraph):
    return paragraph.style.name == "Heading 1"


def is_centered(paragraph):
    return str(paragraph.alignment) == "CENTER (1)"


def is_bold(paragraph):
    real_runs = [
        run for run in paragraph.runs
        if run.text.strip()
    ]

    if not real_runs:
        return False

    return any(run.bold is True for run in real_runs)


def is_italic(paragraph):
    real_runs = [
        run for run in paragraph.runs
        if run.text.strip()
    ]

    if not real_runs:
        return False

    italic_count = sum(
        1 for run in real_runs
        if run.italic is True
    )

    return italic_count >= len(real_runs) / 2


def is_text_title(paragraph):
    return (
            paragraph.style.name == "Normal"
            and is_centered(paragraph)
            and is_bold(paragraph)
    )


def is_separator(text):
    stripped = text.strip()

    if len(stripped) < 5:
        return False

    return set(stripped) <= {"_", "-", "—"}


def is_instruction_text(text):
    lower = text.lower().strip()

    prefixes = (
        "если можешь",
        "от пасхи",
        "[от пасхи",
        "в двунадесятые праздники",
    )

    return lower.startswith(prefixes)


def is_footnote(text):
    return re.match(r"^\[\d+\]", text.strip()) is not None


rule_name = ""
items = []
footnotes = []

pending_title = ""
pending_description = ""

# Если True — последующие обычные абзацы
# продолжают текущую молитву.
merge_mode = False
merge_item = None


def add_item(item):
    item["order"] = len(items) + 1
    items.append(item)
    return item


for paragraph in document.paragraphs:
    text = paragraph.text.strip()

    if not text:
        continue

    # ----------------------------------------
    # Главный заголовок
    # ----------------------------------------

    if is_rule_title(paragraph):
        if not rule_name:
            rule_name = text
        continue

    # ----------------------------------------
    # Дублирующий заголовок документа
    # ----------------------------------------

    if (
            rule_name
            and is_centered(paragraph)
            and is_bold(paragraph)
            and text.lower() == rule_name.lower()
    ):
        continue

    # ----------------------------------------
    # Разделитель
    # ----------------------------------------

    if is_separator(text):
        merge_mode = False
        merge_item = None
        continue

    # ----------------------------------------
    # Сноска
    # ----------------------------------------

    if is_footnote(text):
        merge_mode = False
        merge_item = None

        footnotes.append(text)
        continue

    # ----------------------------------------
    # Новый заголовок молитвы
    # ----------------------------------------

    if is_text_title(paragraph):

        merge_mode = False
        merge_item = None

        pending_title = text
        pending_description = ""

        continue

    # ----------------------------------------
    # Курсив
    # ----------------------------------------

    if is_italic(paragraph):

        # Описание непосредственно после заголовка
        if pending_title:
            pending_description = text
            continue

        # Note к предыдущему тексту
        if (
                items
                and items[-1]["type"] == "text"
                and text.startswith("(")
                and text.endswith(")")
        ):
            items[-1]["note"] = text
            continue

        merge_mode = False
        merge_item = None

        add_item({
            "type": "instruction",
            "content": text,
        })

        continue

    # ----------------------------------------
    # Инструкция обычным шрифтом
    # ----------------------------------------

    if is_instruction_text(text):

        merge_mode = False
        merge_item = None

        add_item({
            "type": "instruction",
            "content": text,
        })

        continue

    # ----------------------------------------
    # Продолжение многоабзацной молитвы
    # ----------------------------------------

    if merge_mode and merge_item is not None:
        merge_item["content"] += "\n\n" + text
        continue

    # ----------------------------------------
    # Новый Text
    # ----------------------------------------

    new_item = add_item({
        "type": "text",
        "title": pending_title,
        "description": pending_description,
        "description_position": "before",
        "content": text,
        "note": "",
    })

    # Если этот заголовок находится в списке исключений,
    # следующие обычные абзацы будут приклеиваться
    # к этому же Text.
    if pending_title in MERGE_BY_TITLE:
        merge_mode = True
        merge_item = new_item
    else:
        merge_mode = False
        merge_item = None

    pending_title = ""
    pending_description = ""


result = {
    "rule": {
        "name": rule_name
    },
    "items": items,
    "footnotes": footnotes,
}


with open(JSON_PATH, "w", encoding="utf-8") as file:
    json.dump(
        result,
        file,
        ensure_ascii=False,
        indent=2
    )


print(f"Готово: {JSON_PATH}")
print(f"Правило: {rule_name}")
print(f"Элементов найдено: {len(items)}")
print(f"Сносок найдено: {len(footnotes)}")