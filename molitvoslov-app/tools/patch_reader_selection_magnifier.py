#!/usr/bin/env python3
"""Broaden WebView selection handle touch targets and add a precise text loupe.

Updates both prayer rule and shared document/psalter/Bible selection runtimes.
The visible handles remain 18px; their transparent capture surface grows to
56 x 64px. Magnifier is active only during an actual handle drag.
Backups are made before any write. Existing source edits are preserved.
"""
from pathlib import Path
from datetime import datetime
import re, shutil, sys

ROOT=Path(__file__).resolve().parents[1]
updates={}

LOUPE = """
    const selectionLoupe = document.createElement('div');
    selectionLoupe.id = 'reader-selection-loupe';
    selectionLoupe.style.cssText =
      'position:fixed;display:none;align-items:center;justify-content:center;' +
      'gap:1px;width:172px;height:52px;box-sizing:border-box;padding:6px 10px;' +
      'border-radius:13px;border:1px solid rgba(143,106,58,.70);' +
      'background:var(--surface,#FFF4DE);color:var(--text,#3E2A1D);' +
      'font:700 19px Georgia,serif;white-space:pre;overflow:hidden;' +
      'box-shadow:0 4px 14px rgba(44,31,19,.28);z-index:2005;pointer-events:none;';
    const loupeBefore = document.createElement('span');
    const loupeCursor = document.createElement('span');
    const loupeAfter = document.createElement('span');
    loupeCursor.style.cssText = 'font-size:27px;color:var(--handle,#9A693A);' +
      'border-bottom:2px solid currentColor;';
    selectionLoupe.append(loupeBefore, loupeCursor, loupeAfter);
    document.body.appendChild(selectionLoupe);
    const hideSelectionLoupe = () => { selectionLoupe.style.display = 'none'; };
    const showSelectionLoupe = (itemId, offset, x, y) => {
      const source = String(itemTextMap.get(Number(itemId)) || '');
      if (!source) return;
      const i = Math.max(0, Math.min(source.length, Number(offset) || 0));
      loupeBefore.textContent = source.slice(Math.max(0, i - 8), i).replace(/\\s/g, ' ');
      loupeCursor.textContent = source.slice(i, i + 1) || '│';
      loupeAfter.textContent = source.slice(i + 1, Math.min(source.length, i + 9)).replace(/\\s/g, ' ');
      selectionLoupe.style.display = 'flex';
      selectionLoupe.style.left = Math.max(4, Math.min(window.innerWidth - 176, x - 86)) + 'px';
      selectionLoupe.style.top = Math.max(4, y - 110) + 'px';
    };
"""

def one(s,a,b,p):
    count=s.count(a)
    if count!=1:
        raise RuntimeError(f"{p}: anchor {a[:80]!r} occurs {count} times")
    return s.replace(a,b,1)

def regex_once(s,pattern,fn,p,flags=0):
    matches=list(re.finditer(pattern,s,flags))
    if len(matches)!=1:
        raise RuntimeError(f"{p}: regex {pattern[:65]!r}: {len(matches)} matches")
    return s[:matches[0].start()] + fn(matches[0]) + s[matches[0].end():]

def common_css(s,p):
    s=one(s,
      """      width: 36px;
      height: 44px;
      z-index: 1001;
      touch-action: none;""",
      """      width: 56px;
      height: 64px;
      z-index: 1001;
      touch-action: none;""",p)
    s=one(s,
      """      left: 16px;
      top: 0;
      width: 4px;
      height: 24px;""",
      """      left: 26px;
      top: 7px;
      width: 4px;
      height: 24px;""",p)
    s=one(s,
      """      left: 9px;
      top: 21px;
      width: 18px;
      height: 18px;""",
      """      left: 19px;
      top: 28px;
      width: 18px;
      height: 18px;""",p)
    s=one(s,
      '    #selection-bar {',
      """    #start-handle.selection-handle::before {left:44px;}
    #start-handle.selection-handle::after {left:37px;}
    #end-handle.selection-handle::before {left:8px;}
    #end-handle.selection-handle::after {left:1px;}
    #selection-bar {""",p)
    return s

