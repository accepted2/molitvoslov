#!/usr/bin/env python3
"""Stage new 210 civil hymns from downloaded ZIP; no manual extraction and no live writes."""
import argparse, hashlib, json, os, sqlite3, sys, zipfile
from pathlib import Path

ZIP_NAME = "UOC_210_CIVIC_HYMNS_20261123_REVIEW.zip"
SQLITE_NAME = "UOC_2025_2027_210_CIVIC_PREVIEW.sqlite3"

def sha_file(path):
    d=hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024*1024), b""):
            d.update(data)
    return d.hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", default=str(
        Path(os.getenv("USERPROFILE") or Path.home()) / "Downloads" / ZIP_NAME))
    args=parser.parse_args()
    archive=Path(args.zip)
    if not archive.is_file():
        matches=sorted(archive.parent.glob("UOC_210_CIVIC_HYMNS_20261123_REVIEW*.zip"),
            key=lambda p:p.stat().st_mtime, reverse=True)
        if not matches: raise FileNotFoundError(
            "Download ZIP into Downloads; there is no need to unpack it manually.")
        archive=matches[0]
    report=Path(__file__).resolve().parents[1]/"reports"/"uoc-210-hymns"
    report.mkdir(parents=True,exist_ok=True)
    out=report/SQLITE_NAME
    with zipfile.ZipFile(archive) as z:
        if z.testzip():raise ValueError("ZIP integrity check failed")
        manifest=json.loads(z.read("SUMMARY.json"))
        reviewed=json.loads(z.read("UOC_210_HYMNS_WITH_CIVIL_TEXT.json"))
        if manifest["counters"]["source_groups_resolved"]!=210 or len(reviewed)!=210:
            raise ValueError("Unexpected source group count")
        if manifest["counters"]["new_embedded_alternatives"]!=16:
            raise ValueError("Unexpected alternative hymn count")
        checksum=manifest["candidate_sha256"]
        if out.exists():
            if sha_file(out)!=checksum:raise FileExistsError(
                "A different candidate SQLite already exists; will not overwrite.")
        else:
            tmp=report/(SQLITE_NAME+".incoming")
            if tmp.exists():raise FileExistsError("Interrupted previous import: "+str(tmp))
            with z.open(SQLITE_NAME) as src,tmp.open("wb") as dst:
                for chunk in iter(lambda:src.read(1024*1024),b""):dst.write(chunk)
            if sha_file(tmp)!=checksum:
                tmp.unlink(missing_ok=True);raise ValueError("SHA256 mismatch")
            tmp.replace(out)
    with sqlite3.connect(out.as_uri()+"?mode=ro",uri=True) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0]!="ok":
            raise ValueError("SQLite integrity failed")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key integrity failed")
        for table,expected in (("card",3791),("day",1095),("reading",5016),
                               ("civic_repair_review",226)):
            if db.execute("SELECT COUNT(*) FROM "+table).fetchone()[0]!=expected:
                raise ValueError("Unexpected row count in "+table)
        rows=db.execute(
            "SELECT r.card_id,r.kind,r.variant,r.title_ru,h.heading,h.content,r.status "
            "FROM civic_repair_review r JOIN hymn h ON "
            "h.card_id=r.card_id AND h.kind=r.kind AND h.variant=r.variant "
            "AND h.language='civil' ORDER BY r.card_id,r.kind,r.variant"
        ).fetchall()
    if len(rows)!=226:raise ValueError("Missing staged hymn variant")
    target=report/"UOC_226_CIVIC_HYMNS.jsonl"
    with target.open("w",encoding="utf-8") as fh:
        for row in rows:
            fields=["card_id","kind","variant","title_ru","heading","content","review_status"]
            fh.write(json.dumps(dict(zip(fields,row)),ensure_ascii=False)+"\n")
    print("STAGED: 210 source groups, 226 separate hymn variants.")
    print("Source ZIP left untouched. No offline months, API data or live bot DB changed.")
    print("Manifest:",target)
    print("Editor approval is still required before public publication.")

if __name__=="__main__":
    try:main()
    except (OSError,ValueError,sqlite3.Error,zipfile.BadZipFile) as exc:
        print("ERROR:",exc,file=sys.stderr)
        raise SystemExit(1)
