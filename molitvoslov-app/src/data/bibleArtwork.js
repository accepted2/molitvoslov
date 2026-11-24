const BIBLE_ARTWORK = {
  MAT: {
    icon: require('../../assets/bible/evangelists/matthew-icon_opt.webp'),
    background: require('../../assets/bible/evangelists/matthew-bg_opt.webp'),
  },

  MRK: {
    icon: require('../../assets/bible/evangelists/mark-icon_opt.webp'),
    background: require('../../assets/bible/evangelists/mark-bg_opt.webp'),
  },

  LUK: {
    icon: require('../../assets/bible/evangelists/luke-icon_opt.webp'),
    background: require('../../assets/bible/evangelists/luke-bg_opt.webp'),
  },

  JHN: {
    icon: require('../../assets/bible/evangelists/john-icon_opt.webp'),
    background: require('../../assets/bible/evangelists/john-bg_opt.webp'),
  },
};

export const getBibleArtwork = (book) => {
  if (!book?.code) {
    return null;
  }

  return BIBLE_ARTWORK[book.code] || null;
};
