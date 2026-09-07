from docx import Document
import json


DOCX_PATH = "files/utrennie.docx"
JSON_PATH = "files/utrennie_debug.json"


document = Document(DOCX_PATH)

paragraphs = []

for index, paragraph in enumerate(document.paragraphs):
    text = paragraph.text.strip()

    if not text:
        continue

    paragraphs.append({
        "index": index,
        "text": text,
        "style": paragraph.style.name,
        "alignment": str(paragraph.alignment),

        "format": {
            "left_indent": (
                paragraph.paragraph_format.left_indent.pt
                if paragraph.paragraph_format.left_indent
                else None
            ),
            "right_indent": (
                paragraph.paragraph_format.right_indent.pt
                if paragraph.paragraph_format.right_indent
                else None
            ),
            "first_line_indent": (
                paragraph.paragraph_format.first_line_indent.pt
                if paragraph.paragraph_format.first_line_indent
                else None
            ),
            "space_before": (
                paragraph.paragraph_format.space_before.pt
                if paragraph.paragraph_format.space_before
                else None
            ),
            "space_after": (
                paragraph.paragraph_format.space_after.pt
                if paragraph.paragraph_format.space_after
                else None
            ),
            "keep_with_next": paragraph.paragraph_format.keep_with_next,
        },

        "runs": [
            {
                "text": run.text,
                "bold": run.bold,
                "italic": run.italic,
                "size": run.font.size.pt if run.font.size else None,
            }
            for run in paragraph.runs
        ]
    })


with open(JSON_PATH, "w", encoding="utf-8") as file:
    json.dump(
        paragraphs,
        file,
        ensure_ascii=False,
        indent=2
    )


print(f"Готово: {JSON_PATH}")
print(f"Найдено абзацев: {len(paragraphs)}")