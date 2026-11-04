/**
 * Search indexes can contain legacy Book/category routes for independently
 * published prayers. Prefer their standalone Reader screen when the concrete
 * Text id is available; otherwise preserve the original route unchanged.
 *
 * Never route a prayer-rule item or a generic category heading here: those
 * require a focus target inside their parent document.
 */
export const resolveSearchOpenRoute = (item, publicContent) => {
  const route = item?.route;
  if (!route?.name) return route;
  if (route.name !== 'Book' || route.params?.focusTarget?.anchor_type !== 'category_text') {
    return route;
  }

  const requestedId = Number(route.params.focusTarget.text_id);
  if (!Number.isFinite(requestedId) || requestedId <= 0) return route;
  const texts = publicContent?.texts || {};
  const match = Object.values(texts).find((entry) =>
    entry?.slug && Number(entry.id) === requestedId && entry.is_visible !== false
  );
  if (!match) return route;

  return {
    name: 'Reader',
    params: {
      slug: match.slug,
      focusTarget: {
        ...route.params.focusTarget,
        anchor_type: 'text',
        anchor_id: match.id,
      },
    },
  };
};
