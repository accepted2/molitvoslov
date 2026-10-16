import requests
from bs4 import BeautifulSoup

url = "https://azbyka.ru/days/sv-evmenij-gortinskij"

response = requests.get(
    url,
    timeout=30,
    headers={"User-Agent": "Mozilla/5.0"}
)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")

print("\n=== ЕВМЕНИЙ ГОРТИНСКИЙ ===")
print("Источник:", url)

for heading in soup.find_all(["h1", "h2", "h3", "h4"]):
    title = heading.get_text(" ", strip=True)
    if "Евмен" in title or "Жития" in title:
        print("Заголовок:", title)

print("\nПроверка содержимого:")
text = soup.get_text(" ", strip=True)

for phrase in (
    "епископа Гортин",
    "Фиваид",
    "монофелит",
):
    print(phrase, ":", phrase.casefold() in text.casefold())
