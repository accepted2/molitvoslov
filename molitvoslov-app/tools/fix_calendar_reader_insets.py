#!/usr/bin/env python3
"""Keep calendar/saint life, troparion and kontakion text clear of frame/fades.

Applies narrowly to the selectable WebView document, not the card/header or
the native scrolling logic. Checks every original anchor BEFORE modifying the
file, creates an external backup and verifies the inserted CSS on re-read.
Safe to run again. Never discards newer unrelated local changes.
"""
from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src/components/reader/CalendarSelectionWebText.js"
BACKUP_ROOT = ROOT.parent / "build-backups"
MARKER = "CALENDAR_READER_CONTENT_INSETS_V1"

def replace_once(text, old, new):
    n = text.count(old)
    if n != 1:
        raise RuntimeError("Expected exactly one source anchor, found " + str(n) +
                           ": " + repr(old[:130]))
    return text.replace(old, new, 1)

def main():
    original = TARGET.read_text(encoding="utf-8-sig")
    if MARKER in original:
        print("ALREADY PATCHED: calendar, troparion and saint reader text insets")
        return

    changed = original
    changed = replace_once(
        changed,
        "const buildHtml = (value, style) => {",
        "// " + MARKER + "\n"
        "const buildHtml = (value, style, isLife) => {",
    )
    changed = replace_once(
        changed,
        "  const align = s.textAlign === 'justify' ? 'justify' : 'left';",
        """  const align = s.textAlign === 'justify' ? 'justify' : 'left';
  // The life panel has a 30px fixed upper fade. Keep the first line below it.
  // Ordinary hymns have no upper fade, so use a smaller vertical inset.
  const topInset = isLife ? 38 : 18;
  const sideInset = isLife ? 16 : 14;
  const bottomInset = 18;""",
    )
    changed = replace_once(
        changed,
        "'<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +",
        """'<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    'html,body{width:100%;max-width:100%;margin:0;padding:0;background:transparent;overflow:hidden;overflow-x:hidden}' +""",
    )
    changed = replace_once(
        changed,
        """'#text{position:relative;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;font-family:Georgia,serif;' +""",
        """'#text{position:relative;display:block;width:100%;max-width:100%;min-width:0;' +
    'padding:'+topInset+'px '+sideInset+'px '+bottomInset+'px;' +
    'white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;font-family:Georgia,serif;' +""",
    )
    changed = replace_once(
        changed,
        "  const html=useMemo(()=>buildHtml(value,textStyle),[value,s.fontSize,s.lineHeight,s.color,s.textAlign]);",
        """  // Only the section kind affects inset choice; stable dependencies prevent
  // WebView reloads while the surrounding card changes state.
  const isLife = metadata?.section === 'life';
  const html=useMemo(()=>buildHtml(value,textStyle,isLife),[value,s.fontSize,s.lineHeight,s.color,s.textAlign,isLife]);""",
    )
    changed = replace_once(
        changed,
        "  wrap:{width:'100%',overflow:'visible',backgroundColor:'transparent'},",
        "  wrap:{width:'100%',minWidth:0,alignSelf:'stretch',overflow:'visible',backgroundColor:'transparent'},",
    )
    changed = replace_once(
        changed,
        "  view:{flex:1,backgroundColor:'transparent'},",
        "  view:{flex:1,width:'100%',minWidth:0,backgroundColor:'transparent'},",
    )

    if "padding:'+topInset+'px '+sideInset+'px '+bottomInset+'px;" not in changed:
        raise RuntimeError("Internal text padding was not installed")

    backup = BACKUP_ROOT / ("calendar-reader-insets-" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True, exist_ok=False)
    shutil.copy2(TARGET, backup / TARGET.name)
    TARGET.write_text(changed, encoding="utf-8")
    check = TARGET.read_text(encoding="utf-8")
    if MARKER not in check or "const isLife = metadata?.section === 'life';" not in check:
        raise RuntimeError("Post-write validation failed (original is in " + str(backup) + ")")
    print("PATCHED:", TARGET)
    print("Insets: life top 38px; hymns top 18px; sides 14-16px; bottom 18px")
    print("SOURCE BACKUP:", backup)
    print("No changes to heart, native scrolling, gradients or gesture handlers.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("READER INSET PATCH FAILED:", exc, file=sys.stderr)
        sys.exit(1)
