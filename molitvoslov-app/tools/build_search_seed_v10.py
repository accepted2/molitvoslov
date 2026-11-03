#!/usr/bin/env python3
"""Build v10 search from the complete local v9 traversal, preserving its rules.

AST selects the original corpus statements rather than brittle comment markers.
Unexpected database writes or missing published akathists abort the build.
"""
import ast
import copy
import importlib.util
import json
from pathlib import Path
from search_seed_lib import SeedWriter, merge_languages, KIND_BOOST

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = ROOT / "tools" / "build_search_seed.py"
DEST = ROOT / "src" / "data" / "search_seed_v10.db"


def _assigns(node, name):
    return isinstance(node, ast.Assign) and any(
        isinstance(target, ast.Name) and target.id == name
        for target in node.targets
    )


def compile_corpus(source, filename=str(ORIGINAL)):
    """Reuse the v9 corpus but strip its separate SQLite metadata writes."""
    tree = ast.parse(source, filename=filename)
    mains = [n for n in tree.body
             if isinstance(n, ast.FunctionDef) and n.name == "main"]
    if len(mains) != 1:
        raise RuntimeError("Expected one original search main() function")
    body = mains[0].body
    add_idxs = [i for i, n in enumerate(body)
                if isinstance(n, ast.FunctionDef) and n.name == "add"]
    if len(add_idxs) != 1:
        raise RuntimeError("Original add() collector cannot be identified")
    start = add_idxs[0] + 1
    lang_idxs = [i for i in range(start, len(body))
                 if isinstance(body[i], ast.For)
                 and isinstance(body[i].target, ast.Name)
                 and body[i].target.id == "lang"]
    if len(lang_idxs) != 1 or lang_idxs[0] <= start:
        raise RuntimeError("Original per-language corpus traversal cannot be identified")
    loop = body[lang_idxs[0]]
    if not isinstance(loop.iter, (ast.Tuple, ast.List)):
        raise RuntimeError("Original language traversal has changed")
    langs = [n.value for n in loop.iter if isinstance(n, ast.Constant)]
    if langs != ["ru", "uk"]:
        raise RuntimeError("Expected original search languages (ru, uk)")
    metadata = [
        i for i, stmt in enumerate(loop.body)
        if _assigns(stmt, "public_ver") or _assigns(stmt, "bible_ver")
        or (isinstance(stmt, ast.Expr) and "search_metadata" in
            (ast.get_source_segment(source, stmt) or ""))
    ]
    if not metadata or min(metadata) == 0:
        raise RuntimeError("Original v9 metadata tail not found")
    cutoff = min(metadata)
    tail = loop.body[cutoff:]
    if not any("search_metadata" in (ast.get_source_segment(source, x) or "")
               for x in tail):
        raise RuntimeError("Expected v9 search_metadata after corpus")
    if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
           and n.func.id == "add" for x in tail for n in ast.walk(x)):
        raise RuntimeError("Original search adds corpus records after metadata")
    selected = body[start:lang_idxs[0]] + loop.body[:cutoff]
    if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
           and n.func.attr in {"execute", "executemany", "executescript",
                                "commit", "close", "cursor", "connect"}
           for x in selected for n in ast.walk(x)):
        raise RuntimeError("Original v9 corpus contains direct database operations")
    corpus = copy.deepcopy(body[start:lang_idxs[0]])
    copied_loop = copy.deepcopy(loop)
    copied_loop.body = copied_loop.body[:cutoff]
    corpus.append(copied_loop)
    module = ast.fix_missing_locations(ast.Module(body=corpus, type_ignores=[]))
    return compile(module, filename + ":v10-corpus", "exec")


def verify_source_coverage(content, collected):
    """Every visible akathist and its Slavonic sections must be searchable."""
    rows = {doc["ext"] for docs in collected.values() for doc in docs}
    missing, sections, published = [], 0, 0
    for ak in ((content.get("akathists") or {}).get("by_slug") or {}).values():
        if not ak.get("is_visible", True):
            continue
        published += 1
        ref = "akathists:" + str(ak.get("id"))
        if ref not in rows:
            missing.append(ref)
        for section in ak.get("sections") or []:
            if (section.get("text") or {}).get("content"):
                sections += 1
                ref = "akathists:section:" + str(section.get("id")) + ":church"
                if ref not in rows:
                    missing.append(ref)
    if missing:
        raise RuntimeError("Published akathists missing from search: " +
                           ", ".join(missing[:30]))
    print("V10 CORPUS COVERAGE: %d published akathists; %d Slavonic sections" %
          (published, sections))


def main():
    source = ORIGINAL.read_text(encoding="utf-8-sig")
    corpus = compile_corpus(source)
    spec = importlib.util.spec_from_file_location("molitvoslov_original_seed", ORIGINAL)
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    content = json.loads((ROOT / "src/data/offlineContent.json").read_text(encoding="utf-8-sig"))
    bible = json.loads((ROOT / "src/data/offlineBible.json").read_text(encoding="utf-8-sig"))
    collected = {"ru": [], "uk": []}

    def add(lang, group, identifier, title, source, texts, route,
            kind="text", preview="", text_language=None):
        variants = []
        code = {"church": "c", "russian": "r", "ukrainian": "u"}.get(text_language, "m")
        for value in texts:
            if value:
                original = old.compact(value)
                if original:
                    variants.append((code, original))
        title = old.compact(title)
        if not title and not variants:
            return
        collected[lang].append({
            "ext": str(identifier), "grp": str(group), "kind": str(kind),
            "title": title, "source": str(source or ""), "route": route,
            "variants": variants, "boost": KIND_BOOST.get(kind, 1.0),
        })

    ns = dict(vars(old))
    ns.update({"ROOT": ROOT, "content": content, "bible": bible, "add": add})
    exec(corpus, ns, ns)
    verify_source_coverage(content, collected)
    merged = merge_languages(collected)
    writer = SeedWriter()
    for doc in merged:
        writer.add(doc)
    stats = writer.finish(DEST, {
        "public_content_version": str(content.get("content_version", "")),
        "bible_content_version": str(bible.get("content_version", "")),
        "generator": "v10-from-original-corpus-ast",
    })
    if stats["integrity"] != "ok":
        raise RuntimeError("Generated database integrity_check failed")
    print("V10 GENERATED:", json.dumps(stats, ensure_ascii=False, indent=2))
    print("Original records: ru=%d uk=%d, merged=%d" %
          (len(collected["ru"]), len(collected["uk"]), len(merged)))
    print("Output:", DEST)


if __name__ == "__main__":
    main()
