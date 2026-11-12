import {bibleContent} from '../bibleContent';

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
  if (route.name === 'BibleChapter') {
    const params = route.params || {};
    const focus = params.focusTarget;
    const metadata = focus?.metadata || {};
    const translationCode = params.translationCode === 'csl_traditional'
      ? 'csl_traditional' : 'rst';

    // The search index may have been built from an older Bible bundle.
    // Stable book/chapter/verse coordinates take precedence over row IDs.
    const bookById = bibleContent.getBook(params.bookId, translationCode);
    const bookBySlug = metadata.book_slug
      ? bibleContent.getBook(metadata.book_slug, translationCode)
      : null;
    const book = bookBySlug || bookById;
    if (!book) return route;

    const requestedChapter = Number(metadata.chapter_number || params.chapterNumber);
    const chapter = bibleContent.getChapter(book.id, requestedChapter, translationCode);
    if (!chapter) {
      return {...route, params: {...params, bookId: book.id, translationCode}};
    }

    const anchorType = focus?.anchor_type || focus?.anchorType;
    if (anchorType !== 'bible_verse') {
      return {...route, params: {
        ...params, bookId: book.id, chapterNumber: Number(chapter.number), translationCode,
      }};
    }

    const verseNumber = Number(metadata.verse_number);
    const verse = (chapter.verses || []).find((candidate) =>
      Number(candidate.number) === verseNumber
    ) || (chapter.verses || []).find((candidate) =>
      Number(candidate.id) === Number(focus.anchor_id ?? focus.anchorId)
    );
    if (!verse) return route;

    return {
      ...route,
      params: {
        ...params,
        bookId: book.id,
        chapterNumber: Number(chapter.number),
        translationCode,
        resume: false,
        focusTarget: {
          ...focus,
          anchor_type: 'bible_verse',
          anchor_id: Number(verse.id),
          metadata: {
            ...metadata,
            book_id: Number(book.id),
            book_slug: book.slug,
            chapter_number: Number(chapter.number),
            verse_number: Number(verse.number),
          },
        },
      },
    };
  }
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
