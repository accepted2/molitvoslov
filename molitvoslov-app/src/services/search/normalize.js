// Must match Python fold() in tools/build_search_seed.py.
export const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
