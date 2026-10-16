import requests
from bs4 import BeautifulSoup

url = "https://azbyka.ru/days/2026-10-01"
r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
r.raise_for_status()
soup = BeautifulSoup(r.text, "html.parser")

for a in soup.find_all("a", href=True):
    title = a.get_text(" ", strip=True)
    if "Евмен" in title or "евмен" in a["href"].lower():
        print("Название:", title)
        print("Ссылка:", requests.compat.urljoin(url, a["href"]))
        print("---")
