# Prebuilt mobile search index (development branch)

The offline search database is generated from the exact versions of
`src/data/offlineContent.json` and `src/data/offlineBible.json` shipped with the app.

From `molitvoslov-app`:

```powershell
python .\tools\build_search_seed.py
```

Check output: `Records: ...`, `Integrity: ok`, and the generated
`src/data/search_seed.db` exists. The database is **not** the user database:
the app opens it as `molitvoslov_search_seed.db` through Expo SQLiteProvider.
Don't delete or overwrite `molitvoslov.db`.

For emulator testing, pull the feature branch into the current branch, run the
generator, then `npx expo run:android`. Native rebuild is required the first
time because FTS was enabled in Expo app configuration. Later JavaScript-only
changes can use Metro reload.

Re-run this generator when bundled content changes. Before merging to main,
commit the generated database as an asset and validate search results, runtime
performance, fallback on synced-content version mismatch, and asset size on
Android. A database missing from `src/data` causes Metro's `require` to fail.

The seed uses FTS prefix matching, not all legacy substring matching. A parity
test is necessary before production release.
