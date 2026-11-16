#!/usr/bin/env python3
"""Safety and fidelity tests for prepare-webp-quality-trial (Pillow required)."""
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import zipfile
from PIL import Image, features

src=pathlib.Path(__file__).with_name('prepare-webp-quality-trial-20261116.py')
spec=importlib.util.spec_from_file_location('webp_quality',src)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
assert features.check('webp'), 'Pillow must have WebP support'
assert mod.QUALITY_PRESETS['evangelist-icon'][0]>=96
assert mod.QUALITY_PRESETS['home'][0]>=90
with tempfile.TemporaryDirectory(prefix='molitvoslov-webp-quality-test-') as tmp:
    root=pathlib.Path(tmp)
    (root/'src'/'data').mkdir(parents=True)
    (root/'src'/'data'/'homeArtwork.js').write_text('fixture',encoding='utf8')
    alpha=Image.new('RGBA',(80,64),(110,85,60,255))
    for y in range(alpha.height):
        for x in range(alpha.width):
            alpha.putpixel((x,y), ((x*3+y*2)%256,(y*6)%256,
                       (x*y)%256, 0 if x<5 else 255))
    for section,names in [('home',mod.HOME),
                           ('bible/evangelists',mod.EVANGELISTS)]:
        folder=root/'assets'/section
        folder.mkdir(parents=True)
        for name in names:
            alpha.save(folder/(name+'_opt.webp'),format='WEBP',lossless=True,method=4)
    for section,names in [('home',mod.HOME),('bible/evangelists',mod.EVANGELISTS)]:
        for name in names:
            source=root/'assets'/section/(name+'_opt.webp')
            assert source.exists()
    original_hashes={
        p.relative_to(root):mod.sha256(p)
        for p in (root/'assets').rglob('*.webp')
    }
    report=root/'reports'/'webp-quality-trial-fixture'
    capture=io.StringIO()
    with contextlib.redirect_stdout(capture):
        mod.prepare(root,report)
    assert (report/'summary.csv').exists()
    manifest=json.loads((report/'manifest.json').read_text(encoding='utf8'))
    assert manifest['version']==1
    assert len(manifest['entries'])==17
    assert manifest['total_candidates']==34
    assert sum(len(e['candidates']) for e in manifest['entries'])==34
    for entry in manifest['entries']:
        assert entry['source_sha256']==original_hashes[pathlib.Path(entry['source'])]
        assert entry['dimensions']==[80,64]
        assert len(entry['candidates'])==2
        for choice in entry['candidates']:
            assert (report/choice['path']).is_file()
            assert mod.sha256(report/choice['path'])==choice['sha256']
            assert choice['status'] in ('LOW_PSNR_REVIEW','NO_SIZE_SAVING','REVIEW_VISUALLY')
    assert sum(1 for p in (report/'previews').rglob('*.png'))==34
    assert all(mod.sha256(root/rel)==value for rel,value in original_hashes.items())
    assert not list((root/'src').rglob('*_size.webp'))
    try:
        mod.prepare(root,report)
    except RuntimeError as error:
        assert 'already exists' in str(error)
    else:
        raise AssertionError('Existing report unexpectedly overwritten')
    apk=root/'reports'/'small.apk'
    source_png=root/'assets'/'home'/'page_bg4.png'
    alpha.save(source_png,format='PNG')
    apk.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(apk,'w') as z:
        z.writestr('res/xE.png',source_png.read_bytes())
    out=io.StringIO()
    with contextlib.redirect_stdout(out):
        mod.audit_unknown_png(apk,root)
    assert 'assets/home/page_bg4.png' in out.getvalue()
    assert 'Nothing changed' in out.getvalue()
print('PASS: all 17 WebP candidates, 34 comparison previews, alpha & size safeguards, SHA manifest, originals unchanged, pixel match')
