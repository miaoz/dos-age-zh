// Which version of the game this is: each has its own scoreboard (worker/scores.js VERSIONS, which
// a new one's added to the end of too), a new version's starting empty, the ones before kept as
// they ended. The game asks for its own version's board, and its own version's ghosts, and sends
// its journeys there, so one begun before a new version came out goes on the board it was played for.
// The title screen's credit says it too ("DOS-AGE v0.13", title.js TITLE.foot).
export const VERSION = "v0.13";
