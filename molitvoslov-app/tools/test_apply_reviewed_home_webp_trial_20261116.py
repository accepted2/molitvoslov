#!/usr/bin/env python3
"""Fixture regression for Q95 home WebP trial: dry-run, apply, SHA restore."""
from __future__ import annotations
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
from PIL import Image

code=pathlib.Path(__file__).with_name("apply-reviewed-home-webp-trial-20261116.py")
spec=importlib.util.spec_from_file_location("molitvoslov_webp_trial_apply",code)
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
assert app.SAFE == ("canons","communion","hero","page_bg2","page_bg3")
assert app.MIN_QUALITY == 95 and app.MIN_PSNR >= 36.5

with tempfile.TemporaryDirectory(prefix="molitvoslov-webp-apply-") as temp:
    root=pathlib.Path(temp)
    assets=root/"assets"/"home"
    assets.mkdir(parents=True)
    reports=root/"reports"
    source_report=reports/"webp-quality-trial-fixture"
    originals={}
    candidates={}
    entries=[]
    for index,name in enumerate(app.SAFE):
        img=Image.new("RGBA",(96,64),(50+index*9,95,160,255))
        output=io.BytesIO()
        img.save(output,"WEBP",quality=95)
        candidate_data=output.getvalue()
        # Pillow tolerates trailing source payload. This makes the test
        # candidate strictly smaller while preserving EXACT decoded pixels.
        source_data=candidate_data+b"\x00"*3072
        for item in (assets/(name+".webp"),assets/(name+"_opt.webp")):
            item.write_bytes(source_data)
            originals[item]=app.sha256(item)
        candidate=source_report/"candidates"/"q95"/"home"/(name+"_size.webp")
        candidate.parent.mkdir(parents=True,exist_ok=True)
        candidate.write_bytes(candidate_data)
        candidates[name]=candidate_data
        preview=source_report/"previews"/"q95"/"home"/(name+".png")
        preview.parent.mkdir(parents=True,exist_ok=True)
        img.save(preview,"PNG")
        entries.append({
            "source":"assets/home/"+name+"_opt.webp",
            "source_sha256":app.sha256(assets/(name+"_opt.webp")),
            "source_bytes":len(source_data),
            "kind":"home",
            "dimensions":[96,64],
            "candidates":[{
                "quality":95,
                "path":"candidates/q95/home/"+name+"_size.webp",
                "sha256":app.sha256(candidate),
                "bytes":len(candidate_data),
                "saved_bytes":len(source_data)-len(candidate_data),
                "psnr_min_db":999.0,
                "status":"REVIEW_VISUALLY",
            }],
        })
    manifest=source_report/"manifest.json"
    manifest.write_text(json.dumps({
        "format":"molitvoslov-webp-quality-trial",
        "version":1,
        "entries":entries,
    }),encoding="utf8")
    old=io.StringIO()
    with contextlib.redirect_stdout(old):
        app.prepare(root,manifest,False)
    assert "DRY RUN" in old.getvalue()
    assert all(app.sha256(p)==checksum for p,checksum in originals.items())
    stale=app.generated_resources(root)
    stale.mkdir(parents=True)
    (stale/"stale.png").write_bytes(b"old")
    with contextlib.redirect_stdout(io.StringIO()):
        app.prepare(root,manifest,True)
    assert not stale.exists(),"Generated release resources should be invalidated."
    for name in app.SAFE:
        for p in app.source_aliases(root,name):
            assert p.read_bytes()==candidates[name]
    backups=list(reports.glob("webp-originals-before-q95-*"))
    assert len(backups)==1
    backup=backups[0]
    info=json.loads((backup/"backup-manifest.json").read_text(encoding="utf8"))
    assert len(info["files"])==10
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            app.prepare(root,manifest,False)
    except RuntimeError as exc:
        assert "differ from approved originals" in str(exc)
    else:
        raise AssertionError("Changed source was accepted against old manifest")
    with contextlib.redirect_stdout(io.StringIO()):
        app.restore(root,backup)
    assert all(app.sha256(p)==checksum for p,checksum in originals.items())
    assert backup.exists()
    assert (root/"assets"/"home"/"hero.webp").is_file()
    assert not list((root/"src").rglob("*.webp")) if (root/"src").exists() else True
    print("PASS: five approved WebP pairs, Q95 PSNR/alpha checks, no-op dry run, backup, apply, SHA restore and outdated manifest rejection")
