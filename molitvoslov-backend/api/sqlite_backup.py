import hashlib
import sqlite3
from datetime import datetime
from pathlib import Path


def sha256_file(path, chunk_size=1024 * 1024):
    digest = hashlib.sha256()

    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(chunk_size), b""):
            digest.update(chunk)

    return digest.hexdigest()


def create_sqlite_backup(source_path, output_dir):
    source_path = Path(source_path).resolve()
    output_dir = Path(output_dir).resolve()

    if not source_path.exists():
        raise FileNotFoundError(f"SQLite база не найдена: {source_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    destination = output_dir / f"{source_path.stem}_{stamp}.sqlite3"

    source = sqlite3.connect(str(source_path))
    target = sqlite3.connect(str(destination))

    try:
        source.backup(target)
    finally:
        target.close()
        source.close()

    return destination, sha256_file(destination)
