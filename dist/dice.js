// The game's dice: every roll that changes how a journey goes (a blow, a drop, a monster's way,
// what a chest holds...) is made with these, never with Math.random(), so a journey can be played
// over again exactly from its seed (see REPLAY in game.js). What only changes what's said or
// heard (a lumberjack's line, a sound) is still Math.random()'s, so it never moves them on.
// Shuffling is done here too: a sort by a random comparator goes differently from one browser
// to another.

import { rng } from "./world.js";

let stream = Math.random, drawn = 0;
// A number in [0, 1), off the dice
export const random = () => { drawn++; return stream(); };
// The dice set by the journey's seed (till then, Math.random())
export function seedDice(seed) {
  stream = rng(seed);
  drawn = 0;
}
// ...and set again by it, `n` numbers already off them (a saved journey taken up again, see SAVE in game.js)
export function resumeDice(seed, n) {
  seedDice(seed);
  for (let i = 0; i < n; i++) stream();
  drawn = n;
}
// How many numbers have come off them, for checking a journey watched again keeps in step
export const diceDrawn = () => drawn;
// A copy of `list` in a random order (Fisher-Yates)
export function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
