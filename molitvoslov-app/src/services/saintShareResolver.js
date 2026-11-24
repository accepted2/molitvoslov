// Resolve a calendar card from a public saint deep link.
// Deep links do not serialize the entire feast object; the recipient looks it
// up in the bundled offline calendar using the date and optional identity.
const SECTION_TEXT = {
  life: 'life_content',
  troparion: 'troparion_content',
  kontakion: 'kontakion_content',
  prayer: 'prayer_content',
};
const hasText = (feast, section) => {
  const key = SECTION_TEXT[section] || SECTION_TEXT.life;
  return Boolean(feast?.[key] || feast?.[key + '_uk']);
};
const fullness = feast => (
  Number(Boolean(feast?.life_content || feast?.life_content_uk)) * 8 +
  Number(Boolean(feast?.icon_url)) * 4 +
  Number(Boolean(feast?.troparion_content || feast?.troparion_content_uk)) * 2 +
  Number(Boolean(feast?.kontakion_content || feast?.kontakion_content_uk))
);

// With an identity, NEVER silently replace a requested saint by an unrelated
// saint of the same day. Without an identity (older links), use the main feast
// or the first feast containing the requested life/troparion/kontakion.
export const findSaintForSharedLink = (day, {
  feastUid = null, feastId = null, feastTitle = null, focusSection = 'life',
} = {}) => {
  const main = day?.main_feast || null;
  const candidates = [main, ...(day?.all_feasts || [])].filter(Boolean);
  if (!candidates.length) return null;
  const uid = String(feastUid || '').trim();
  const id = feastId == null ? '' : String(feastId).trim();
  const title = String(feastTitle || '').trim();
  const hasIdentity = !!(uid || id || title);
  if (hasIdentity) {
    const matches = candidates.filter(feast =>
      (uid && (String(feast.sync_uid || '') === uid ||
        (/^[0-9]+$/.test(uid) && String(feast.id ?? '') === uid))) ||
      (id && String(feast.id ?? '') === id) ||
      (title && String(feast.title || '') === title)
    );
    return matches.sort((a, b) =>
      Number(hasText(b, focusSection)) - Number(hasText(a, focusSection)) ||
      fullness(b) - fullness(a)
    )[0] || null;
  }
  if (main && hasText(main, focusSection)) return main;
  return candidates.find(feast => hasText(feast, focusSection)) ||
    main || candidates[0] || null;
};
