#!/usr/bin/env python3
"""Read-only 3-way comparison of the REAL local working tree and a remote branch.

The merge base is the common ancestor of local HEAD and the target branch.
For every tracked, remote, and non-ignored untracked path compare:
  LOCAL (actual disk bytes, through Git's normal content filters)
  BASE  (merge-base blob)
  REMOTE (target branch blob).
No checkout, merge, commit, reset, stash, index update, or local data rewrite.
Only a CSV report outside the Git repository is created.
"""
import argparse
import csv
import datetime
import os
from pathlib import Path
import subprocess
import sys
from collections import Counter

DEFAULT_REMOTE = "origin/backup/local-changes-20261028"
STATUS = {
    "SAME": "Идентично",
    "LOCAL_ONLY": "Изменено только локально",
    "REMOTE_ONLY": "Изменено только в GitHub",
    "BOTH_DIFFER": "Изменено с обеих сторон",
}

def run_git(root, *args):
    command = ["git", "-C", str(root), *args]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(
            "git " + " ".join(args) + ": " +
            result.stderr.decode("utf-8", "replace").strip()
        )
    return result.stdout

def text_git(root, *args):
    return run_git(root, *args).decode("utf-8", "replace").strip()

def split_paths(data):
    return [os.fsdecode(name) for name in data.split(b"\0") if name]

def tree(root, ref):
    answer = {}
    for record in run_git(root, "ls-tree", "-r", "-z", "--full-tree", ref).split(b"\0"):
        if not record:
            continue
        head, rawpath = record.split(b"\t", 1)
        fields = head.split(b" ")
        if len(fields) != 3:
            raise RuntimeError("Unrecognized git ls-tree format")
        _mode, kind, sha = fields
        if kind != b"blob":
            continue
        answer[os.fsdecode(rawpath)] = sha.decode("ascii")
    return answer

def hash_local(root, relpath):
    path = root / relpath
    if not path.is_file():
        return None
    # --path enables the repository's own attributes/CRLF normalization. Do
    # NOT use -w: this is an inspection, not a Git object modification.
    return text_git(root, "hash-object", "--path=" + relpath.replace("\\", "/"),
                    "--", relpath)

def safe_report_dir(root):
    # Put generated reports outside the Git worktree (near build-backups).
    # This prevents the audit itself from appearing as a new local change.
    return root.parent / "build-backups" / "git-comparison-reports"

def classify(local_sha, base_sha, remote_sha):
    if local_sha == remote_sha:
        return "SAME"
    if remote_sha == base_sha:
        return "LOCAL_ONLY"
    if local_sha == base_sha:
        return "REMOTE_ONLY"
    return "BOTH_DIFFER"

def audit(root, remote):
    head_sha = text_git(root, "rev-parse", "HEAD")
    remote_sha = text_git(root, "rev-parse", "--verify", remote + "^{commit}")
    base_sha = text_git(root, "merge-base", "HEAD", remote)
    head = tree(root, "HEAD")
    base = tree(root, base_sha)
    target = tree(root, remote)
    dirty = set(split_paths(run_git(root, "diff", "--name-only", "-z", "HEAD", "--")))
    untracked = set(split_paths(run_git(
        root, "ls-files", "--others", "--exclude-standard", "-z"
    )))
    all_paths = sorted(set(head) | set(base) | set(target) | dirty | untracked)
    records = []
    for relpath in all_paths:
        local_file = root / relpath
        if relpath in dirty or relpath in untracked:
            # Untracked files that GitHub has never heard of cannot conflict
            # and do not need potentially expensive large binary hashing.
            if relpath in untracked and relpath not in target and relpath not in base:
                local_sha = "(untracked)"
            else:
                local_sha = hash_local(root, relpath)
        else:
            local_sha = head.get(relpath)
        base_file_sha = base.get(relpath)
        remote_file_sha = target.get(relpath)
        # Special-case genuinely untracked new local files. Their content is
        # unknown to Git, but their presence means LOCAL_ONLY.
        if local_sha == "(untracked)":
            status = "LOCAL_ONLY"
        else:
            status = classify(local_sha, base_file_sha, remote_file_sha)
        records.append({
            "status": status,
            "path": relpath,
            "local_uncommitted": (
                "yes" if relpath in dirty or relpath in untracked else "no"
            ),
            "untracked": "yes" if relpath in untracked else "no",
            "local_exists": "yes" if local_file.exists() else "no",
            "base_blob": base_file_sha or "",
            "local_blob": local_sha or "",
            "remote_blob": remote_file_sha or "",
            "head_blob": head.get(relpath) or "",
        })
    return records, head_sha, base_sha, remote_sha

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", default=DEFAULT_REMOTE,
                        help="Already fetched remote branch/ref")
    parser.add_argument("--root", default=".", help="Path anywhere inside repo")
    parser.add_argument("--preview", type=int, default=45)
    parser.add_argument("--report-dir", default=None,
                        help="CSV directory OUTSIDE the Git repo")
    args = parser.parse_args()
    root = Path(text_git(Path(args.root).resolve(), "rev-parse", "--show-toplevel"))
    report_dir = Path(args.report_dir).resolve() if args.report_dir else safe_report_dir(root)
    if root == report_dir or root in report_dir.parents:
        raise SystemExit("ABORT: report directory must be OUTSIDE the Git repository")
    records, head, base, remote = audit(root, args.remote)
    counters = Counter(x["status"] for x in records)
    report_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    report = report_dir / ("local-vs-remote-" + timestamp + ".csv")
    with report.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(records[0]) if records else [
            "status", "path", "local_uncommitted", "untracked",
            "local_exists", "base_blob", "local_blob", "remote_blob", "head_blob"
        ])
        writer.writeheader()
        writer.writerows(records)
    print("LOCAL HEAD:", head)
    print("MERGE BASE:", base)
    print("REMOTE REF:", args.remote, remote)
    print("CLASSIFICATION: LOCAL is the actual disk content, including unsaved Git changes.")
    for status in ("SAME", "LOCAL_ONLY", "REMOTE_ONLY", "BOTH_DIFFER"):
        print(f"{status}: {counters[status]} | {STATUS[status]}")
    print("CSV REPORT:", report)
    important = (
        "molitvoslov-app/src/data/offlineContent.json",
        "molitvoslov-app/src/data/searchSeedBuild.json",
        "molitvoslov-app/src/data/search_seed.db",
        "molitvoslov-app/src/screens/SaintDetailScreen.js",
        "molitvoslov-app/src/screens/ChurchCalendarScreen.js",
    )
    print("\nCRITICAL FILES:")
    by_path = {x["path"]: x for x in records}
    for relpath in important:
        x = by_path.get(relpath)
        if x:
            print(f"  {x['status']:13} {relpath} (uncommitted={x['local_uncommitted']})")
    different = [x for x in records if x["status"] != "SAME"]
    print(f"\nFIRST {min(args.preview, len(different))} NONIDENTICAL FILES:")
    for x in different[:args.preview]:
        print(f"  {x['status']:13} {x['path']}")
    print("\nNO MERGE OR COMMIT PERFORMED. No source or user data was changed.")

if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as exc:
        print("AUDIT FAILED:", exc, file=sys.stderr)
        sys.exit(1)
