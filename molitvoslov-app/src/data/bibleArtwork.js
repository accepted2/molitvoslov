const BIBLE_ARTWORK = {
  MAT: {
    icon: require('../../assets/bible/evangelists/matthew-icon.png'),
    background: require('../../assets/bible/evangelists/matthew-bg.png'),
  },

  MRK: {
    icon: require('../../assets/bible/evangelists/mark-icon.png'),
    background: require('../../assets/bible/evangelists/mark-bg.png'),
  },

  LUK: {
    icon: require('../../assets/bible/evangelists/luke-icon.png'),
    background: require('../../assets/bible/evangelists/luke-bg.png'),
  },

  JHN: {
    icon: require('../../assets/bible/evangelists/john-icon.png'),
    background: require('../../assets/bible/evangelists/john-bg.png'),
  },
};

export const getBibleArtwork = (book) => {
  if (!book?.code) {
    return null;
  }

  return BIBLE_ARTWORK[book.code] || null;
};