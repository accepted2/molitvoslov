#!/usr/bin/env python3
"""Guarded title searches for AkathistList, CanonList, MiscPrayers screens."""
from pathlib import Path
from datetime import datetime
import sys,shutil
ROOT=Path(__file__).resolve().parents[1]
MARK="MOLITVOSLOV_CATEGORY_TITLE_SEARCH_V1"
edits={}
def one(s,old,new,p):
    count=s.count(old)
    if count!=1: raise RuntimeError(f"{p}: anchor count {count}: {old[:100]!r}")
    return s.replace(old,new,1)
def listing(s,p,kind):
    s=one(s,"import React, {useCallback, useEffect, useState} from 'react';",
      "import React, {useCallback, useEffect, useMemo, useState} from 'react';",p)
    s=one(s,"import {getLocalizedField} from '../services/localizedContent';",
      "import {getLocalizedField} from '../services/localizedContent';\nimport {LocalSearchField, filterByTitle} from '../components/search/LocalSearchField';",p)
    var="akathists" if kind=="akathist" else "canons"
    label="акафист" if kind=="akathist" else "канон"
    plural="акафистов" if kind=="akathist" else "канонов"
    s=one(s,"  const [loading, setLoading] = useState(true);",
      f"""  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''); // {MARK}
  const visibleRows = useMemo(() => filterByTitle(
    {var}, query, item => getLocalizedField(item,'title',language)
  ), [{var},query,language]);""",p)
    s=one(s,f"          data={{{var}}}","          data={visibleRows}",p)
    s=one(s,"          renderItem={({item}) => {",
      f"""          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={{<View style={{styles.localSearch}}>
            <LocalSearchField value={{query}} onChangeText={{setQuery}} placeholder="Поиск {label}а по названию" />
          </View>}}
          renderItem={{({{item}}) => {{""",p)
    empty="akathistsEmpty" if kind=="akathist" else "canonsEmpty"
    s=one(s,f"<Text style={{styles.emptyText}}>{{t('menu.{empty}')}}</Text>",
      f"<Text style={{styles.emptyText}}>{{query ? 'По запросу нет {plural}' : t('menu.{empty}')}}</Text>",p)
    s=one(s,"  listContent: {","  localSearch: {paddingHorizontal:10,paddingBottom:12},\n  listContent: {",p)
    return s
def misc(s,p):
    s=one(s,"import {contentApi as api} from '../services/contentApi';",
      "import {contentApi as api} from '../services/contentApi';\nimport {LocalSearchField, matchesLocalQuery} from '../components/search/LocalSearchField';",p)
    s=one(s,"  const [loading, setLoading] = useState(true);",
      f"  const [loading, setLoading] = useState(true);\n  const [query, setQuery] = useState(''); // {MARK}",p)
    s=one(s,"  useEffect(() => {\n    let active = true;",
      "  useEffect(() => {\n    setQuery('');\n    let active = true;",p)
    s=one(s,"  const openItem = (item) => {",
      """  const visibleItems = useMemo(() => items.filter(item => matchesLocalQuery(query,
    item.kind === 'category' ? item.category.name :
    (item.row.text?.title || item.row.text?.description || 'Молитва')
  )), [items,query]);

  const openItem = (item) => {""",p)
    s=one(s,"            data={items}","            data={visibleItems}",p)
    s=one(s,"            ListEmptyComponent={",
      """            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.localSearch}>
                <LocalSearchField value={query} onChangeText={setQuery} placeholder="Поиск молитвы по названию" />
              </View>
            }
            ListEmptyComponent={""",p)
    s=one(s,"<Text style={styles.emptyTitle}>Молитвы пока не добавлены</Text>",
      "<Text style={styles.emptyTitle}>{query ? 'Ничего не найдено' : 'Молитвы пока не добавлены'}</Text>",p)
    s=one(s,"                  Этот раздел уже готов для наполнения через админку.",
      "                  {query ? 'Попробуйте другое название молитвы' : 'Этот раздел уже готов для наполнения через админку.'}",p)
    s=one(s,"  center: {","  localSearch: {marginBottom:8},\n  center: {",p)
    return s
for path,fn in [
 ("src/screens/AkathistListScreen.js",lambda s,p:listing(s,p,"akathist")),
 ("src/screens/CanonListScreen.js",lambda s,p:listing(s,p,"canon")),
 ("src/screens/MiscPrayersScreen.js",misc)
]:
    src=(ROOT/path).read_text(encoding='utf-8-sig')
    if MARK in src:
        print('ALREADY PATCHED:',path)
        continue
    edits[path]=fn(src,path)
if not edits:
    print('All three library searches already patched')
    sys.exit(0)
backup=ROOT.parent/'build-backups'/('library-search-'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
for path in edits:
    dst=backup/path
    dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/path,dst)
for path,updated in edits.items():
    (ROOT/path).write_text(updated,encoding='utf-8')
    print('PATCHED:',path)
print('BACKUP:',backup)
