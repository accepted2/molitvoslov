import requests
from bs4 import BeautifulSoup

url = "https://azbyka.ru/days/sv-feodosij-pecherskij"

response = requests.get(
    url,
    timeout=30,
    headers={"User-Agent": "Mozilla/5.0"}
)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")

heading = next(
    (
        h for h in soup.find_all(["h2", "h3", "h4"])
        if "Полное житие преподобного Феодосия Печерского"
        in h.get_text(" ", strip=True)
    ),
    None
)

if heading is None:
    raise RuntimeError("Заголовок полного жития не найден")

print("ЗАГОЛОВОК:", heading.get_text(" ", strip=True))
print("РОДИТЕЛЬ:", heading.parent.name)
print("КЛАСС РОДИТЕЛЯ:", heading.parent.get("class"))

print("\n=== СЛЕДУЮЩИЕ ЭЛЕМЕНТЫ ===")

for index, element in enumerate(heading.next_elements):
    if index >= 350:
        break

    if getattr(element, "name", None) in ("h2", "h3", "h4"):
        print("ЗАГОЛОВОК:", element.get_text(" ", strip=True)[:180])

print("\n=== ПЕРВЫЕ АБЗАЦЫ ===")

count = 0

for paragraph in heading.find_all_next("p"):
    text = paragraph.get_text(" ", strip=True)

    if text:
        print(text[:400])
        count += 1

    if count >= 5:
        break
