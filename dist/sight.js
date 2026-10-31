// What can be seen from a cell: symmetric shadowcasting (Albert Ford's, after the classic
// recursive kind). The grid is swept a quadrant at a time, a row further out each step,
// keeping track of the slopes still open between walls. A wall is seen but hides what's
// behind it; and sight is symmetric, so if A can see B then B can see A, which is what lets
// the same field of view say what the character sees and who can see the character.
//   opaque(x, y): whether a cell blocks sight
//   inRange(dx, dy): whether an offset from the origin is near enough to be seen at all
// Returns the keys ("x,y") of every cell in view, the origin included.

const QUADRANTS = [
  (ox, oy, row, col) => [ox + col, oy - row],   // north
  (ox, oy, row, col) => [ox + row, oy + col],   // east
  (ox, oy, row, col) => [ox + col, oy + row],   // south
  (ox, oy, row, col) => [ox - row, oy + col],   // west
];
const MAX_DEPTH = 24;              // rows out from the origin, beyond any light radius

export function fieldOfView([ox, oy], opaque, inRange) {
  const seen = new Set([`${ox},${oy}`]);
  for (const transform of QUADRANTS) {
    const at = (row, col) => transform(ox, oy, row, col);
    const wall = (row, col) => col !== null && opaque(...at(row, col));
    const floor = (row, col) => col !== null && !opaque(...at(row, col));
    const reveal = (row, col) => {
      const [x, y] = at(row, col);
      if (inRange(x - ox, y - oy)) seen.add(`${x},${y}`);
    };
    const scan = (depth, start, end) => {
      if (depth > MAX_DEPTH) return;
      let prev = null;
      const lo = Math.floor(depth * start + 0.5), hi = Math.ceil(depth * end - 0.5);
      for (let col = lo; col <= hi; col++) {
        // a cell is seen if it's a wall, or its centre lies within the open slopes
        if (wall(depth, col) || (col >= depth * start && col <= depth * end)) reveal(depth, col);
        if (wall(depth, prev) && floor(depth, col)) start = (2 * col - 1) / (2 * depth);
        if (floor(depth, prev) && wall(depth, col)) scan(depth + 1, start, (2 * col - 1) / (2 * depth));
        prev = col;
      }
      if (floor(depth, prev)) scan(depth + 1, start, end);
    };
    scan(1, -1, 1);
  }
  return seen;
}
