import {getCurrentContent} from './contentStore';

// A deep link contains one URL segment, not the extra id + slug parameters
// passed by navigation from the internal catalog. Recover the actual local
// object before the reader asks the offline content API for its slug.
export const resolveSharedReaderRoute = (kind, {id, slug} = {}, content = getCurrentContent()) => {
  const collection = kind === 'akathist' ? content?.akathists
    : kind === 'canon' ? content?.canons : null;
  const bySlug = collection?.by_slug || {};
  const list = Array.isArray(collection?.list) ? collection.list : [];
  const normalizedSlug = String(slug ?? '').trim();
  const requestedId = id == null ? '' : String(id).trim();

  // Slugs are canonical, even when an unrelated old numeric ID was included.
  let item = (normalizedSlug && bySlug[normalizedSlug]) ||
    (requestedId && bySlug[requestedId]) || null;

  // Backward compatibility for links published as akathist/42 or canon/99.
  if (!item && requestedId) {
    item = list.find(entry => String(entry?.id ?? '') === requestedId) || null;
    if (item?.slug && bySlug[item.slug]) item = bySlug[item.slug];
  }

  const resolvedSlug = item?.slug || normalizedSlug ||
    (requestedId && !/^\\d+$/.test(requestedId) ? requestedId : '');
  const numericId = item?.id ?? ( /^\\d+$/.test(requestedId) ? Number(requestedId) : null );

  return {
    id: numericId,
    slug: resolvedSlug,
    title: item?.title || null,
    found: !!item,
  };
};
