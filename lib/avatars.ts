// Avatar presets served directly from the DiceBear "thumbs" API — no hosting needed.
export const AVATARS = [
  'Coco',
  'Kiki',
  'Mochi',
  'Boo',
  'Luna',
  'Bibi',
  'Cello',
  'Pickles',
].map((seed) => `https://api.dicebear.com/9.x/thumbs/svg?seed=${seed}&size=128`);