def prayer(s,p):
    s=common_css(s,p)
    s=one(s,"    const eveningItemKindMap =\n      new Map();",
          "    const eveningItemKindMap =\n      new Map();\n"+LOUPE,p)
    # The loupe is in a shared source-string, no JSX/React rerender required.
    s=regex_once(s,
      r"startHandle\.style\.left\s*=\s*\(\s*first\.left\s*-\s*18\s*\)\s*\+\s*'px';",
      lambda m:m.group(0).replace("18", "46"),p)
    s=regex_once(s,
      r"endHandle\.style\.left\s*=\s*\(\s*last\.right\s*-\s*18\s*\)\s*\+\s*'px';",
      lambda m:m.group(0).replace("18", "10"),p)
    s=one(s,
      """      state.lastDragPoint = {
        x:
          event.clientX,
        y:
          event.clientY,
      };

      ensureAutoScroll();""",
      """      state.lastDragPoint = {
        x:
          event.clientX,
        y:
          event.clientY,
      };

      showSelectionLoupe(state.active.itemId,
        mode === 'start' ? state.active.start : state.active.end,
        event.clientX, event.clientY);
      ensureAutoScroll();""",p)
    s=one(s,
      """        updateFromPoint(
          event.clientX,
          event.clientY
        );

        ensureAutoScroll();""",
      """        updateFromPoint(
          event.clientX,
          event.clientY
        );

        showSelectionLoupe(state.active.itemId,
          state.drag.mode === 'start' ? state.active.start : state.active.end,
          event.clientX, event.clientY);
        ensureAutoScroll();""",p)
    s=one(s,
      """        state.drag =
          null;

        state.lastDragPoint =
          null;""",
      """        state.drag =
          null;

        state.lastDragPoint =
          null;
        hideSelectionLoupe();""",p)
    return s

def shared(s,p):
    s=common_css(s,p)
    return s

def document_runtime(s,p):
    s=one(s,
      "    const savedRanges = new Map();",
      "    const savedRanges = new Map();\n"+LOUPE,p)
    s=one(s,
      "startHandle.style.left = ( first.left - 18 ) + 'px';",
      "startHandle.style.left = ( first.left - 46 ) + 'px';",p)
    s=one(s,
      "endHandle.style.left = ( last.right - 18 ) + 'px';",
      "endHandle.style.left = ( last.right - 10 ) + 'px';",p)
    s=one(s,
      """      state.lastDragPoint = {
        x: event.clientX, y: event.clientY, };
      ensureAutoScroll();""",
      """      state.lastDragPoint = {
        x: event.clientX, y: event.clientY, };
      showSelectionLoupe(state.active.itemId,
        mode === 'start' ? state.active.start : state.active.end,
        event.clientX, event.clientY);
      ensureAutoScroll();""",p)
    s=one(s,
      """        updateFromPoint( event.clientX, event.clientY );
        ensureAutoScroll();""",
      """        updateFromPoint( event.clientX, event.clientY );
        showSelectionLoupe(state.active.itemId,
          state.drag.mode === 'start' ? state.active.start : state.active.end,
          event.clientX, event.clientY);
        ensureAutoScroll();""",p)
    s=one(s,
      """        state.drag = null;
        state.lastDragPoint = null;""",
      """        state.drag = null;
        state.lastDragPoint = null;
        hideSelectionLoupe();""",p)
    return s

for p,fn,marker in (
   ('src/components/reader/PrayerRuleReader.js',prayer,'showSelectionLoupe'),
   ('src/components/reader/selectableDocumentReader/styles.js',shared,'width: 56px;'),
   ('src/components/reader/selectableDocumentReader/runtime.js',document_runtime,'showSelectionLoupe'),
):
    original=(ROOT/p).read_text(encoding='utf-8-sig')
    if marker in original:
        print('ALREADY PATCHED:',p)
        continue
    updates[p]=fn(original,p)
if not updates:
    print('Reader handle touch targets and magnifiers already installed')
    sys.exit(0)
backup=ROOT.parent/'build-backups'/('reader-selection-loupe-'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
for p in updates:
    dest=backup/p
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/p,dest)
for p,contents in updates.items():
    (ROOT/p).write_text(contents,encoding='utf-8')
    print('PATCHED:',p)
print('BACKUP:',backup)
print('Selection handles: 56x64 transparent hit areas, original marker size.')
print('Magnifier visible during handle drag only.')
