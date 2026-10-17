"""Pure standard-library matching of calendar observances across years."""
import re
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache


def normalize_title(value):
    text = unicodedata.normalize("NFKD", (value or "").casefold().replace("ё", "е"))
    text = "".join(x for x in text if unicodedata.category(x) != "Mn")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\b(?:ок\.?\s*)?\d+(?:\s*[-–—]\s*\d+)?\b", " ", text)
    text = re.sub(
        r"\b(?:преставление|прославление|перенесение|обретение|мощей|память|празднование)\b",
        " ", text,
    )
    text = re.sub(r"[^а-яa-z]+", " ", text)
    return " ".join(text.split())


@lru_cache(maxsize=40000)
def similarity(original_a, original_b):
    a, b = normalize_title(original_a), normalize_title(original_b)
    if not a or not b:
        return 0.0
    if a == b:
        return 100.0
    char = SequenceMatcher(None, a, b, autojunk=False).ratio() * 100
    ta, tb = set(a.split()), set(b.split())
    common = ta & tb
    word = (2 * len(common) / (len(ta) + len(tb))) * 100
    if ta <= tb or tb <= ta:
        word = max(word, (len(common) / min(len(ta), len(tb))) * 100)
    return max(char, 0.68 * char + 0.32 * word)


def assignment(matrix):
    """Maximum-weight rectangular assignment; no third-party packages."""
    rows = len(matrix)
    if not rows:
        return []
    cols = len(matrix[0])
    if not cols:
        return []
    transpose = rows > cols
    a = [[matrix[i][j] for i in range(rows)] for j in range(cols)] if transpose else matrix
    n, m = len(a), len(a[0])
    assert n <= m
    u, v, p, way = [0.] * (n+1), [0.] * (m+1), [0] * (m+1), [0] * (m+1)
    for i in range(1, n+1):
        p[0] = i
        j0 = 0
        minv = [float("inf")] * (m+1)
        used = [False] * (m+1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta, j1 = float("inf"), 0
            for j in range(1, m+1):
                if not used[j]:
                    cur = 100.0 - a[i0-1][j-1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(m+1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    pairs = [(p[j]-1, j-1) for j in range(1, m+1) if p[j]]
    return [(j, i) for i, j in pairs] if transpose else pairs


def match(source_items, target_items, extra_names=()):
    matrix = [[
        max(
            similarity(src, target),
            similarity(extra_names[i], target) if extra_names and extra_names[i] else 0
        )
        for target in target_items
    ] for i, src in enumerate(source_items)]
    return [(i, j, matrix[i][j]) for i, j in assignment(matrix)]
