import semanticGroups from '../data/confessionSemanticGroups.json';

// The original source text is immutable. Only selection boundaries change:
// adjoining fragments of the *same idea* become one touch target. All legacy
// s**** identifiers stay valid, including private notes saved on any member.
export const buildSemanticConfessionDocument = document => {
  const groupById = new Map();
  const groups = semanticGroups.groups || [];
  const paragraphById = new Map();
  for (let i = 0; i < document.blocks.length; i++) {
    const block = document.blocks[i];
    if (block.type !== 'paragraph') continue;
    for (const part of block.segments || []) {
      if (paragraphById.has(part.id))
        throw new Error('Duplicate confession segment: ' + part.id);
      paragraphById.set(part.id, i);
    }
  }

  for (const ids of groups) {
    if (!Array.isArray(ids) || ids.length < 2)
      throw new Error('Invalid confession semantic group');
    const blockIndex = paragraphById.get(ids[0]);
    if (blockIndex == null || ids.some(id => paragraphById.get(id) !== blockIndex))
      throw new Error('Semantic group crosses paragraphs: ' + ids[0]);

    const originalSegments = document.blocks[blockIndex].segments;
    const start = originalSegments.findIndex(s => s.id === ids[0]);
    const exact = originalSegments.slice(start, start + ids.length).map(s => s.id);
    if (ids.join('|') !== exact.join('|'))
      throw new Error('Semantic group is not contiguous: ' + ids[0]);
    const group = {
      id: ids[0],
      memberIds: [...ids],
      text: originalSegments.slice(start, start + ids.length)
        .map(s => s.text).join(''),
    };
    group.title = group.text.trim().replace(/[,;.]\s*$/u, '').trim();
    for (const id of ids) {
      if (groupById.has(id)) throw new Error('Overlapping confession group: ' + id);
      groupById.set(id, group);
    }
  }

  const lookup = {};
  const blocks = document.blocks.map(block => {
    if (block.type !== 'paragraph') return block;
    const segments = [];
    for (const original of block.segments || []) {
      const group = groupById.get(original.id) || {
        id: original.id,
        memberIds: [original.id],
        text: original.text,
        title: original.text.trim().replace(/[,;.]\s*$/u, '').trim(),
      };
      lookup[original.id] = group;
      if (group.id === original.id) segments.push(group);
    }
    // No source words, spaces, spelling or punctuation are changed.
    if (segments.map(s => s.text).join('') !==
        block.segments.map(s => s.text).join(''))
      throw new Error('Confession text altered while grouping');
    return {...block, segments};
  });

  return {blocks, lookup};
};
