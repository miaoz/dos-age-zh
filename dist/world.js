// The outside map, laid out fresh on every load from a random seed:
//   - a clearing with a house (one of three, rarely painted red), a chest near it, 2-4 big
//     trees and patches of grass
//   - a smaller clearing with the cave, some way off in one of the 8 compass directions, its
//     floor scattered with pebbles and the odd clump of stones, and a chest by its entrance
//   - the main road (see VEIN): out of the house's door and on and on through the forest, out
//     through its biomes one after another (see BIOMES), now and then a pathway forking off it
//     to a clearing, and rarely to a site
//   - a winding road forking off it to the cave's entrance, with two skeletons waiting side by
//     side halfway along the way from the door to the cave
//   - a few clearings hidden in the forest, each with a shed (see PATCHES), some reached by a
//     pathway forking off the road or leading on to another clearing (see PATHWAY_FORK)
//   - the demon that hunts the character, DEMON_AWAY off in any direction, on a bare cell
//     wherever that lands (usually deep in the forest)
//   - ENTS ents, each ENTS_AWAY off in any direction, placed the same way
//   - a few lumberjacks (LUMBERJACKS), LUMBERJACKS_AWAY off, likewise (the game sets them to work)
//   - a river (see RIVER_WIDTH) winding past the house on one side, on and on either way, crossed
//     by a bridge wherever the road or a pathway meets it and now and then in the wild, and more
//     rivers like it further off (see RIVER_APART), however far the character goes
//   - a few trails (see TRAILS) winding through the forest the same way, on and on, to walk along
//   - slimes, plain and horned, anywhere there's open ground (see SLIME_CHUNK)
//   - a few derelict towers (see TOWERS) standing in the forest
//   - now and then, far out, a rare site: a church with its priest, a haunted graveyard, a bandits'
//     hideout, a fairy ring, a small village, a burning bush or a lake with a house on its shore (see SITES)
//   - when asked for, a lady at the edge of the forest round the house, at least LADY_AWAY
//     steps from the start (the game decides whether she's out here, in the house or nowhere)
// all inside an endless forest. Layouts that would leave something out of reach are
// thrown away and drawn again.

const CAVE_DISTANCE = [300, 390]; // door to cave entrance, in game px (cells are 8x12)
const SKELETONS_AT = 0.5;        // how far along the way to the cave the skeletons lie in wait, side by side
export const DEMON_AWAY = 240;          // how far off the demon starts, in cell widths, any direction
const ENTS = 8;                  // how many ents wander the forest...
const ENTS_AWAY = [30, 70];      // ...each starting this far off (min..max), any direction
const LUMBERJACKS = [5, 7];      // how many lumberjacks are at work in the forest (min..max)...
const LUMBERJACKS_AWAY = [18, 110]; // ...each starting this far off (min..max), any direction
const ROAD_WANDER = 2.5;         // how much the road bends to follow cheap ground
const ROAD_TURN_COST = 1.5;      // extra cost of a turn, so it runs in long-ish stretches
const HOUSE_CLEARING = [11, 7];  // radius of the house's clearing, in cells [cols, rows]
const CAVE_CLEARING = [7, 5];
const CLEARING_WOBBLE = 0.3;     // how ragged clearing edges are (0 = clean ellipses)
const WOBBLE_SCALE = 3;          // cells per bump along an edge
const RED_HOUSE = 0.025;         // chance the house is one of the red ones
// A red house or shed has a chest more than it would have (see makeRoom(), makeShed()),
// RED_BLUE of the time a blue one, with a spell in it, as the fairy ring leaves (Claude's pick, 2026-10-12)
const RED_BLUE = 0.05;
const BIG_TREES = [2, 4];        // how many big trees stand around the house
// Big trees stand out in the forest too, in among the little ones: BIG_TREE_CHUNK of its chunks
// (WILD_CHUNK) have one, its trunk's foot deep in the trees and its canopy over them. And
// GROVES of the clearings are groves instead: a clearing of PATCH_SIZES' `grove` size with
// GROVE_TREES big trees (min..max) standing in its grass, their feet at least GROVE_APART
// cells apart, and no shed. None of them can be cut down.
const BIG_TREE_CHUNK = 0.5;
const GROVES = 0.1;
const GROVE_TREES = [3, 5];
const GROVE_APART = 3;
// The forest's biomes, in order out from the house ("biomes", 501:78337: each one's looks are
// SCENE.biomes', its trees, water, road, pathways and grass): forest-1's green trees, then
// forest-2's grey ones with big trees tall, their leaves turned, its water greener and rocks in
// its grass. Each after the first starts `from` cell widths away from the house, the cave and
// the line between them (the nearest point of the straight line from door to entrance), and
// it's all there is by `full`. In between the two are mixed, evenly more of the further the
// further out: how far along a place is wanders by BIOME_MIX's `warp` cell widths (in bulges
// some `warpScale` cells across), and within the mix each cell is picked `loose` by itself and
// the rest with its neighbours, in loose clumps some `clump` cells across, so the one forest
// thins into the other tree by tree rather than in blocks (and its river's water likewise,
// cell by cell). `trees` weighs its small trees: forest-1's tree3-5 share the last 10%;
// forest-2's the same five then its own two (added 2026-10-05), which take 13% between them
// (Claude's pick). `gaps` of a biome's cells are left empty, here and there between its trees:
// forest-1's packed tight, forest-2's porous (the user's ask, 2026-10-11; the share Claude's
// pick). Past it, forest-3 (516:88373), dead: bare grey trees, big and small, swampy green water,
// very sparse, three in four of its cells empty (the user's ask; `from`, `full`, `trees` and the
// share Claude's picks, 2026-10-11). Its empty cells aren't bare: `scatter` of them have its
// dirt (the pathway's tiles) or its grass (and rocks) on them, by `scatter`'s weights (the user's
// ask, 2026-10-11; the shares Claude's). And so its ways can be told apart from the empty ground
// round them, the trees stand thicker along them: within `lined` cells of a trail, the road or a
// pathway, only `linedGaps` of its cells are empty (Claude's picks). Past it, for now a placeholder,
// forest-4 (547:71832, 2026-10-12): tall thorned trunks and red water, as sparse as forest-3 and
// with forest-3's monsters, graves and lich, out where only the quickest journey reaches by its
// last day (`from` and `full` Claude's picks). It's to be a final boss's place (the user's,
// 2026-10-12); forest-3's monsters keep it till its own come.
// A new biome is a new section in Figma (tools/extract.py BIOMES) and one here.
const BIOMES = [
  { name: "forest-1", trees: [60, 30, 10 / 3, 10 / 3, 10 / 3], gaps: 0 },
  { name: "forest-2", from: 120, full: 450, trees: [52, 26, 3, 3, 3, 6.5, 6.5], gaps: 0.15 },
  { name: "forest-3", from: 600, full: 900, trees: [35, 35, 15, 15], gaps: 0.75, scatter: { share: 0.15, dirt: 50, grass: 50 },
    lined: 2, linedGaps: 0.1 },
  { name: "forest-4", from: 950, full: 1200, trees: [50, 50], gaps: 0.75, scatter: { share: 0.15, dirt: 50, grass: 50 },
    lined: 2, linedGaps: 0.1 },
];
const BIOME_MIX = { warp: 60, warpScale: 90, clump: 9, loose: 0.6 };
const ZONE_SLACK = 15;          // (see zoneAt(); Claude's pick)
// The main road ("road", 74:27013, the same tiles as the cave's): out of the house's door to
// `start` px off in any direction, then on and on that way for ever, in straight stretches
// between points of its course `step` px apart along it, swinging `swing` px either way (big
// bends about every `bend` px along, and a smaller wiggle on those) only once it's `ramp` px
// out (so it never comes back past the house), and never doubling back, so following it leads
// out through the biomes one after another. Its first `near` px are laid out up front (the
// clearings round it, the cave's fork), the rest as it's come to. A clearing out in the forest
// with its edge within `fork` cells of it has a pathway forking off it to it PATHWAY_FORK of the
// time, and a site (see SITES) within `site` cells always has one (Claude's picks).
const VEIN = { start: 180, ramp: 400, swing: [90, 14], bend: [280, 40], step: 48, near: 600, fork: 16, site: 30 };
// The cave's off to one side of it, CAVE_OFF degrees (min..max) from its way, the road to it
// forking off the main road where that's nearest
const CAVE_OFF = [30, 60];
const CHEST_RING = [2, 5];       // chest distance from the house, in cells
const CAVE_CHEST = [3, 2];       // the cave's chest: at most this far [across, down] from its entrance, below it
const GRASS_PATCHES = [3, 5], GRASS_PATCH_SIZE = [3, 7];
const GRASS_SPARSE = 0.04;       // chance of a lone grass1 on any other open cell
const PEBBLES_SPARSE = 0.07;     // chance of pebbles on any open cell by the cave
const STONE_PATCHES = [0, 2], STONE_PATCH_SIZE = [3, 6]; // clumps of pebbles and stones
// Clearings hidden in the forest ("patches-in-forest", 71:25205): PATCHES of them, each a
// ragged blob of tall grass (the same as round the house), its rows' ends wandering in or
// out a cell, in one of PATCH_SIZES: `radius` [cols, rows] (each min..max) out from its
// middle, picked by `weight`. SHED_CHANCE of them have a shed (one of "sheds", 71:25129, red
// RED_SHED of the time, with a chest more inside) near the middle, with a cell of bare ground round it; either way a
// trail of bare ground (`trail` cells) leads off from the middle, the odd pebble on it
// (PATCH_PEBBLES). Each patch's edge is PATCH_REACH cells from somewhere
// on the road, and at least PATCH_AWAY cells of forest from the house's and cave's clearings,
// the road and the other patches: shut in by trees, so it's only seen up close and reached by
// cutting a way in. The big ones are tried first, so they find room. Grass clearings (the only
// kind so far) come small or medium; big and very big are kept for kinds still to come.
const PATCHES = [8, 12];
const PATCH_SIZES = {
  small: { radius: [[2, 3], [1, 2]], weight: 50, trail: [1, 2] },     // ~15-35 cells
  medium: { radius: [[4, 6], [2, 3]], weight: 50, trail: [2, 4] },    // ~30-80, like the mock
  big: { radius: [[8, 10], [3, 4]], weight: 0, trail: [4, 7] },       // ~90-160
  veryBig: { radius: [[12, 15], [5, 6]], weight: 0, trail: [6, 10] }, // ~210-330
  grove: { radius: [[6, 6], [3, 3]], weight: 0, trail: [0, 0] },      // ~85: as big as a chunk has room for (see GROVES)
};
const PATCH_REACH = [4, 14];
const PATCH_AWAY = 2;
const PATCH_PEBBLES = 0.35;              // chance of pebbles on a bare cell
// Further out, the forest goes on for ever, and so do the patches: it's cut into WILD_CHUNK
// [cols, rows] chunks, and WILD_CHANCE of them hold a patch, kept WILD_MARGIN cells in from
// the chunk's edges (so patches in neighbouring chunks never crowd each other). A chunk is laid
// out the first time it's asked for (see extend()), from dice seeded by where it is, so it
// comes out the same whenever it's reached.
const WILD_CHUNK = [20, 12];
const WILD_CHANCE = 0.8;
const WILD_MARGIN = 2;
const SHED_CHANCE = 0.5;
// The lady haunts GHOST_CHANCE of the patches too: on its grass, with the forest right beside her
const GHOST_CHANCE = 0.05;
// Slimes turn up anywhere on the map there's open ground (a clearing, a trail, beside the road):
// SLIME_CHUNK of the forest's chunks (WILD_CHUNK) have SLIMES of them (min..max), each on a cell
// of open ground picked at random in the chunk (a chunk with none to be found goes without),
// never within SLIME_AWAY cell widths of where the character starts. HORNED_SLIME of them are
// horned slimes. They're laid out with their chunk (see extend()), and the game brings them to life.
// (the forests' monsters, slimes and forest-3's own, kobolds, fuzhu, bandits and ents, 30% more since 2026-10-12, the user's ask
// for a little more; was 0.5, 0.3, 0.04, 0.05 and 0.06; and 15% more again since 2026-10-16, the user's: was 0.65, 0.39,
// 0.052, 0.065 and 0.078. Not the bosses, the night's risers nor the caves')
const SLIME_CHUNK = 0.75;
const SLIMES = [1, 2];
const SLIME_AWAY = 12;
export const HORNED_SLIME = 0.3;
// Kobolds (tier II, see ENEMIES in game.js) live in the second biome's forest only: KOBOLD_CHUNK
// of its chunks have KOBOLDS of them (min..max), each on open ground there, picked like a slime's
// (and rolled apart from everything else in the chunk, so the rest of it is laid out as before)
const KOBOLD_CHUNK = 0.45;
const KOBOLDS = [1, 2];
// (each a kobold duelist KOBOLD_DUELIST of the time, v0.12; Claude's pick)
const KOBOLD_DUELIST = 0.25;
// The fuzhu (forest-1's and -2's hard one, v0.12): FUZHU_CHUNK of the chunks more than FUZHU_AWAY
// cell widths from the start have one, on open ground (Claude's picks)
const FUZHU_CHUNK = 0.06;
const FUZHU_AWAY = 60;
// Bandits roam the first biome's forest too, away from any hideout (v0.12, the user's ask): WILD_BANDIT
// of its chunks more than BANDIT_AWAY cell widths from the start have WILD_BANDITS of them (min..max),
// on open ground, each on its own (Claude's picks)
const WILD_BANDIT = 0.075;
const WILD_BANDITS = [1, 2];
const BANDIT_AWAY = 40;
// Lone graves in the third biome's dead forest (its own, 516:88373 "graveyards", 2026-10-11), and the fourth's:
// WILD_GRAVE of its chunks have WILD_GRAVES of them (min..max), a cross over a mound or, GRAVE_BARE
// of the time, the mound alone, low enough to see over (Claude's picks). The first two biomes have
// them too, fewer (the user's, 2026-10-18: rare in forest-1, more in forest-2, in the graveyard's
// own, P.graves): GRAVE_SHARE[biome] of those that'd be there are, none within GRAVE_AWAY cell
// widths of the start
const WILD_GRAVE = 0.35, WILD_GRAVES = [1, 3], GRAVE_SHARE = [0.15, 0.45, 1, 1], GRAVE_AWAY = 40;
// Who lies in each grave, lone or a graveyard's (the user's, 2026-10-18: a supporter's name on
// Ko-fi, read with F, see GRAVE in game.js): for now a made-up name of GRAVE_NAME letters, a
// consonant and a vowel by turns, picked by hashing where the grave is, never the dice
const GRAVE_NAME = 6, CONSONANTS = "BCDFGHJKLMNPRSTVWZ", VOWELS = "AEIOU";
// ...and, rarely, a golem (a boss, see ENEMIES in game.js): GOLEM_CHUNK of the second biome's
// chunks more than GOLEM_AWAY cell widths from the start have one, on open ground there
const GOLEM_CHUNK = 0.012;
const GOLEM_AWAY = 180;
// The third biome's own (and, for now, the fourth's too; v0.12, "monster" 450:77570's forest-3, all of them aggressive and about
// day and night): where a chunk elsewhere has its slimes, one there has as many again of these,
// by these weights, and its lumberjack but never an ent (forest-3's card has none); the fuzhu
// keeps to the first two biomes. And, as rarely as the golem in the second, the lich, a boss of
// its own: LICH_CHUNK of its chunks have one (the weights and odds Claude's picks, 2026-10-12)
const FOREST3 = { acolyte: 25, skeleton: 20, zombie: 15, skeletonArcher: 20, wraith: 12, skeletonMage: 8 };
const LICH_CHUNK = 0.012;
// Ents and lumberjacks turn up further out as well, past where the first ones start (ENTS_AWAY's
// and LUMBERJACKS_AWAY's far ends): WILD_ENT and WILD_LUMBERJACK of the forest's chunks have
// one, on a cell picked at random in the chunk, laid out with it like the slimes.
const WILD_ENT = 0.09;
const WILD_LUMBERJACK = 0.04;
// Chests turn up out there too, rarely: WILD_CHEST of the chunks more than CHEST_AWAY cell
// widths from where the character starts have one, at the forest's edge (where a tree would
// stand, with open ground beside it), so it's never in the way. The game fills it.
const WILD_CHEST = 0.045;
const CHEST_AWAY = 40;
const RED_SHED = 0.1;
// The road's tiles ("road", 74:27013): ragged ROAD_RAGGED of the time, normal the rest.
// Pathways: trails through the trees, each cell pathway-1 or pathway-2 as likely, and each
// pathway one, two or three cells wide all the way along (see PATH_WIDTHS).
// PATHWAY_FORK of the hidden clearings get one forking off the road to them, and a clearing is
// linked to its nearest neighbour (if it's within PATHWAY_LINK_REACH cells) PATHWAY_LINK of the
// time. Only the trail itself is cleared, so a clearing stays out of sight until you're close.
const ROAD_RAGGED = 0.35;
const PATHWAY_FORK = 0.3;
const PATHWAY_LINK = 0.25;
const PATHWAY_LINK_REACH = 30;
// How wide a pathway or a trail is, in cells, by weight. A wider one is the same course
// stamped with a square that wide, so it's at least that wide whichever way it runs.
const PATH_WIDTHS = { 1: 50, 2: 32, 3: 18 };
const PATH_BRUSH = { 1: [[0, 0]], 2: [[0, 0], [1, 0], [0, 1], [1, 1]],
  3: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] };
const pathWidth = roll => { let w = roll * 100; return Number(Object.keys(PATH_WIDTHS).find(n => (w -= PATH_WIDTHS[n]) < 0) || 1); };
// The river ("river", 97:31420): one per map, on and on both ways. It keeps to a course in any
// direction, winding back and forth across it (RIVER_SWING px either way: big bends about every
// RIVER_BEND px along, and a smaller wiggle on those) but never doubling back, so it always has
// two sides. Wherever it runs more up/down than sideways it's `down` cells wide (1 up to the
// mock's widest, 4 columns), and wherever it runs more sideways `across` cells deep (up to 3
// rows: about as thick on screen), its width drifting over about RIVER_WIDEN px; its banks
// step cell by cell like the mock's. It passes RIVER_AWAY px from the middle of the house and
// must keep out of the house's and the cave's clearings. The water blocks walking, never
// sight, and ripples the way it's flowing there (WATER in game.js). Distances are in game px,
// so it bends as much going up as going sideways.
const RIVER_WIDTH = { down: [1, 4], across: [1, 3] };
const RIVER_AWAY = [70, 220];
const RIVER_SWING = [70, 18];
const RIVER_BEND = [110, 30];
const RIVER_WIDEN = 90;
// It isn't the only one: the further the character goes, the more there are. Across its course
// another runs the same way, on and on like it, with bends, widths and crossings of its own: the
// next RIVER_APART px off (RIVER_APART_JITTER either way), and each one after that RIVER_CLOSER
// times nearer the one before it (its jitter likewise), down to RIVER_APART_MIN px apart, so
// they come oftener the further from home; that's still far enough apart that two never meet.
// (more often since 2026-10-16, the user's ask, without crowding: the next one 750 px off, not
// 1100, each after it 0.85 times nearer, not 0.8, and never nearer than 420 px, about 50 cell
// widths, a few screens of forest; so a journey through forest-1 and -2 crosses about twice as
// many. Their bridges and sandbars come with them, as ever)
const RIVER_APART = 750;
const RIVER_APART_JITTER = 150;
const RIVER_CLOSER = 0.85;
const RIVER_APART_MIN = 420;
const riverGap = k => Math.max(RIVER_APART_MIN, RIVER_APART * RIVER_CLOSER ** k);   // px from the kth river out to the next
// Where the road or a pathway meets the river it crosses straight over, on a bridge (object
// variant=bridge, 97:30330) as long as the river is wide there; the road finds a narrow spot,
// each cell of water costing it WATER_COST more. In the wild there's a crossing about every
// CROSSING_EVERY px along the river (CROSSING_JITTER either way), wherever it's no wider than
// its widest, NATURAL of them a sandbar (nature variant=sand1, 11:2806: no-one built it) and
// the rest bridges, with the ground cleared of trees where each lands on either bank.
const WATER_COST = 4;
const BRIDGE_LINK = 6;             // (how far along the bank a trail's bridge may reach to the trail, see river.cell in layout())
const CROSSING_EVERY = 320;
const CROSSING_JITTER = 100;
const NATURAL = 0.7;
// Trails: TRAILS of them (min..max) per map, each one to three cells wide (see PATH_WIDTHS), winding on and on through the
// forest like the river does (its course any way at all, passing TRAIL_AWAY px from the middle
// of the house, swinging TRAIL_SWING px either way about every TRAIL_BEND px along), cleared of
// trees so it can be walked. Each cell's tile is picked by TRAIL_TILES' weights: a pathway tile
// (pathway-1 or -2, 74:27122), dirt (the pebbles, 41:17608), rock (the stones, 41:17600) or now
// and then grass (40:17588). Where one meets the river it goes over on a bridge; where it meets
// a clearing, the road or a pathway, that's left as it is.
const TRAILS = [2, 3];
const TRAIL_AWAY = [30, 240];
const TRAIL_SWING = [60, 16];
const TRAIL_BEND = [90, 26];
const TRAIL_TILES = { pathway: 55, dirt: 22, rock: 13, grass: 10 };
// ...and, so there's a way to follow out in the far forests too, FAR_TRAILS more (min..max) that
// pass `away` cell widths (min..max) from the house, so they only ever run through forest-3 and
// the far edge of forest-2 (the user's ask, 2026-10-11; the numbers Claude's)
const FAR_TRAILS = { count: [3, 4], away: [650, 1100] };
// Derelict towers ("tower-wood", 17:5761, and "tower-stone", 17:5501), wood or stone as likely:
// TOWERS of them (min..max) per map, each TOWERS_AWAY cell widths off (min..max) in any
// direction, in the forest with a cell of bare ground all round, clear of everything else, and
// within TOWER_PATH_REACH cells of a trail, a pathway or a clearing: a pathway leads from its
// foot to the nearest of those.
// They stand in the way like a house, and can be climbed to look out from (see LOOKOUT in game.js).
const TOWERS = [2, 4];
const TOWERS_AWAY = [25, 80];
const TOWER_PATH_REACH = 35;
// Further out than that (past TOWERS_AWAY's far end), WILD_TOWER of the forest's chunks
// (WILD_CHUNK) may have one too, the same way, where there's room and something to lead its pathway to:
// about one to every 60 chunks in the end, three or four screens of forest
const WILD_TOWER = 0.025;
// ...and past WILD_CAVES_AWAY cell widths, WILD_CAVE of the chunks a cave like the first one, the
// same way (its entrance where a tower's door would be), each going down to a cave of its own
const WILD_CAVE = 0.03;
const WILD_CAVES_AWAY = 60;
// ...and past SHRINE.away cell widths, SHRINE.chance of the chunks a shrine (the user's, 2026-10-20,
// "shrines", 801:55109), in any biome, laid out as a tower is (a little opening round it, a pathway
// to it): `rareOdds` of them one of the `rare` pacts', the rest a common one's, each kind as likely
// as the others of its tier (game.js SHRINE has what each offers). From dice of their own, so
// nothing else in a chunk is laid out differently for them. (the user's numbers, 2026-10-20)
export const SHRINE = { chance: 0.005, away: 40, rareOdds: 0.1,
  common: ["atk", "mag", "def", "spd", "hp"], rare: ["drain", "crit", "chain", "forge"] };
// Rare sites, far out in the forest: `chance` of the chunks (WILD_CHUNK) more than `away` cell
// widths from where the character starts have one in place of their patch, a big opening of
// grass `radius` [cols, rows] out from its middle (squarer than a patch, only its corners cut
// away, so what stands in it fits), kept SITE_MARGIN cells in from the chunk's edges (the
// patches round it keep their own way off, see PATCH_AWAY). Its grass is every
// kind there is: the clearings' tall grass and the graveyard's ("graveyard", 207:80224), mixed.
//   - church ("church", 204:72504): a wooden or a stone one as likely, standing in the middle,
//     a pathway leading down from its door, and its priest walking the edge of the grass (the game
//     has him walk and talk). Its door is a landmark, like a tower's foot, and leads inside (see
//     makeChurch()). It's a sanctuary: no monster is put there, or ever steps in (see game.js).
//   - graveyard ("graveyard", 207:80143): its shed (gone into by its door, its room always with
//     a chest), rows of graves (a cross over a mound, or now and then a mound alone, GRAVE_BARE
//     of them; GRAVES [cols, rows], min..max), and in front of them a band in formation, a
//     skeleton mage behind three skeletons, waiting.
//   - bandits' hideout ("bandit-hideout", 288:23835): an opening of its own size (`radius` is
//     [cols, rows] min..max), the bandits' hall in it and, the likelier the bigger it is, a shed
//     or two (see BANDITS), each gone into by its door like a shed; a chest or two lying out in
//     the open; and a band of bandits in front of the hall, waiting.
//   - fairy ring ("event", 359:59136): the biggest opening a chunk holds, bare but for a ring of
//     grass in its middle (SCENE.fairyRing) and the red altar in the ring's (no monster, ent or
//     lumberjack is put in it, so the ring stands out), which, come up to,
//     starts the rite (RITE in game.js): slimes rising from the ring, wave on wave.
//   - small village ("small-village", 454:39791, Tiffany's event): two houses (VILLAGE.houses, both
//     of SCENE.villageHouses) and, `shed` of the time, a shed (the clearings' first), each gone
//     into by its door like a shed; one of the biome's big trees standing among them; and a
//     family, a man, a woman and `kids` (min..max) boys and girls, near the first house's door,
//     their home (the game has them walk, talk and go in, see VILLAGE in game.js); and, `lone` of
//     the time, a lone woman by the second's, whose child is missing (.TIFF's). Nothing else
//     is put there. Only in the biomes `biomes` lists (the user's ask, 2026-10-12: forest-1 and -2).
//   - burning bush ("burning-bush", 402:33170, Tiffany's event): one of the biome's big trees in
//     the middle, `flames` of its cells (all but the foot of its trunk) burning in its canopy and a flame or
//     two over its top (drawn and flickering in the game, see BUSH there), the ground under them
//     bare. It's a sanctuary, as a church's clearing is. Standing by its foot, F speaks to it.
//   - lake ("lake-house", 716:127938, the user's ask, 2026-10-16): a small lake of still water, a
//     ragged oval (LAKE: `rows` deep, `half` cols out from its middle), with a house (one of
//     SCENE.lakeHouses) standing on its top edge, its doorway over the water, so the house shows
//     upside down in it (game.js REFLECT); the house isn't gone into. Now and then (`company`)
//     someone's there, on the shore with the water at their feet: one or two bandits (`bandits` of
//     the time), waiting as a hideout's band does, or else a lumberjack, resting, not at work. In
//     the first three biomes (`biomes`). The first lake laid out is a lumberjack's home instead
//     (`home`, with its `shore`): who's there is the game's (game.js LAKE_HOME).
// A site's `biomes`, if it has them, are the only ones (by the biome at its chunk's middle) it's
// ever in; every other site is in any (each laid out in that biome's own grass, pathways and big
// trees; its buildings are the same everywhere).
// With `site` asked for (see makeWorld()), the first chunk laid out past SITE_TRY cell widths
// has one of that kind, for trying it out (and with `siteIn`, the first in that biome).
const SITES = {
  church: { chance: 0.007, away: 90, radius: [7, 5] },
  graveyard: { chance: 0.008, away: 90, radius: [7, 5] },
  bandits: { chance: 0.008, away: 90, radius: [[5, 8], [3, 5]] },
  ring: { chance: 0.008, away: 90, radius: [8, 5] },
  village: { chance: 0.008, away: 90, radius: [8, 5], biomes: [0, 1] },
  bush: { chance: 0.007, away: 90, radius: [6, 4] },
  lake: { chance: 0.015, away: 60, radius: [8, 5], biomes: [0, 1, 2] },
  remnants: { chance: 0.008, away: 90, radius: [7, 4], biomes: [0, 1, 2] },
};
// (the lake's odds a little better than the village's, being only to look at; Claude's picks,
// 2026-10-16, for the user to balance)
const LAKE = { rows: [3, 5], half: [4, 6], wobble: 0.35, company: 0.5, bandits: 0.5, band: [1, 2] };
const STILL = { down: false, drift: 0 };   // (a lake's water: it doesn't flow, see game.js waterTile())
// (the village's and the bush's odds: as the church's, and a little more for the village, as
// Tiffany's notes ask; Claude's picks, 2026-10-12, for the user to balance)
const VILLAGE = { houses: 2, shed: 0.5, kids: [1, 3], lone: 0.5 };   // (`lone`: Claude's pick, 2026-10-20)
const BUSH = { flames: 0.45, above: [1, 2] };
// Remnants of a battle (.TIFF's codex battle-remnants, the user's art, 2026-10-19): `racks` of
// broken blades stuck in the ground (game.js's "rack" tile, the Figma's weapon-rack, 758:75214),
// `drops` of blood round each (min..max) and `splats` more of `splat` drops on the open ground
// (`big` of them 2 px, not 1), and `finds` cells (min..max) where gear lies (game.js
// REMNANTS; 3-6 the user's, 2026-10-19), and `bones` cells (min..max) of skulls and crossbones
// lying about, walked over (game.js's "bones-*" looks, 798:21618; 5-7 the user's, 2026-10-19).
// The rest Claude's picks.
const REMNANTS = { racks: [4, 7], drops: [6, 10], splats: [3, 5], splat: 14, big: 0.5, finds: [3, 6], inks: 4, bones: [5, 7],
  boneLooks: ["bones-l", "bones-r", "bones-l-dark", "bones-r-dark"] };
// A bandits' hideout (see SITES): how big it is, from `small` to `large` (its radius's cols
// times rows), makes each shed `shed` likely (min..max), and its band `band` strong (how many,
// min..max, all of them bandits since v0.12, no chief nor cutthroats any more); `chests`
// (min..max) lie in the open
const BANDITS = { small: 15, large: 40, shed: [0.15, 0.85], band: [3, 5], chests: [1, 2] };
const SITE_MARGIN = 0;
const GRAVES = [[3, 4], [2, 2]];
const GRAVE_BARE = 0.2;
const SITE_TRY = 25;

// mulberry32: tiny deterministic PRNG returning floats in [0, 1)
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash of a cell to a float in [0, 1)
function hash(x, y, seed) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [0, 1), for edges that bulge instead of jittering cell by cell
function noise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const s = t => t * t * (3 - 2 * t);
  const fx = s(x - x0), fy = s(y - y0);
  const at = (i, j) => hash(x0 + i, y0 + j, seed);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

const key = (x, y) => `${x},${y}`;
// One of `weights`' keys, by its weight, for `r` (0..1)
const weighed = (weights, r) => {
  let left = r * Object.values(weights).reduce((a, b) => a + b, 0);
  return Object.keys(weights).find(k => (left -= weights[k]) < 0) ?? Object.keys(weights)[0];
};
// A set that says when it gains something (to forget what was worked out from it)
class Watched extends Set {
  constructor(onGain) { super(); this.onGain = onGain; }
  add(k) { if (!this.has(k)) this.onGain(); return super.add(k); }
}
// A cell's answer to `f`, kept: in 64 x 64 chunks under small-number keys, so asking again makes
// nothing new (a "x,y" key would, every time). For what's asked of every cell on screen, several
// times a frame (a tree, a trail, the river); clear() forgets it all
function cellMemo(f) {
  const chunks = new Map();
  const at = (x, y) => {
    if ((x | 0) !== x || (y | 0) !== y) return f(x, y);   // (only whole cells kept)
    const ck = ((x >> 6) + 16384) * 32768 + (y >> 6) + 16384, i = (y & 63) * 64 + (x & 63);
    let c = chunks.get(ck);
    if (c === undefined) chunks.set(ck, c = new Array(4096).fill(undefined));
    let v = c[i];
    if (v === undefined) c[i] = v = f(x, y);
    return v;
  };
  at.clear = () => chunks.clear();
  return at;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const NEAR2 = Array.from({ length: 25 }, (_, i) => [i % 5 - 2, Math.floor(i / 5) - 2]).filter(([x, y]) => x || y);

// Tiny binary min-heap of [priority, value]
function heap() {
  const a = [];
  const up = i => { while (i && a[(i - 1) >> 1][0] > a[i][0]) { [a[i], a[(i - 1) >> 1]] = [a[(i - 1) >> 1], a[i]]; i = (i - 1) >> 1; } };
  const down = i => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < a.length && a[l][0] < a[m][0]) m = l;
      if (r < a.length && a[r][0] < a[m][0]) m = r;
      if (m === i) return;
      [a[i], a[m]] = [a[m], a[i]];
      i = m;
    }
  };
  return {
    get size() { return a.length; },
    push(p, v) { a.push([p, v]); up(a.length - 1); },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; down(0); } return top[1]; },
  };
}

// Cheapest 4-way path from `from` to `to` avoiding `blockedAt`, where ground costs more where
// the noise is high and turning costs extra: a road that wanders but doesn't zigzag. It only
// goes over the `river`'s water straight across it (see WATER_COST).
function roadPath(from, to, blockedAt, seed, river = null) {
  const pad = 14;
  const [x0, x1] = [Math.min(from[0], to[0]) - pad, Math.max(from[0], to[0]) + pad];
  const [y0, y1] = [Math.min(from[1], to[1]) - pad, Math.max(from[1], to[1]) + pad];
  const cost = (x, y) => 1 + ROAD_WANDER * noise(x / 5, y / 5, seed);
  const id = (x, y, d) => `${x},${y},${d}`;
  const best = new Map(), prev = new Map(), open = heap();
  const h = (x, y) => Math.abs(x - to[0]) + Math.abs(y - to[1]);
  for (let d = 0; d < 4; d++) { best.set(id(...from, d), 0); open.push(h(...from), [...from, d, 0]); }
  while (open.size) {
    const [x, y, d, g] = open.pop();
    if (g > best.get(id(x, y, d))) continue;
    if (x === to[0] && y === to[1]) {
      const path = [[x, y]];
      for (let k = id(x, y, d); prev.has(k);) { k = prev.get(k); const [px, py] = k.split(",").map(Number); path.unshift([px, py]); }
      return path;
    }
    DIRS.forEach(([dx, dy], nd) => {
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || blockedAt(nx, ny)) return;
      const wet = river?.water(nx, ny);
      if (wet && (dx !== 0) !== river.flow(nx, ny).down || river?.water(x, y) && nd !== d) return;
      const ng = g + cost(nx, ny) + (nd === d ? 0 : ROAD_TURN_COST) + (wet ? WATER_COST : 0);
      const k = id(nx, ny, nd);
      if (ng >= (best.get(k) ?? Infinity)) return;
      best.set(k, ng);
      prev.set(k, id(x, y, d));
      open.push(ng + h(nx, ny), [nx, ny, nd, ng]);
    });
  }
  return null;
}

// The river (see RIVER_WIDTH), its course heading `angle` (radians, in px) past `origin` (px),
// `mid` px off to one side of it there. Along is px downstream-ish along the course, from
// `origin`; the middle of the river is bend(along) px across it. Worked out a cell at a time
// outward from `origin` as far as it's asked about, so it comes out the same however it's
// explored. The road and pathways add their crossings with bridge().
const CELL = [8, 12];
const RIVER_MARGIN = 48;           // px: how far a cell of water can be, along, from the middle cell that made it
function makeRiver(angle, mid, [ox, oy], seed) {
  const u = [Math.cos(angle), Math.sin(angle)], n = [-u[1], u[0]];
  const way = hash(1, 2, seed) < 0.5 ? -1 : 1;   // which way along it flows
  const wave = (t, i) => noise(t / RIVER_BEND[i], 0.5, seed + i) * 2 - 1;
  const bend = t => mid + RIVER_SWING[0] * wave(t, 0) + RIVER_SWING[1] * wave(t, 1);
  const rel = (x, y) => [(x + 0.5) * CELL[0] - ox, (y + 0.5) * CELL[1] - oy];
  const along = (x, y) => { const [a, b] = rel(x, y); return a * u[0] + b * u[1]; };
  const across = (x, y) => { const [a, b] = rel(x, y); return a * n[0] + b * n[1] - bend(along(x, y)); };
  const middle = t => {
    const l = bend(t);
    return [Math.floor((ox + u[0] * t + n[0] * l) / CELL[0]), Math.floor((oy + u[1] * t + n[1] * l) / CELL[1])];
  };

  // Water: each cell of the middle line, and the cells beside it across its flow, as wide as
  // it is there. Each keeps whether it runs more up/down than sideways, and which way (+-1,
  // along x or y) it flows.
  const cells = new Map(), line = [];
  const stamp = (x, y, t) => {
    const dl = (bend(t + 1) - bend(t - 1)) / 2;
    const hx = way * (u[0] + n[0] * dl), hy = way * (u[1] + n[1] * dl);
    const down = Math.abs(hy) > Math.abs(hx);
    const [w0, w1] = RIVER_WIDTH[down ? "down" : "across"];
    const w = w0 + Math.min(w1 - w0, Math.floor(noise(t / RIVER_WIDEN, 7.5, seed + 2) * (w1 - w0 + 1)));
    const flow = { down, drift: Math.sign(down ? hy : hx) || 1 };
    for (let i = 0; i < w; i++) {
      const o = i - Math.floor((w - 1) / 2), k = down ? key(x + o, y) : key(x, y + o);
      if (!cells.has(k)) cells.set(k, flow);
    }
    line.push({ x, y, t, down });
  };
  const start = middle(0);
  stamp(...start, 0);
  const ends = { 1: { t: 0, at: start }, [-1]: { t: 0, at: start } };
  const grow = (dir, to) => {      // the middle line on out to `to` along, never cutting a corner
    const e = ends[dir];
    while (dir * (to - e.t) > 0) {
      e.t += dir;
      const c = middle(e.t);
      if (c[0] === e.at[0] && c[1] === e.at[1]) continue;
      if (c[0] !== e.at[0] && c[1] !== e.at[1]) stamp(c[0], e.at[1], e.t);
      stamp(...c, e.t);
      e.at = c;
    }
  };
  const water = (x, y) => {
    const t = along(x, y);
    grow(1, t + RIVER_MARGIN);
    grow(-1, t - RIVER_MARGIN);
    return cells.has(key(x, y));
  };
  // Which side of the water a cell is on: -1, 1, or 0 in it
  const side = (x, y) => (water(x, y) ? 0 : Math.sign(across(x, y)) || 1);
  // The cell next to x, y furthest out on side `s`
  const away = (x, y, s) => DIRS.map(([dx, dy]) => [x + dx, y + dy])
    .reduce((b, c) => (s * across(...c) > s * across(...b) ? c : b));

  // Crossings: a straight run of cells over the water from bank to bank, `ends` the bank cell
  // at either end by side, and `onto` the first cell of the run from that side
  const crossings = new Map(), laid = [], cleared = new Set(), found = new Map();
  const crossing = (run, before, after, kind, t) => {
    const sb = side(...before), sa = side(...after);
    if (!sb || !sa || sb === sa || run.some(c => crossings.has(key(...c)))) return null;
    const c = { t, kind, ends: { [sb]: before, [sa]: after }, onto: { [sb]: run[0], [sa]: run[run.length - 1] } };
    for (const r of run) crossings.set(key(...r), c);
    return c;
  };
  // The road's or a pathway's: `run` its cells of water, between `before` and `after`
  const bridge = (run, before, after) => {
    const c = crossing(run, before, after, "bridge", along(...run[run.length >> 1]));
    if (c) laid.push(c);
  };
  // The wild's in stretch s of CROSSING_EVERY px along, if there's anywhere narrow enough
  const wild = s => {
    if (found.has(s)) return found.get(s);
    found.set(s, null);
    const t0 = (s + 0.5) * CROSSING_EVERY + (hash(s, 3, seed) * 2 - 1) * CROSSING_JITTER;
    water(...middle(t0 + CROSSING_EVERY / 3));
    water(...middle(t0));
    const kind = hash(s, 4, seed) < NATURAL ? "sand" : "bridge";
    for (const m of line.filter(l => l.t >= t0 && l.t < t0 + CROSSING_EVERY / 3).sort((a, b) => a.t - b.t)) {
      const [dx, dy] = m.down ? [1, 0] : [0, 1];
      let a = [m.x, m.y], b = [m.x, m.y];
      while (water(a[0] - dx, a[1] - dy)) a = [a[0] - dx, a[1] - dy];
      while (water(b[0] + dx, b[1] + dy)) b = [b[0] + dx, b[1] + dy];
      const len = b[0] - a[0] + b[1] - a[1] + 1;
      if (len > RIVER_WIDTH[m.down ? "down" : "across"][1]) continue;
      const run = Array.from({ length: len }, (_, i) => [a[0] + i * dx, a[1] + i * dy]);
      const before = [a[0] - dx, a[1] - dy], after = [b[0] + dx, b[1] + dy];
      const c = crossing(run, before, after, kind, m.t);
      if (!c) continue;
      cleared.add(key(...before)).add(key(...after));
      found.set(s, c);
      return c;
    }
    return null;
  };
  const wildNear = t => { for (let s = Math.floor(t / CROSSING_EVERY) - 1; s <= Math.floor(t / CROSSING_EVERY) + 1; s++) wild(s); };

  // What's on a cell of the river: "water", "bridge", "sand", or null off it
  const cell = (x, y) => {
    if (!water(x, y)) return null;
    wildNear(along(x, y));
    return crossings.get(key(x, y))?.kind ?? "water";
  };
  return {
    water, cell, side, along, away, bridge,
    // how the water runs on a cell of it: { down, drift }
    flow: (x, y) => cells.get(key(x, y)),
    // kept free of trees: the banks at either end of a crossing in the wild
    cleared: (x, y) => { wildNear(along(x, y)); return cleared.has(key(x, y)); },
    // the crossing a cell is part of
    crossingAt: (x, y) => crossings.get(key(x, y)),
    // every crossing (the wild's and the road's) from a0 to a1 px along the river
    crossings: (a0, a1) => {
      const out = laid.filter(c => c.t >= a0 && c.t <= a1);
      for (let s = Math.floor(a0 / CROSSING_EVERY); s <= Math.floor(a1 / CROSSING_EVERY); s++) {
        const c = wild(s);
        if (c && c.t >= a0 && c.t <= a1) out.push(c);
      }
      return out;
    },
  };
}

// A trail (see TRAILS), its course heading `angle` past `origin` (px), `mid` px off to one side
// of it there, like the river's: whether a cell is on it, worked out a cell at a time outward
// from `origin` as far as it's asked about.
function makeTrail(angle, mid, [ox, oy], seed) {
  const u = [Math.cos(angle), Math.sin(angle)], n = [-u[1], u[0]];
  const wave = (t, i) => noise(t / TRAIL_BEND[i], 0.5, seed + i) * 2 - 1;
  const bend = t => mid + TRAIL_SWING[0] * wave(t, 0) + TRAIL_SWING[1] * wave(t, 1);
  const along = (x, y) => ((x + 0.5) * CELL[0] - ox) * u[0] + ((y + 0.5) * CELL[1] - oy) * u[1];
  const middle = t => {
    const l = bend(t);
    return [Math.floor((ox + u[0] * t + n[0] * l) / CELL[0]), Math.floor((oy + u[1] * t + n[1] * l) / CELL[1])];
  };
  const start = middle(0), cells = new Set([key(...start)]);
  const ends = { 1: { t: 0, at: start }, [-1]: { t: 0, at: start } };
  const grow = (dir, to) => {      // on out to `to` along, never cutting a corner, so it can be walked
    const e = ends[dir];
    while (dir * (to - e.t) > 0) {
      e.t += dir;
      const c = middle(e.t);
      if (c[0] === e.at[0] && c[1] === e.at[1]) continue;
      if (c[0] !== e.at[0] && c[1] !== e.at[1]) cells.add(key(c[0], e.at[1]));
      cells.add(key(...c));
      e.at = c;
    }
  };
  return (x, y) => {
    const t = along(x, y);
    grow(1, t + RIVER_MARGIN);
    grow(-1, t - RIVER_MARGIN);
    return cells.has(key(x, y));
  };
}

// The main road (see VEIN) from `origin` (px, a cell's middle) on out heading `angle`: whether a
// cell's on it, worked out a cell at a time as far out as it's asked about, like a trail's, but
// only ever forward
function makeVein(angle, [ox, oy], seed) {
  const u = [Math.cos(angle), Math.sin(angle)], n = [-u[1], u[0]];
  const wave = (t, i) => noise(t / VEIN.bend[i], 0.5, seed + i) * 2 - 1;
  const bend = t => Math.min(1, t / VEIN.ramp) * (VEIN.swing[0] * wave(t, 0) + VEIN.swing[1] * wave(t, 1));
  const along = (x, y) => ((x + 0.5) * CELL[0] - ox) * u[0] + ((y + 0.5) * CELL[1] - oy) * u[1];
  const middle = t => {
    const l = bend(t);
    return [Math.floor((ox + u[0] * t + n[0] * l) / CELL[0]), Math.floor((oy + u[1] * t + n[1] * l) / CELL[1])];
  };
  const start = middle(0), cells = new Set([key(...start)]), line = [[...start, 0]];   // line: [x, y, t] in order
  const end = { t: 0, at: start };
  const add = (c, t) => { if (!cells.has(key(...c))) { cells.add(key(...c)); line.push([...c, t]); } };
  // on out to `to` along: from a point of its course every `step` px to the next, straight across
  // then straight up or down (or the other way about), so it runs in stretches like a road
  // that's been laid, and can be walked
  const grow = to => {
    while (end.t < to) {
      const t0 = end.t, t1 = t0 + VEIN.step, c = middle(t1), [ax, ay] = end.at;
      const n = Math.abs(c[0] - ax) + Math.abs(c[1] - ay), across = hash(t1, 3, seed) < 0.5;
      for (let i = 1; i <= n; i++) {
        const dx = across ? Math.min(i, Math.abs(c[0] - ax)) : Math.max(0, i - Math.abs(c[1] - ay));
        const dy = i - dx;
        add([ax + Math.sign(c[0] - ax) * dx, ay + Math.sign(c[1] - ay) * dy], t0 + (t1 - t0) * i / n);
      }
      end.t = t1;
      end.at = c;
    }
  };
  const has = (x, y) => {
    const t = along(x, y);
    if (t < -RIVER_MARGIN) return false;
    grow(t + RIVER_MARGIN + VEIN.step);
    return cells.has(key(x, y));
  };
  // its cells in order from its start out to `t` px along
  const upTo = t => { grow(t); return line.filter(c => c[2] <= t).map(([x, y]) => [x, y]); };
  // its nearest cell to x, y (the fewest steps off), if one's within `reach` steps; or null
  const nearest = (x, y, reach) => {
    const t = along(x, y), far = reach * CELL[1] + RIVER_MARGIN + VEIN.step;
    if (t + far < 0) return null;
    grow(t + far);
    let lo = 0, hi = line.length;   // (the first cell of the line within `far` along)
    while (lo < hi) { const m = (lo + hi) >> 1; if (line[m][2] < t - far) lo = m + 1; else hi = m; }
    let best = null, d = reach + 1;
    for (let i = lo; i < line.length && line[i][2] <= t + far; i++) {
      const e = Math.abs(line[i][0] - x) + Math.abs(line[i][1] - y);
      if (e < d) { d = e; best = [line[i][0], line[i][1]]; }
    }
    return best;
  };
  return { start, has, upTo, nearest };
}

// All the rivers (see RIVER_APART): the first as makeRiver() has it, and the others either side
// of it, each made the first time a cell in its band (the strip across the course nearest it) is
// asked about. A cell is always answered by its band's river; near(x, y) is that river itself,
// for following one (its sides, its crossings).
function makeRivers(angle, mid, [ox, oy], seed) {
  const n = [-Math.sin(angle), Math.cos(angle)], rivers = new Map();
  const at = [0];                  // at[k]: px from the first river to the kth out, either way (less its jitter)
  const reach = k => { while (at.length <= k) at.push(at.at(-1) + riverGap(at.length - 1)); return at[k]; };
  const nth = i => {
    const k = Math.abs(i), jitter = k ? (hash(i, 5, seed) * 2 - 1) * RIVER_APART_JITTER * riverGap(k - 1) / RIVER_APART : 0;
    if (!rivers.has(i)) rivers.set(i, makeRiver(angle, mid + Math.sign(i) * reach(k) + jitter, [ox, oy], seed + 37 * i));
    return rivers.get(i);
  };
  // the band `d` px across the course from the first river is in: the river nearest it
  const band = d => {
    const a = Math.abs(d);
    let lo = 0, hi = 1;
    while (reach(hi) < a) lo = hi, hi *= 2;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (reach(m) < a) lo = m; else hi = m; }
    return Math.sign(d) * (a - reach(lo) < reach(hi) - a ? lo : hi);
  };
  const near = (x, y) =>
    nth(band(((x + 0.5) * CELL[0] - ox) * n[0] + ((y + 0.5) * CELL[1] - oy) * n[1] - mid));
  const via = name => (x, y, ...rest) => near(x, y)[name](x, y, ...rest);
  return { near, water: via("water"), cell: via("cell"), flow: via("flow"), away: via("away"), cleared: via("cleared"),
    bridge: (run, before, after) => near(...run[0]).bridge(run, before, after) };
}

// `pieces` is the extracted scene data (scene.js).
// (`biomeScale` brings the second biome that many times nearer or further, for trying it out)
export function makeWorld(pieces, seed, { lady = false, biomeScale = 1, site = null, siteIn = null, shrine = null } = {}) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const world = layout(pieces, seed + attempt * 7919, lady, biomeScale, site, siteIn, shrine);
    if (world) return world;
  }
  throw new Error(`no playable layout for seed ${seed}`);
}

function layout(P, seed, withLady, biomeScale, siteWanted, siteIn, shrineWanted) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = list => list[int(0, list.length - 1)];
  // Whether a cell's open ground (bare(), below) is asked for every cell on screen every frame, so
  // the answers are kept, and forgotten whenever a set they're worked out from gains a cell
  // (and so are a cell's tree, trail and river, see cellMemo(): `memos`)
  const bareKnown = new Map(), linedKnown = new Map(), memos = [];
  const forget = () => { bareKnown.clear(); linedKnown.clear(); for (const m of memos) m.clear(); };
  const taken = new Watched(forget);   // cells something already stands on
  const props = [], ground = [], blocked = new Set();
  const opaque = new Set();        // cells that block sight (besides the forest's trees)

  // Stamp a template with its top-left at (x, y); only its base row blocks walking, and
  // sight (the doorway too: it's dark inside), unless it's `low` enough to see over (a grave).
  const place = (tpl, x, y, { open = [], low = false } = {}) => {
    const cells = tpl.cells.map(([dx, dy, t]) => [x + dx, y + dy, t]);
    for (const [cx, cy] of cells) taken.add(key(cx, cy));
    const feet = y + Math.max(...tpl.base.map(([, dy]) => dy)) + 1;
    const base = tpl.base.map(([dx, dy]) => key(x + dx, y + dy));
    for (const k of base) {
      if (!open.includes(k)) blocked.add(k);
      if (!low) opaque.add(k);
    }
    props.push({ feet, cells, base });
    return cells;
  };
  // the graves laid so far, by their mound's cell, and who lies in each (see GRAVE_NAME)
  const graves = new Map();
  const bury = (x, y) => graves.set(key(x, y), Array.from({ length: GRAVE_NAME }, (_, i) => {
    const vowel = (i + (hash(x, y, seed + 61) < 0.5 ? 0 : 1)) % 2, set = vowel ? VOWELS : CONSONANTS;
    return set[Math.floor(hash(x, y, seed + 62 + i) * set.length)];
  }).join(""));

  // House, with its door; the character starts beside the step out of it.
  const redHouse = rand() < RED_HOUSE;
  const house = pick(redHouse ? P.redHouses : P.houses);
  const hx = 0, hy = 0;
  const door = [hx + house.door[0], hy + house.door[1]];
  place(house, hx, hy, { open: [key(...door)] });
  const doorstep = [door[0], door[1] + 1];
  const spawn = [door[0] + 1, door[1] + 1];

  // The main road's way out (see VEIN), any way at all (in px, y down), and the cave some way
  // off to one side of it (see CAVE_OFF); walking up into its entrance goes underground
  // (cave.js). Distance is in px so it's as far going up/down as going sideways.
  const veinAngle = rand() * 2 * Math.PI;
  const angle = veinAngle + (rand() < 0.5 ? -1 : 1) * (CAVE_OFF[0] + rand() * (CAVE_OFF[1] - CAVE_OFF[0])) * Math.PI / 180;
  const dist = CAVE_DISTANCE[0] + rand() * (CAVE_DISTANCE[1] - CAVE_DISTANCE[0]);
  const entrance = [door[0] + Math.round(dist * Math.cos(angle) / 8),
                    door[1] + Math.round(dist * Math.sin(angle) / 12)];
  // (one of the cave's three entrances, "cave" 402:34559, picked by the seed without a draw of
  // rand(), so the rest of the world's laid out as it was)
  const caveTpl = P.caves[Math.floor(hash(0, 0, seed + 97) * P.caves.length)];
  const cx = entrance[0] - caveTpl.entrance[0], cy = entrance[1] - caveTpl.entrance[1];
  place(caveTpl, cx, cy, { open: [key(...entrance)] });

  // Which biome a cell is in (see BIOMES): its number, 0 the first; and that biome's looks
  const biomeDistance = (px, py) => {
    const sx = px - door[0], sy = (py - door[1]) * CELL[1] / CELL[0];
    const ex = entrance[0] - door[0], ey = (entrance[1] - door[1]) * CELL[1] / CELL[0];
    const t = Math.min(1, Math.max(0, (sx * ex + sy * ey) / (ex * ex + ey * ey)));
    return Math.hypot(sx - t * ex, sy - t * ey) / biomeScale;
  };
  const biomeAt = (px, py) => {
    const d = biomeDistance(px, py);
    const { warp, warpScale, clump, loose } = BIOME_MIX, bulge = warpScale * biomeScale;
    for (let i = BIOMES.length - 1; i > 0; i--) {
      const { from, full } = BIOMES[i], s = seed + 14 + 10 * (i - 1);
      if (d <= from - warp) continue;
      if (d >= full + warp) return i;
      const out = d + (2 * noise(px / bulge, py / bulge, s) - 1) * warp;
      const share = Math.min(1, Math.max(0, (out - from) / (full - from)));
      if (share > loose * hash(px, py, s + 1) + (1 - loose) * noise(px / clump, py / clump, s + 2)) return i;
    }
    return 0;
  };
  // ...and which biome a place counts as being in, for what happens there (the hunters, the dark
  // wood: see game.js), without the mix's ragged edge: past halfway from a biome's `from` to its
  // `full`, give or take ZONE_SLACK cell widths, so it doesn't flicker as the character goes back
  // and forth (crossing in takes the far side of it, going back the near side). `was` is the zone
  // they were in last.
  const zoneAt = (px, py, was = 0) => {
    const d = biomeDistance(px, py);
    for (let i = BIOMES.length - 1; i > 0; i--)
      if (d >= (BIOMES[i].from + BIOMES[i].full) / 2 + (was >= i ? -ZONE_SLACK : ZONE_SLACK)) return i;
    return 0;
  };
  const B = (px, py) => P.biomes[biomeAt(px, py)];
  // Plants a big tree with its trunk's foot on (bx, by): only that blocks walking and sight, and
  // whatever's under the rest of it stays as it is
  const plant = (tpl, bx, by) => {
    const [fx, fy] = tpl.foot, k = key(bx, by);
    taken.add(k); blocked.add(k); opaque.add(k);
    props.push({ feet: by + 1, cells: tpl.cells.map(([dx, dy, t]) => [bx - fx + dx, by - fy + dy, t]), base: [k], canopy: true });
  };
  const bigTree = (r, px, py) => r.pick(B(px, py).bigTrees);

  // The house's and the cave's clearings: ragged ellipses around them
  const hw = Math.max(...house.cells.map(([dx]) => dx)) + 1;
  const ellipse = (ex, ey, [rx, ry], s) => (px, py) => {
    const d = Math.hypot((px - ex) / rx, (py - ey) / ry);
    return d < 1 + CLEARING_WOBBLE * (noise(px / WOBBLE_SCALE, py / WOBBLE_SCALE, s) - 0.5);
  };
  const houseCentre = [hx + Math.floor(hw / 2) + 1, hy + 2];   // whole cells: things land on it
  const inHouseClearing = ellipse(...houseCentre, HOUSE_CLEARING, seed + 1);
  const cw2 = Math.max(...caveTpl.cells.map(([dx]) => dx)) + 1;
  const inCaveClearing = ellipse(cx + cw2 / 2, cy + 3, CAVE_CLEARING, seed + 2);

  // The river (see RIVER_WIDTH), its course any way at all, passing the house on one side or
  // the other, clear of both clearings with a cell or two to spare
  const river = makeRivers(rand() * 2 * Math.PI, (rand() < 0.5 ? -1 : 1) * int(...RIVER_AWAY),
    [(houseCentre[0] + 0.5) * CELL[0], (houseCentre[1] + 0.5) * CELL[1]], seed + 8);
  // ...and the lakes' still water (see SITES), counted as the river's wherever water's asked about
  const lakeWater = new Map();
  for (const [name, own] of [["water", true], ["cell", "water"], ["flow", STILL]]) {
    const was = river[name];
    river[name] = (px, py, ...rest) => (lakeWater.has(key(px, py)) ? own : was(px, py, ...rest));
  }
  // each run of water along a path becomes a bridge
  const bridgeOver = path => {
    for (let i = 0; i < path.length; i++) {
      if (!river.water(...path[i])) continue;
      let j = i;
      while (j + 1 < path.length && river.water(...path[j + 1])) j++;
      river.bridge(path.slice(i, j + 1), path[i - 1], path[j + 1]);
      i = j;
    }
  };
  // The trails (see TRAILS), and the river's water under one bridged
  const trails = Array.from({ length: int(...TRAILS) }, (_, i) =>
    makeTrail(rand() * 2 * Math.PI, (rand() < 0.5 ? -1 : 1) * int(...TRAIL_AWAY),
      [(houseCentre[0] + 0.5) * CELL[0], (houseCentre[1] + 0.5) * CELL[1]], seed + 20 + 3 * i));
  const far = rng(seed + 97), farInt = (lo, hi) => lo + Math.floor(far() * (hi - lo + 1));   // (their own dice, so the rest's laid out as before)
  const nearTrails = trails.length;
  for (let i = farInt(...FAR_TRAILS.count); i > 0; i--)
    trails.push(makeTrail(far() * 2 * Math.PI, (far() < 0.5 ? -1 : 1) * farInt(...FAR_TRAILS.away) * CELL[0] * biomeScale,
      [(houseCentre[0] + 0.5) * CELL[0], (houseCentre[1] + 0.5) * CELL[1]], seed + 90 + 3 * i));
  const trailBrush = trails.map((_, i) => PATH_BRUSH[pathWidth(i < nearTrails ? rand() : far())]);
  const trailCells = new Map();    // cell -> whether it's on a trail, once it's been asked
  const onTrail = (px, py) => {
    const k = key(px, py);
    if (!trailCells.has(k)) trailCells.set(k, trails.some((has, i) => trailBrush[i].some(([ox, oy]) => has(px - ox, py - oy))));
    return trailCells.get(k);
  };
  // The main road out (see VEIN), from where it heads off on its way; it and the trails go over
  // the river's water on a bridge
  const vein = makeVein(veinAngle, [(door[0] + Math.round(VEIN.start * Math.cos(veinAngle) / CELL[0]) + 0.5) * CELL[0],
    (door[1] + 2 + Math.round(VEIN.start * Math.sin(veinAngle) / CELL[1]) + 0.5) * CELL[1]], seed + 60);
  // Where a trail (or the road further out) meets the river it goes over on a bridge, a plain
  // straight one, as a real bridge is (the user's, 2026-10-16): not every cell of water the way
  // happens to touch (a trail along the river's edge was a long staircase of planks), but, only
  // where the way's on both banks (a crossing), straight across the water from bank to bank at the
  // middle of where it's in it, as wide as the trail (1 to 3 cells); and a short way along the bank
  // (BRIDGE_LINK cells at most, through no trees) from each end to the trail, if it doesn't land on it.
  // Where a way only touches the water, it stops at its edge. Worked out a crossing at a time, the
  // first time a cell near it is asked about, the same whichever that is.
  const riverCell = river.cell;
  const wetWay = (px, py) => (onTrail(px, py) || vein.has(px, py)) && riverCell(px, py) === "water";
  const crossingOf = new Map();    // a way's cell in the water -> its crossing ({ bridge, link } sets of cells), or null
  // the way from a crossing's end on the bank to the trail: the shortest over dry ground, its cells into `link`
  const way = (x, y) => onTrail(x, y) || vein.has(x, y);
  const linkUp = (end, link) => {
    if (riverCell(...end) !== null) return;
    const from = new Map([[key(...end), null]]), q = [end];
    let got = null;
    for (let i = 0; i < q.length && !got; i++) {
      const [x, y] = q[i];
      if (way(x, y)) { got = [x, y]; break; }
      if (i && Math.abs(x - end[0]) + Math.abs(y - end[1]) >= BRIDGE_LINK) continue;
      for (const [dx, dy] of DIRS) {
        const n = [x + dx, y + dy], k = key(...n);
        if (!from.has(k) && riverCell(...n) === null) { from.set(k, [x, y]); q.push(n); }
      }
    }
    for (let c = got && from.get(key(...got)); c; c = from.get(key(...c))) link.add(key(...c));
    if (!got) link.add(key(...end));
  };
  const crossingFrom = (x0, y0) => {
    const k0 = key(x0, y0);
    if (crossingOf.has(k0)) return crossingOf.get(k0);
    const wet = [[x0, y0]], seen = new Set([k0]);
    for (let i = 0; i < wet.length && wet.length < 2000; i++)
      for (const [dx, dy] of NEAR2) {   // (two cells apart is still the one crossing)
        const x = wet[i][0] + dx, y = wet[i][1] + dy, k = key(x, y);
        if (!seen.has(k) && wetWay(x, y)) { seen.add(k); wet.push([x, y]); }
      }
    const own = river.near(x0, y0), sides = new Set();
    for (const [x, y] of wet)
      for (const [dx, dy] of DIRS)
        if (riverCell(x + dx, y + dy) === null && (onTrail(x + dx, y + dy) || vein.has(x + dx, y + dy))) sides.add(own.side(x + dx, y + dy));
    // (none where it's crossed already: by the road near home (see bridgeOver()), or in the wild)
    const bridged = wet.some(([x, y]) => NEAR2.some(([dx, dy]) => ["bridge", "sand"].includes(riverCell(x + dx, y + dy))));
    let out = null;
    if (sides.has(1) && sides.has(-1) && !bridged) {
      const mid = [...wet].sort((a, b) => own.along(...a) - own.along(...b) || a[0] - b[0] || a[1] - b[1])[wet.length >> 1];
      // (straight over the water, sideways or up and down: the way that lands on the other bank,
      // the shorter if both do)
      const span = ([dx, dy]) => {
        const ends = [1, -1].map(s => { let i = 1; while (riverCell(mid[0] + s * i * dx, mid[1] + s * i * dy) === "water") i++; return [mid[0] + s * i * dx, mid[1] + s * i * dy, i]; });
        const [sa, sb] = ends.map(([x, y]) => own.side(x, y));
        return { over: sa && sb && sa !== sb, n: ends[0][2] + ends[1][2] - 1 };
      };
      const [sideways, upDown] = [span([1, 0]), span([0, 1])], { down } = river.flow(...mid);
      const flat = sideways.over !== upDown.over ? sideways.over : sideways.n === upDown.n ? down : sideways.n < upDown.n;
      const across = flat ? [1, 0] : [0, 1], along = flat ? [0, 1] : [1, 0];
      const brush = trails.map((has, i) => trailBrush[i]).find((b, i) => b.some(([ox, oy]) => trails[i](mid[0] - ox, mid[1] - oy)));
      const w = brush ? Math.round(Math.sqrt(brush.length)) : 1;
      // each row (or column) of it over the water from bank to bank, then all of them as long as
      // the longest, so its ends are straight (its planks running onto the bank where it's narrower)
      const bridge = new Set(), link = new Set(), ends = [], runs = [];
      const at = c => c[0] * across[0] + c[1] * across[1];   // (how far across)
      for (let o = -((w - 1) >> 1); o <= w >> 1; o++) {
        const c = [mid[0] + o * along[0], mid[1] + o * along[1]];
        if (riverCell(...c) !== "water") continue;
        let a = c, b = c;
        while (riverCell(a[0] - across[0], a[1] - across[1]) === "water") a = [a[0] - across[0], a[1] - across[1]];
        while (riverCell(b[0] + across[0], b[1] + across[1]) === "water") b = [b[0] + across[0], b[1] + across[1]];
        runs.push({ c, lo: at(a), hi: at(b) });
      }
      const lo = Math.min(...runs.map(r => r.lo)), hi = Math.max(...runs.map(r => r.hi));
      for (const { c } of runs) {
        const base = [c[0] - at(c) * across[0], c[1] - at(c) * across[1]], cellAt = t => [base[0] + t * across[0], base[1] + t * across[1]];
        for (let t = lo; t <= hi; t++) if (riverCell(...cellAt(t)) !== "bridge" && riverCell(...cellAt(t)) !== "sand") bridge.add(key(...cellAt(t)));
        ends.push(cellAt(lo - 1), cellAt(hi + 1));
      }
      for (const end of ends) linkUp(end, link);
      out = { bridge, link };
    } else if (sides.has(1) && sides.has(-1) && wet.some(c => onTrail(...c))) {
      // (a trail right by a crossing that's there already, a bridge or a sandbar: over that, its
      // ends' ways to the trail cleared)
      const link = new Set(), done = new Set();
      for (const [x, y] of wet)
        for (const [dx, dy] of NEAR2) {
          const c = river.near(x + dx, y + dy).crossingAt(x + dx, y + dy);
          if (!c || done.has(c)) continue;
          done.add(c);
          for (const end of Object.values(c.ends)) linkUp(end, link);
        }
      out = { bridge: new Set(), link };
    }
    for (const [x, y] of wet) crossingOf.set(key(x, y), out);
    return out;
  };
  // whether a cell's part of a crossing's bridge (a cell of water) or its way to the trail (a dry one
  // by the water): the crossings near it worked out first (a cell's answer kept)
  const bridgeKnown = new Map(), linkKnown = new Map();
  const nearCrossings = (px, py, r, has) => {
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++)
        if (wetWay(px + ox, py + oy) && has(crossingFrom(px + ox, py + oy))) return true;
    return false;
  };
  const bridgeAt = (px, py) => {
    const k = key(px, py);
    if (!bridgeKnown.has(k)) bridgeKnown.set(k, nearCrossings(px, py, 7, c => c?.bridge.has(k)));   // (as far as a bridge's cells can be from the way's in the water)
    return bridgeKnown.get(k);
  };
  const linkAt = (px, py) => {
    const k = key(px, py);
    if (!linkKnown.has(k)) linkKnown.set(k, riverCell(px, py) === null &&
      [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => riverCell(px + dx, py + dy) === "water") &&
      nearCrossings(px, py, 2 + BRIDGE_LINK, c => c?.link.has(k)));
    return linkKnown.get(k);
  };
  // (a dry cell's a bridge's only near the water: its planks onto the bank; kept, being asked of
  // every cell on screen every frame)
  const plankKnown = new Map();
  const plankAt = (px, py) => {
    const k = key(px, py);
    if (!plankKnown.has(k)) {
      let near = false;
      for (let oy = -3; oy <= 3 && !near; oy++)
        for (let ox = -3; ox <= 3 && !near; ox++) near = riverCell(px + ox, py + oy) === "water";
      plankKnown.set(k, near && bridgeAt(px, py));
    }
    return plankKnown.get(k);
  };
  river.cell = cellMemo((px, py) => {
    const c = riverCell(px, py);
    return c === "water" ? (bridgeAt(px, py) ? "bridge" : c) : c === null && plankAt(px, py) ? "bridge" : c;
  });
  memos.push(river.cell);
  for (const [ex, ey, [rx, ry]] of [[...houseCentre, HOUSE_CLEARING], [cx + cw2 / 2, cy + 3, CAVE_CLEARING]])
    for (let py = Math.floor(ey - ry * 1.4); py <= ey + ry * 1.4; py++)
      for (let px = Math.floor(ex - rx * 1.4); px <= ex + rx * 1.4; px++)
        if (river.water(px, py) && Math.hypot((px - ex) / rx, (py - ey) / ry) < 1.4) return null;

  // Roads: the main one out of the door, winding round the house to where it heads off on its
  // way (the rest of it, its first VEIN.near px out laid out here, is the vein's); and the one to
  // the cave forking off it where it's nearest, winding to just below the cave's entrance, then up
  // into it. They keep a cell away from the house and the cave, whichever side they have to go
  // round, and cross the river on a bridge if it's in the way.
  const beside = (px, py) => {
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) if (taken.has(key(px + ox, py + oy))) return true;
    return false;
  };
  const apart = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by);
  const closest = (cells, to) => cells.reduce((b, c) => (apart(c, to) < apart(b, to) ? c : b));
  if (river.water(...vein.start) || beside(...vein.start)) return null;
  const out = roadPath([door[0], door[1] + 2], vein.start, beside, seed + 5, river);
  if (!out) return null;
  const onward = vein.upTo(VEIN.near);
  if (onward.some(([vx, vy]) => beside(vx, vy) || inHouseClearing(vx, vy) || inCaveClearing(vx, vy))) return null;
  const goal = [entrance[0], entrance[1] + 2], fork = closest(onward.filter(c => !river.water(...c)), goal);
  const toCave = roadPath(fork, goal, beside, seed + 13, river);
  if (!toCave) return null;
  const laid = [doorstep, ...out.slice(0, -1), ...toCave.slice(1), [entrance[0], entrance[1] + 1]];
  const road = [doorstep, ...out.slice(0, -1), ...onward, ...toCave.slice(1), [entrance[0], entrance[1] + 1]];
  // (the way from the door to the cave, for the skeletons)
  const wayToCave = [doorstep, ...out.slice(0, -1), ...onward.slice(0, onward.indexOf(fork) + 1), ...toCave.slice(1)];
  const roadSet = new Set(road.map(([rx, ry]) => key(rx, ry)));
  bridgeOver(out);
  bridgeOver(toCave);
  for (const [rx, ry] of laid) {
    if (vein.has(rx, ry)) continue;
    if (!river.water(rx, ry)) ground.push([rx, ry, rand() < ROAD_RAGGED ? B(rx, ry).road.ragged : B(rx, ry).road.normal]);
    taken.add(key(rx, ry));
  }
  taken.add(key(...spawn));

  // Clearings: a strip along the roads (the house's and the cave's are above), the main road's
  // out as far as it goes, worked out as it's asked about
  const corridor = new Watched(forget);
  for (const [rx, ry] of laid)
    for (let oy = -2; oy <= 2; oy++)
      for (let ox = -2; ox <= 2; ox++) {
        const far = Math.abs(ox) === 2 || Math.abs(oy) === 2;
        if (!far || noise((rx + ox) / 2, (ry + oy) / 2, seed + 3) > 0.55) corridor.add(key(rx + ox, ry + oy));
      }
  const veinSides = new Map();
  const inCorridor = (px, py) => {
    const k = key(px, py);
    if (corridor.has(k)) return true;
    let v = veinSides.get(k);
    if (v === undefined) {
      v = false;
      for (let oy = -2; oy <= 2 && !v; oy++)
        for (let ox = -2; ox <= 2 && !v; ox++)
          if (vein.has(px + ox, py + oy)) v = Math.abs(ox) < 2 && Math.abs(oy) < 2 || noise(px / 2, py / 2, seed + 3) > 0.55;
      veinSides.set(k, v);
    }
    return v;
  };
  // safely inside the house clearing (edges wobble, so keep a margin)
  const deepInHouse = (px, py) =>
    Math.hypot((px - houseCentre[0]) / HOUSE_CLEARING[0], (py - houseCentre[1]) / HOUSE_CLEARING[1]) < 0.8;

  // Chest: a free cell a few steps from the house
  let chest = null;
  for (let tries = 0; tries < 200 && !chest; tries++) {
    const c = [int(hx - CHEST_RING[1], hx + hw + CHEST_RING[1]), int(hy - CHEST_RING[1], hy + 2 + CHEST_RING[1])];
    const gap = Math.max(hx - c[0], c[0] - (hx + hw - 1), hy - c[1], c[1] - (hy + 2));
    if (gap < CHEST_RING[0] || gap > CHEST_RING[1] || !deepInHouse(...c)) continue;
    if (taken.has(key(...c)) || roadSet.has(key(c[0], c[1] + 1)) && rand() < 0.5) continue;
    chest = c;
  }
  if (!chest) return null;
  props.push({ feet: chest[1] + 1, cells: [[...chest, P.chest]], base: [key(...chest)] });
  blocked.add(key(...chest));
  taken.add(key(...chest));

  // ...and another by the cave's entrance, a step or two below it and off the road (it holds a torch)
  let caveChest = null;
  for (let tries = 0; tries < 200 && !caveChest; tries++) {
    const c = [int(entrance[0] - CAVE_CHEST[0], entrance[0] + CAVE_CHEST[0]), int(entrance[1] + 1, entrance[1] + CAVE_CHEST[1])];
    if (taken.has(key(...c)) || Math.abs(c[0] - entrance[0]) < 2 || !inCaveClearing(...c)) continue;
    caveChest = c;
  }
  if (!caveChest) return null;
  props.push({ feet: caveChest[1] + 1, cells: [[...caveChest, P.chest]], base: [key(...caveChest)] });
  blocked.add(key(...caveChest));
  taken.add(key(...caveChest));

  // Big trees around the house. Canopies may overhang the road or reach toward the forest,
  // but never cover anything; trunks stand in the clearing with a cell of air around them.
  const near = (px, py) => {
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) if (taken.has(key(px + ox, py + oy))) return true;
    return false;
  };
  const want = int(...BIG_TREES);
  let planted = 0;
  for (let tries = 0; tries < 400 && planted < want; tries++) {
    const tpl = pick(P.biomes[0].bigTrees);
    const w = Math.max(...tpl.cells.map(([dx]) => dx)) + 1;
    const h = Math.max(...tpl.cells.map(([, dy]) => dy)) + 1;
    const tx = int(houseCentre[0] - HOUSE_CLEARING[0], houseCentre[0] + HOUSE_CLEARING[0] - w);
    const ty = int(houseCentre[1] - HOUSE_CLEARING[1], houseCentre[1] + HOUSE_CLEARING[1] - h);
    if (tpl.cells.some(([dx, dy]) => taken.has(key(tx + dx, ty + dy)))) continue;
    if (tpl.base.some(([dx, dy]) => near(tx + dx, ty + dy) || !deepInHouse(tx + dx, ty + dy))) continue;
    place(tpl, tx, ty);
    props.at(-1).canopy = true;    // (seen through where it covers someone, see game.js)
    planted++;
  }
  if (planted < BIG_TREES[0]) return null;

  // Tall grass in a few patches (short random walks), then the odd lone tuft
  const free = (px, py) => !taken.has(key(px, py)) && deepInHouse(px, py);
  const grass = new Set();
  for (let n = int(...GRASS_PATCHES); n > 0; n--) {
    let gx = int(houseCentre[0] - HOUSE_CLEARING[0], houseCentre[0] + HOUSE_CLEARING[0]);
    let gy = int(houseCentre[1] - HOUSE_CLEARING[1], houseCentre[1] + HOUSE_CLEARING[1]);
    for (let size = int(...GRASS_PATCH_SIZE), guard = 0; size > 0 && guard < 40; guard++) {
      if (free(gx, gy) && !grass.has(key(gx, gy))) {
        grass.add(key(gx, gy));
        ground.push([gx, gy, pick(P.biomes[0].cover)]);
        size--;
      }
      const [dx, dy] = pick(DIRS);
      gx += dx; gy += dy;
    }
  }
  for (let py = houseCentre[1] - HOUSE_CLEARING[1]; py <= houseCentre[1] + HOUSE_CLEARING[1]; py++)
    for (let px = houseCentre[0] - HOUSE_CLEARING[0]; px <= houseCentre[0] + HOUSE_CLEARING[0]; px++)
      if (free(px, py) && !grass.has(key(px, py)) && rand() < GRASS_SPARSE) ground.push([px, py, pick(P.biomes[0].sparse)]);

  // Cave floor: the odd clump of pebbles and stones, then pebbles scattered about
  const [ccx, ccy] = [cx + Math.floor(cw2 / 2), cy + 3];
  const [crx, cry] = CAVE_CLEARING;
  const caveFree = (px, py) => !taken.has(key(px, py)) && inCaveClearing(px, py);
  const stones = new Set();
  for (let n = int(...STONE_PATCHES); n > 0; n--) {
    let sx = int(ccx - crx, ccx + crx), sy = int(ccy - cry, ccy + cry);
    for (let size = int(...STONE_PATCH_SIZE), guard = 0; size > 0 && guard < 40; guard++) {
      if (caveFree(sx, sy) && !stones.has(key(sx, sy))) {
        stones.add(key(sx, sy));
        ground.push([sx, sy, rand() < 0.5 ? P.stones : P.pebbles]);
        size--;
      }
      const [dx, dy] = pick(DIRS);
      sx += dx; sy += dy;
    }
  }
  for (let py = ccy - cry - 1; py <= ccy + cry + 1; py++)
    for (let px = ccx - crx - 1; px <= ccx + crx + 1; px++)
      if (caveFree(px, py) && !stones.has(key(px, py)) && rand() < PEBBLES_SPARSE) ground.push([px, py, P.pebbles]);

  // Clearings hidden in the forest (see PATCHES)
  const patchCells = new Watched(forget), patches = [];
  const clear = (px, py) => {      // nothing else is on or right by this cell
    for (let oy = -PATCH_AWAY; oy <= PATCH_AWAY; oy++)
      for (let ox = -PATCH_AWAY; ox <= PATCH_AWAY; ox++) {
        const qx = px + ox, qy = py + oy, k = key(qx, qy);
        if (taken.has(k) || inCorridor(qx, qy) || patchCells.has(k) || inHouseClearing(qx, qy) || inCaveClearing(qx, qy) ||
            river.water(qx, qy) || river.cleared(qx, qy)) return false;
      }
    return true;
  };
  const sizes = Object.keys(PATCH_SIZES);
  const sizeWeights = sizes.reduce((a, s) => a + PATCH_SIZES[s].weight, 0);
  // a patch's size, whether it has a shed (and a red one), and whether the lady's there
  const wish = r => {
    let w = r.rand() * sizeWeights;
    const name = sizes.find(s => (w -= PATCH_SIZES[s].weight) < 0) || sizes[0];
    const grove = r.rand() < GROVES;
    return { name: grove ? "grove" : name, grove, shed: !grove && r.rand() < SHED_CHANCE, red: r.rand() < RED_SHED, ghost: r.rand() < GHOST_CHANCE };
  };
  // Lays out a patch as wished, rolling its own dice (r: rand, int, pick), its middle where
  // at(its radius) says, if every cell of it is ok(x, y); the patch, or null
  const layPatch = ({ name, grove, shed: withShed, red, ghost }, r, at, ok) => {
    const size = PATCH_SIZES[name];
    const rw = r.int(...size.radius[0]), rh = r.int(...size.radius[1]);
    const [px0, py0] = at(rw, rh);
    const cells = [];
    for (let dy = -rh; dy <= rh; dy++) {
      const half = rw * Math.sqrt(1 - (dy / (rh + 0.5)) ** 2);
      for (let dx = Math.round(-half) + r.int(-1, 1); dx <= Math.round(half) + r.int(-1, 1); dx++) cells.push([px0 + dx, py0 + dy]);
    }
    if (!cells.every(c => ok(...c))) return null;
    const inPatch = new Set(cells.map(c => key(...c)));
    // the shed, if there is one, a little up and left of the middle, with a cell of the patch
    // all round it; its bottom-left cell is the patch's heart (what's seen first), or the
    // middle without one
    const shed = withShed ? r.pick(red ? P.redSheds : P.sheds) : null;
    let heart = [px0, py0], bare = new Set([key(px0, py0)]), [tx, ty] = heart, door = null;
    if (shed) {
      const sw = Math.max(...shed.cells.map(([dx]) => dx)) + 1, sh = Math.max(...shed.cells.map(([, dy]) => dy)) + 1;
      const sx = px0 - sw + r.int(0, 1), sy = py0 - sh + r.int(0, 1);
      const around = [];
      for (let oy = -1; oy <= sh; oy++)
        for (let ox = -1; ox <= sw; ox++) around.push([sx + ox, sy + oy]);
      if (!around.every(c => inPatch.has(key(...c)))) return null;
      place(shed, sx, sy);
      heart = [sx, sy + sh - 1];
      door = [sx + sw - 1, sy + sh - 1];   // its bottom-right cell, marked with an arrow (see makeShed)
      bare = new Set(around.map(c => key(...c)).filter(k => !taken.has(k)));
      [tx, ty] = [sx + sw, sy + sh];
    }
    for (const c of cells) patchCells.add(key(...c));
    // a grove's big trees (see GROVES), each foot on its grass with grass all round it
    if (grove) {
      const feet = [];
      for (let n = r.int(...GROVE_TREES), tries = 0; n > 0 && tries < 80; tries++) {
        const [gx, gy] = r.pick(cells);
        if ((gx === px0 && gy === py0) || feet.some(([fx, fy]) => Math.max(Math.abs(fx - gx), Math.abs(fy - gy)) < GROVE_APART)) continue;
        let room = true;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) if (!inPatch.has(key(gx + ox, gy + oy)) || taken.has(key(gx + ox, gy + oy))) room = false;
        if (!room) continue;
        plant(bigTree(r, gx, gy), gx, gy);
        feet.push([gx, gy]);
        n--;
      }
    }
    // and a short trail of bare ground wandering off
    for (let steps = r.int(...size.trail); steps > 0; steps--) {
      const [dx, dy] = r.pick(DIRS);
      if (!inPatch.has(key(tx + dx, ty + dy)) || taken.has(key(tx + dx, ty + dy))) continue;
      tx += dx; ty += dy;
      bare.add(key(tx, ty));
    }
    for (const [cx, cy] of cells) {
      const k = key(cx, cy);
      if (taken.has(k)) continue;
      if (!bare.has(k)) ground.push([cx, cy, r.pick(B(cx, cy).cover)]);
      else if (r.rand() < PATCH_PEBBLES) ground.push([cx, cy, P.patchPebbles]);
    }
    // the lady, now and then, on the grass at its edge; she stands in the way like a prop
    let lady = null;
    if (ghost) {
      const spots = cells.filter(([cx, cy]) => !taken.has(key(cx, cy)) && !bare.has(key(cx, cy)) &&
        DIRS.some(([dx, dy]) => !inPatch.has(key(cx + dx, cy + dy))));
      if (spots.length) {
        lady = r.pick(spots);
        blocked.add(key(...lady));
        taken.add(key(...lady));
      }
    }
    return { size: name, grove: !!grove, cells, heart, shed: !!shed, red: !!shed && red, door, lady };
  };

  // Near the road: each wanted patch settled up front, biggest first, so one that's harder to
  // fit is tried again rather than swapped for an easier one. Its edge is PATCH_REACH from the
  // road: its middle that much further out, in px so it's as far across as up and down.
  const dice = { rand, int, pick };
  const wanted = Array.from({ length: int(...PATCHES) }, () => wish(dice))
    .sort((a, b) => sizes.indexOf(b.name) - sizes.indexOf(a.name));
  for (let tries = 0; wanted.length && tries < 1500; tries++) {
    const [rx0, ry0] = pick(road), a = rand() * 2 * Math.PI;
    const d = PATCH_REACH[0] + rand() * (PATCH_REACH[1] - PATCH_REACH[0]);
    const p = layPatch(wanted[0], dice, (rw, rh) =>
      [rx0 + Math.round((d + rw) * Math.cos(a)), ry0 + Math.round((d * 8 / 12 + rh) * Math.sin(a))], clear);
    if (!p) continue;
    patches.push(p);
    wanted.shift();
  }

  // Pathways (see PATHWAY_FORK): the cheapest winding way from a road cell, or a clearing's
  // edge, to the nearest cell of a clearing, around anything standing and other clearings
  const pathway = new Watched(forget);
  const middle = p => p.cells[p.cells.length >> 1];
  const lay = (from, to, ends) => {
    const own = new Set(ends.flatMap(p => p.cells.map(c => key(...c))));
    const stop = (px, py) => {
      const k = key(px, py);
      return !own.has(k) && (taken.has(k) || patchCells.has(k));
    };
    const path = roadPath(from, to, stop, seed + 6 + pathway.size, river);
    if (!path) return false;
    bridgeOver(path);
    for (const [px, py] of path) {
      const k = key(px, py);
      if (taken.has(k) || patchCells.has(k) || pathway.has(k) || vein.has(px, py)) continue;
      pathway.add(k);
      if (!river.water(px, py)) ground.push([px, py, pick(B(px, py).pathway)]);
    }
    // ...and as wide as it is (see PATH_WIDTHS), over the forest only: it narrows to cross water
    const brush = PATH_BRUSH[pathWidth(rand())];
    for (const [px, py] of path)
      for (const [ox, oy] of brush) {
        const bx = px + ox, by = py + oy, k = key(bx, by);
        if (taken.has(k) || patchCells.has(k) || pathway.has(k) || inCorridor(bx, by) || stop(bx, by) || inHouseClearing(bx, by) ||
          inCaveClearing(bx, by) || river.water(bx, by)) continue;
        pathway.add(k);
        ground.push([bx, by, pick(B(bx, by).pathway)]);
      }
    return true;
  };
  const dryRoad = road.filter(c => !river.water(...c));
  for (const p of patches) {
    if (rand() >= PATHWAY_FORK) continue;
    const from = closest(dryRoad, middle(p));
    p.fork = lay(from, closest(p.cells, from), [p]);
  }
  for (const p of patches) {
    const others = patches.filter(q => q !== p && !(q.links || []).includes(p));
    if (!others.length || rand() >= PATHWAY_LINK) continue;
    const q = others.reduce((b, o) => (apart(middle(o), middle(p)) < apart(middle(b), middle(p)) ? o : b));
    const from = closest(p.cells, middle(q));
    if (apart(from, middle(q)) > PATHWAY_LINK_REACH) continue;
    if (lay(from, closest(q.cells, from), [p, q])) (p.links ||= []).push(q);
  }

  // The towers (see TOWERS): each tried here and there until it has room. One goes up with its
  // top left cell at tx, ty if every cell of it and round it is `ok` and something to lead its
  // pathway to is near enough; whether it did.
  const towers = [];             // { x, y (its top left cell), w, h }
  const caves = [];              // the caves out in the forest (see WILD_CAVE): { x, y, w, h, door (its entrance) }
  // (a wild cave (see WILD_CAVE) goes the same way, into `into`: its entrance is its door, and stays open)
  const layTower = (tpl, tx, ty, ok, into = towers) => {
    const door = tpl.door ?? tpl.entrance;
    const w = Math.max(...tpl.cells.map(([dx]) => dx)) + 1, h = Math.max(...tpl.cells.map(([, dy]) => dy)) + 1;
    const around = [];
    for (let oy = -1; oy <= h; oy++)
      for (let ox = -1; ox <= w; ox++) around.push([tx + ox, ty + oy]);
    if (!around.every(([px, py]) => ok(px, py) && clear(px, py) && !pathway.has(key(px, py)) && !onTrail(px, py))) return false;
    // the nearest trail, pathway or clearing to the foot of it (below its door), ring by ring outward
    const foot = [tx + door[0], ty + h], leadsTo = (px, py) => onTrail(px, py) || pathway.has(key(px, py)) || patchCells.has(key(px, py));
    let to = null;
    for (let r = 2; r <= TOWER_PATH_REACH && !to; r++)
      for (let ox = -r; ox <= r && !to; ox++)
        for (const oy of [r - Math.abs(ox), Math.abs(ox) - r])
          if (leadsTo(foot[0] + ox, foot[1] + oy) && !river.water(foot[0] + ox, foot[1] + oy)) { to = [foot[0] + ox, foot[1] + oy]; break; }
    if (!to) return false;
    place(tpl, tx, ty, { open: tpl.entrance ? [key(tx + door[0], ty + door[1])] : [] });
    into.push({ x: tx, y: ty, w, h, door: [tx + door[0], ty + door[1]] });
    lay(foot, to, patches.filter(p => p.cells.some(([px, py]) => px === to[0] && py === to[1])));
    for (const c of around) taken.add(key(...c));
    return true;
  };
  for (let n = int(...TOWERS), tries = 0; n > 0 && tries < 400; tries++) {
    const a = rand() * 2 * Math.PI, d = TOWERS_AWAY[0] + rand() * (TOWERS_AWAY[1] - TOWERS_AWAY[0]);
    if (layTower(pick(P.towers), spawn[0] + Math.round(d * Math.cos(a)), spawn[1] + Math.round(d * 8 / 12 * Math.sin(a)), () => true)) n--;
  }

  // Forest everywhere else. Each cell's tree is picked by hashing its position.
  const cumulativeOf = weights => {
    const total = weights.reduce((a, b) => a + b, 0);
    let sum = 0;
    return weights.map(w => (sum += w) / total);
  };
  const cumulative = BIOMES.map(b => cumulativeOf(b.trees));
  // open ground already, whatever the forest or a trail would have there
  const bare = (px, py) => {
    const k = key(px, py);
    let b = bareKnown.get(k);
    if (b === undefined) bareKnown.set(k, b = taken.has(k) || inCorridor(px, py) || patchCells.has(k) || pathway.has(k) ||
      inHouseClearing(px, py) || inCaveClearing(px, py) || river.water(px, py) || river.cleared(px, py));
    return b;
  };
  // A trail's tile on a cell, by hashing its position (see TRAIL_TILES), or null off the trails
  // (but for what's scattered on the ground of a biome that has that, see BIOMES) and wherever
  // the ground's bare already
  const trailWeights = Object.values(TRAIL_TILES).reduce((a, b) => a + b, 0);
  // (the main road's own tile, see VEIN, on its cells, the biome's road tile, ragged ROAD_RAGGED of the time)
  const trailTiles = { dirt: [P.pebbles], rock: [P.stones] };
  const scatterWeights = BIOMES.map(b => b.scatter && b.scatter.dirt / (b.scatter.dirt + b.scatter.grass));
  const trailAt = cellMemo((px, py) => {
    if (vein.has(px, py)) return B(px, py).road[hash(px, py, seed + 18) < ROAD_RAGGED ? "ragged" : "normal"];
    if (bare(px, py)) return null;
    if (!onTrail(px, py) && !linkAt(px, py)) {        // (an empty cell of a biome that has its ground scattered, see BIOMES: only ever asked where there's no tree)
      const b = biomeAt(px, py), sc = BIOMES[b].scatter;
      if (!sc || hash(px, py, seed + 21) >= sc.share) return null;
      const tiles = hash(px, py, seed + 22) < scatterWeights[b] ? P.biomes[b].pathway : P.biomes[b].sparse;
      return tiles[Math.floor(hash(px, py, seed + 23) * tiles.length)];
    }
    let w = hash(px, py, seed + 11) * trailWeights;
    const kind = Object.keys(TRAIL_TILES).find(t => (w -= TRAIL_TILES[t]) < 0) || "pathway";
    const tiles = trailTiles[kind] ?? (kind === "grass" ? B(px, py).cover : B(px, py).pathway);
    return tiles[Math.floor(hash(px, py, seed + 12) * tiles.length)];
  });
  memos.push(trailAt);
  // whether a cell's within `lined` cells of a way (see BIOMES), worked out once a cell (till the ways change)
  const lined = (px, py, n) => {
    const k = key(px, py);
    if (!linedKnown.has(k)) {
      let near = false;
      for (let oy = -n; oy <= n && !near; oy++)
        for (let ox = -n; ox <= n && !near; ox++)
          near = (ox || oy) && (onTrail(px + ox, py + oy) || vein.has(px + ox, py + oy) || pathway.has(key(px + ox, py + oy)));
      linedKnown.set(k, near);
    }
    return linedKnown.get(k);
  };
  const treeAt = cellMemo((px, py) => {
    if (bare(px, py) || onTrail(px, py) || linkAt(px, py) || river.cell(px, py) === "bridge") return null;
    const r = hash(px, py, seed + 4), b = biomeAt(px, py), trees = P.biomes[b].trees, B_ = BIOMES[b];
    if (hash(px, py, seed + 19) < (B_.lined && lined(px, py, B_.lined) ? B_.linedGaps : B_.gaps)) return null;
    const i = cumulative[b].findIndex(c => r < c);
    return trees[i < 0 ? trees.length - 1 : i];
  });
  memos.push(treeAt);

  // The lady, if she's out here: on open ground in the house's clearing with the forest right
  // beside her, some way from the start. She stands in the way like a prop.
  let lady = null;
  if (withLady) {
    const spots = [];
    for (let py = houseCentre[1] - HOUSE_CLEARING[1]; py <= houseCentre[1] + HOUSE_CLEARING[1]; py++)
      for (let px = houseCentre[0] - HOUSE_CLEARING[0]; px <= houseCentre[0] + HOUSE_CLEARING[0]; px++)
        if (!taken.has(key(px, py)) && !blocked.has(key(px, py)) && treeAt(px, py) === null &&
            DIRS.some(([dx, dy]) => treeAt(px + dx, py + dy) !== null) &&
            Math.abs(px - spawn[0]) + Math.abs(py - spawn[1]) >= LADY_AWAY) spots.push([px, py]);
    if (!spots.length) return null;
    lady = pick(spots);
    blocked.add(key(...lady));
  }

  // Everything that matters must be reachable on foot from the start
  const walkable = (px, py) => !blocked.has(key(px, py)) && treeAt(px, py) === null && river.cell(px, py) !== "water";
  const seen = new Set([key(...spawn)]), queue = [spawn];
  while (queue.length && seen.size < 20000) {
    const [px, py] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const k = key(px + dx, py + dy);
      if (!seen.has(k) && walkable(px + dx, py + dy)) { seen.add(k); queue.push([px + dx, py + dy]); }
    }
  }
  const reach = ([px, py]) => DIRS.some(([dx, dy]) => seen.has(key(px + dx, py + dy)));
  if (!reach(door) || !reach(chest) || !reach(caveChest) || !reach(entrance)) return null;

  // The demon and the ents: as far across as up and down, moved further out if one lands on
  // something (or another)
  const farOff = away => {
    const a = rand() * 2 * Math.PI;
    let at = [spawn[0] + Math.round(away * Math.cos(a)), spawn[1] + Math.round(away * 8 / 12 * Math.sin(a))];
    for (;;) {                     // out of the river across it, off anything else sideways
      if (river.water(...at)) at = river.away(...at, 1);
      else if (blocked.has(key(...at)) || taken.has(key(...at))) at[0] += Math.sign(Math.cos(a)) || 1;
      else break;
    }
    taken.add(key(...at));         // no tree on its cell, and no clearing laid on it later
    return at;
  };
  const demon = farOff(DEMON_AWAY);
  const ents = Array.from({ length: ENTS }, () => farOff(ENTS_AWAY[0] + rand() * (ENTS_AWAY[1] - ENTS_AWAY[0])));
  const lumberjacks = Array.from({ length: int(...LUMBERJACKS) }, () =>
    farOff(LUMBERJACKS_AWAY[0] + rand() * (LUMBERJACKS_AWAY[1] - LUMBERJACKS_AWAY[0])));

  // (the road always has open ground a cell either side of it, so the second one has room)
  const [sx, sy] = wayToCave[Math.round(SKELETONS_AT * (wayToCave.length - 1))];
  const skeletons = [[sx, sy], blocked.has(key(sx + 1, sy)) ? [sx - 1, sy] : [sx + 1, sy]];

  // The forest's patches beyond (see WILD_CHUNK): every chunk touching x0..x1, y0..y1 (cells)
  // is laid out if it hasn't been yet, clear of everything above and of pathways, then maybe a
  // tower, and then its slimes (see SLIME_CHUNK) and ent or lumberjack (see WILD_ENT), from dice of their own. How many patches
  // and towers that added.
  const chunks = new Set(), spawns = [], spawned = new Set();
  const slimeSpot = (px, py) => {
    const k = key(px, py);
    return !blocked.has(k) && !spawned.has(k) && !sanctuary.has(k) && !quiet.has(k) && k !== key(...door) && k !== key(...doorstep) && treeAt(px, py) === null &&
      river.cell(px, py) === null && Math.hypot((px - spawn[0]) * CELL[0], (py - spawn[1]) * CELL[1]) / CELL[0] >= SLIME_AWAY;
  };
  const chests = [];               // the chests out in the forest (see WILD_CHEST), each [x, y]
  const sanctuary = new Set();     // a church's clearing (see SITES): no monster's ever there
  let lakeHomeLaid = false;       // the first lake's laid out: a lumberjack's home (see SITES' lake)
  const quiet = new Set();         // a fairy ring's opening (see SITES): nothing's put there, so the ring stands out
  const layChunk = (cx, cy) => {
    const [cw, ch] = WILD_CHUNK;
    const s0 = rng(Math.floor(hash(cx, cy, seed + 9) * 4294967296));
    const sint = (lo, hi) => lo + Math.floor(s0() * (hi - lo + 1));
    for (let n = s0() < SLIME_CHUNK ? sint(...SLIMES) : 0; n > 0; n--)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + sint(0, cw - 1), cy * ch + sint(0, ch - 1)];
        if (!slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: biomeAt(...at) >= 2 ? weighed(FOREST3, s0()) : s0() < HORNED_SLIME ? "hornedSlime" : "slime", at });
        break;
      }
    // ...and its kobolds, in the second biome (see KOBOLDS)
    const k0 = rng(Math.floor(hash(cx, cy, seed + 31) * 4294967296));
    for (let n = k0() < KOBOLD_CHUNK ? KOBOLDS[0] + Math.floor(k0() * (KOBOLDS[1] - KOBOLDS[0] + 1)) : 0; n > 0; n--)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + Math.floor(k0() * cw), cy * ch + Math.floor(k0() * ch)];
        if (biomeAt(...at) !== 1 || !slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: k0() < KOBOLD_DUELIST ? "koboldDuelist" : "kobold", at });
        break;
      }
    // ...and its fuzhu, if it has one (see FUZHU_CHUNK)
    const f0 = rng(Math.floor(hash(cx, cy, seed + 47) * 4294967296));
    if (f0() < FUZHU_CHUNK && Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > FUZHU_AWAY)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + Math.floor(f0() * cw), cy * ch + Math.floor(f0() * ch)];
        if (biomeAt(...at) > 1 || !slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: "fuzhu", at });
        break;
      }
    // ...and its bandits, in the first biome (see WILD_BANDIT)
    const b0 = rng(Math.floor(hash(cx, cy, seed + 53) * 4294967296));
    const banditsAway = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > BANDIT_AWAY;
    for (let n = b0() < WILD_BANDIT && banditsAway ? WILD_BANDITS[0] + Math.floor(b0() * (WILD_BANDITS[1] - WILD_BANDITS[0] + 1)) : 0; n > 0; n--)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + Math.floor(b0() * cw), cy * ch + Math.floor(b0() * ch)];
        if (biomeAt(...at) !== 0 || !slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: "bandit", at });
        break;
      }
    // ...and its lone graves (see WILD_GRAVE)
    const g0 = rng(Math.floor(hash(cx, cy, seed + 59) * 4294967296));
    const gravesAway = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > GRAVE_AWAY;
    for (let n = g0() < WILD_GRAVE && gravesAway ? WILD_GRAVES[0] + Math.floor(g0() * (WILD_GRAVES[1] - WILD_GRAVES[0] + 1)) : 0; n > 0; n--)
      for (let tries = 0; tries < 30; tries++) {
        const [x, y] = [cx * cw + Math.floor(g0() * cw), cy * ch + Math.floor(g0() * ch)], G = B(x, y).graves ?? P.graves;
        if (![[x, y], [x, y + 1]].every(c => slimeSpot(...c) && wildClear(...c))) continue;   // (off the road, its pathways and clearings)
        if (g0() >= GRAVE_SHARE[biomeAt(x, y)]) break;   // (fewer in the first two biomes)
        if (g0() < GRAVE_BARE) place({ cells: [[0, 0, G.mound]], base: [[0, 0]] }, x, y + 1, { low: true });
        else place({ cells: [[0, 0, G.crosses[Math.floor(g0() * G.crosses.length)]], [0, 1, G.mound]], base: [[0, 1]] }, x, y, { low: true });
        bury(x, y + 1);
        break;
      }
    // ...and its golem, if it has one (see GOLEM_CHUNK)
    if (k0() < GOLEM_CHUNK && Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > GOLEM_AWAY)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + Math.floor(k0() * cw), cy * ch + Math.floor(k0() * ch)];
        if (biomeAt(...at) !== 1 || !slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: "golem", at });
        break;
      }
    // ...and its lich, if it has one (see LICH_CHUNK)
    const l0 = rng(Math.floor(hash(cx, cy, seed + 61) * 4294967296));
    if (l0() < LICH_CHUNK)
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + Math.floor(l0() * cw), cy * ch + Math.floor(l0() * ch)];
        if (biomeAt(...at) < 2 || !slimeSpot(...at)) continue;
        spawned.add(key(...at));
        spawns.push({ kind: "lich", at });
        break;
      }
    // ...and its ent or lumberjack (see WILD_ENT), on a cell that's kept clear of trees for it
    const away = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]);
    for (const [kind, chance, far] of [["ent", WILD_ENT, ENTS_AWAY[1]], ["lumberjack", WILD_LUMBERJACK, LUMBERJACKS_AWAY[1]]]) {
      if (s0() >= chance || away <= far) continue;
      for (let tries = 0; tries < 30; tries++) {
        const at = [cx * cw + sint(0, cw - 1), cy * ch + sint(0, ch - 1)], k = key(...at);
        if (kind === "ent" && biomeAt(...at) >= 2) continue;   // (no ents in the third biome or past it)
        if (blocked.has(k) || taken.has(k) || spawned.has(k) || sanctuary.has(k) || quiet.has(k) || river.cell(...at) !== null) continue;
        spawned.add(k);
        taken.add(k);
        spawns.push({ kind, at });
        break;
      }
    }
    // ...and its chest (see WILD_CHEST); whether it has one
    if (s0() >= WILD_CHEST || away <= CHEST_AWAY) return false;
    const openAt = (px, py) => !blocked.has(key(px, py)) && treeAt(px, py) === null && river.cell(px, py) === null;
    for (let tries = 0; tries < 60; tries++) {
      const at = [cx * cw + sint(0, cw - 1), cy * ch + sint(0, ch - 1)], k = key(...at);
      if (treeAt(...at) === null || spawned.has(k) || !DIRS.some(([dx, dy]) => openAt(at[0] + dx, at[1] + dy))) continue;
      props.push({ feet: at[1] + 1, cells: [[...at, P.chest]], base: [k] });
      blocked.add(k);
      taken.add(k);
      spawned.add(k);
      chests.push(at);
      return true;
    }
    return false;
  };
  // ...and its big tree (see BIG_TREE_CHUNK), from dice of its own: its foot where there's
  // forest all round, and nothing standing under the rest of it; whether it has one
  const layBigTree = (cx, cy) => {
    const [cw, ch] = WILD_CHUNK;
    const r0 = rng(Math.floor(hash(cx, cy, seed + 17) * 4294967296));
    const r = { rand: r0, int: (lo, hi) => lo + Math.floor(r0() * (hi - lo + 1)) };
    r.pick = list => list[r.int(0, list.length - 1)];
    if (r.rand() >= BIG_TREE_CHUNK) return false;
    for (let tries = 0; tries < 20; tries++) {
      const bx = cx * cw + r.int(1, cw - 2), by = cy * ch + r.int(1, ch - 2), tpl = bigTree(r, bx, by), [fx, fy] = tpl.foot;
      let room = !spawned.has(key(bx, by));
      for (let oy = -1; oy <= 1 && room; oy++)
        for (let ox = -1; ox <= 1; ox++) if (treeAt(bx + ox, by + oy) === null) room = false;
      if (!room || tpl.cells.some(([dx, dy]) => taken.has(key(bx - fx + dx, by - fy + dy)))) continue;
      plant(tpl, bx, by);
      return true;
    }
    return false;
  };
  const wildClear = (px, py) => clear(px, py) && !pathway.has(key(px, py));
  // A rare site (see SITES) of `kind` in chunk cx, cy, rolling its own dice (r); the patch it
  // makes, or null if it doesn't fit
  // (the graveyard's grass is forest-1's muted green, so only there; the fairy ring's own grass,
  // forest-1's sparse tufts, is the biome's own sparse tufts elsewhere)
  const siteGrass = (x, y) => [...B(x, y).cover, ...(biomeAt(x, y) === 0 ? P.graveGrass : [])];
  const ringGrass = (t, x, y) => B(x, y).sparse[P.biomes[0].sparse.indexOf(t)] ?? t;
  const laySite = (kind, r, cx, cy) => {
    const [cw, ch] = WILD_CHUNK, R = SITES[kind].radius;
    const [rw, rh] = Array.isArray(R[0]) ? [r.int(...R[0]), r.int(...R[1])] : R;
    const [left, top] = [cx * cw + SITE_MARGIN, cy * ch + SITE_MARGIN];
    const [right, bottom] = [(cx + 1) * cw - 1 - SITE_MARGIN, (cy + 1) * ch - 1 - SITE_MARGIN];
    const px0 = r.int(left + rw + 1, right - rw - 1), py0 = r.int(top + rh, bottom - rh);
    const cells = [];
    for (let dy = -rh; dy <= rh; dy++) {
      const half = rw - Math.max(0, Math.abs(dy) - rh + 2);   // (the corners cut away)
      for (let dx = -half - r.int(0, 1); dx <= half + r.int(0, 1); dx++) cells.push([px0 + dx, py0 + dy]);
    }
    if (!cells.every(([px, py]) => px >= left && px <= right && py >= top && py <= bottom && wildClear(px, py))) return null;
    // (all of it, where two biomes mix: its middle and its corners)
    if (SITES[kind].biomes && ![[px0, py0], [px0 - rw, py0 - rh], [px0 + rw, py0 - rh], [px0 - rw, py0 + rh], [px0 + rw, py0 + rh]]
      .every(c => SITES[kind].biomes.includes(biomeAt(...c)))) return null;
    const inSite = new Set(cells.map(c => key(...c)));
    const keep = new Set();          // cells kept free: the way up to a door
    const fits = (x, y, w, h) => {   // a w by h block at x, y, with a cell of the site all round it
      for (let oy = -1; oy <= h; oy++)
        for (let ox = -1; ox <= w; ox++) {
          const k = key(x + ox, y + oy);
          if (!inSite.has(k) || taken.has(k) || (oy >= 0 && oy < h && ox >= 0 && ox < w && keep.has(k))) return false;
        }
      return true;
    };
    const size = tpl => [Math.max(...tpl.cells.map(([dx]) => dx)) + 1, Math.max(...tpl.cells.map(([, dy]) => dy)) + 1];
    const bare = new Set();          // cells left without grass
    const site = { size: kind, kind, cells, heart: [px0, py0], shed: false, door: null, lady: null };
    // A building (a template with its `door`) somewhere in the site's rows y0..y1, with the two
    // cells under its door kept free, gone into like a shed's (`doors`, with what it is, `room`,
    // for the line said going in); its door, or null if it found no room
    const doors = [];
    const put = (tpl, y0, y1, room = "shed") => {
      const [w, h] = size(tpl);
      for (let tries = 0; tries < 40; tries++) {
        const x = r.int(px0 - rw, px0 + rw - w + 1), y = r.int(y0, y1 - h + 1);
        const d = [x + tpl.door[0], y + tpl.door[1]], under = [key(d[0], d[1] + 1), key(d[0], d[1] + 2)];
        if (!fits(x, y, w, h) || under.some(k => !inSite.has(k) || taken.has(k) || keep.has(k))) continue;
        place(tpl, x, y);
        for (const k of under) keep.add(k);
        doors.push({ door: d, chest: false, room });
        return d;
      }
      return null;
    };
    const open = () => cells.filter(([x, y]) => { const k = key(x, y); return !taken.has(k) && !keep.has(k) && !spawned.has(k); });
    // One of the biome's big trees, its foot at bx, by: none of it over anything standing or a way kept free
    const treeFits = (tpl, bx, by) => {
      const [fx, fy] = tpl.foot;
      return inSite.has(key(bx, by)) && !spawned.has(key(bx, by)) &&
        tpl.cells.every(([dx, dy]) => { const k = key(bx - fx + dx, by - fy + dy); return !taken.has(k) && !keep.has(k); });
    };
    if (kind === "church") {
      const church = r.pick(P.churches), [w, h] = size(church), sx = px0 - (w >> 1), sy = py0 - h + 1;
      if (!fits(sx, sy, w, h)) return null;
      place(church, sx, sy);
      site.heart = [sx, sy + h - 1];
      site.landmark = [sx + church.door[0], sy + church.door[1]];   // its door
      site.church = { door: site.landmark, kind: P.churches.indexOf(church) };
      for (const c of cells) sanctuary.add(key(...c));
      for (let y = sy + h; inSite.has(key(site.landmark[0], y)); y++) {
        bare.add(key(site.landmark[0], y));
        ground.push([site.landmark[0], y, r.pick(B(site.landmark[0], y).pathway)]);
      }
      // the priest, somewhere on the edge of the grass
      const edge = cells.filter(([x, y]) => !taken.has(key(x, y)) && !bare.has(key(x, y)) &&
        DIRS.some(([dx, dy]) => !inSite.has(key(x + dx, y + dy))));
      site.priest = r.pick(edge);
      spawned.add(key(...site.priest));
    } else if (kind === "bandits") {
      // the hall first, in the top half, then each shed now and then (see BANDITS), each with
      // the two cells under its door kept free; then the band, the first nearest the hall's
      // door, and the chests, anywhere else in the open
      const big = Math.min(1, Math.max(0, (rw * rh - BANDITS.small) / (BANDITS.large - BANDITS.small)));
      const [hall, ...sheds] = P.banditBuildings;
      const hallDoor = put(hall, py0 - rh, py0, "hall");
      if (!hallDoor) return null;
      for (const shed of sheds)
        if (r.rand() < BANDITS.shed[0] + (BANDITS.shed[1] - BANDITS.shed[0]) * big) put(shed, py0 - rh, py0 + rh);
      site.doors = doors;
      site.landmark = hallDoor;
      site.heart = hallDoor;
      // (how near: steps from the hall's doorstep, walking round the buildings, so never behind the hall)
      const way = new Map([[key(hallDoor[0], hallDoor[1] + 1), 1]]), queue = [[hallDoor[0], hallDoor[1] + 1]];
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i];
        for (const [dx, dy] of DIRS) {
          const k = key(x + dx, y + dy);
          if (way.has(k) || !inSite.has(k) || blocked.has(k)) continue;
          way.set(k, way.get(key(x, y)) + 1);
          queue.push([x + dx, y + dy]);
        }
      }
      const near = ([x, y]) => way.get(key(x, y)) ?? Infinity;
      const band = `${cx},${cy}`, n = BANDITS.band[0] + Math.round(big * (BANDITS.band[1] - BANDITS.band[0]));
      const spots = open().filter(c => near(c) >= 2 && near(c) < Infinity).sort((a, b) => near(a) - near(b)).slice(0, n * 3);
      if (spots.length < n) return null;
      for (let i = 0; i < n; i++) {
        const at = i ? spots.splice(r.int(0, spots.length - 1), 1)[0] : spots.shift();
        spawned.add(key(...at));
        spawns.push({ kind: "bandit", at, band });
      }
      for (let i = r.int(...BANDITS.chests), free = open(); i > 0 && free.length; i--) {
        const at = free.splice(r.int(0, free.length - 1), 1)[0], k = key(...at);
        props.push({ feet: at[1] + 1, cells: [[...at, P.chest]], base: [k] });
        blocked.add(k);
        taken.add(k);
        chests.push(at);
      }
    } else if (kind === "ring") {
      // the ring round the middle, the altar in its middle (the left of its two cells on the
      // heart), and the rest of the opening bare
      const R = P.fairyRing, [ax, ay] = R.altarAt, rx = px0 - ax, ry = py0 - ay;
      const [w, h] = size(R);
      if (!fits(rx, ry, w, h)) return null;
      place({ cells: R.altar.map((t, i) => [i, 0, t]), base: R.altar.map((t, i) => [i, 0]) }, px0, py0, { low: true });
      site.altar = [[px0, py0], [px0 + 1, py0]];
      site.ring = R.cells.map(([dx, dy]) => [rx + dx, ry + dy]);
      for (const [x, y, t] of R.cells) { bare.add(key(rx + x, ry + y)); ground.push([rx + x, ry + y, ringGrass(t, rx + x, ry + y)]); }
      for (const c of cells) { bare.add(key(...c)); quiet.add(key(...c)); }
    } else if (kind === "village") {
      // the houses (the first the family's home) and maybe the shed, then the big tree where it
      // fits, then the family, nearest the home's door first
      const [first, ...more] = r.int(0, 1) ? P.villageHouses : [...P.villageHouses].reverse();
      const home = put(first, py0 - rh, py0 + rh, "house");
      if (!home) return null;        // (nothing's laid yet; from here on nothing fails, so nothing's left half laid)
      const others = more.slice(0, VILLAGE.houses - 1).map(house => put(house, py0 - rh, py0 + rh, "house")).filter(Boolean);
      if (r.rand() < VILLAGE.shed) { const shed = P.sheds[0], [w, h] = size(shed); put({ ...shed, door: [w - 1, h - 1] }, py0 - rh, py0 + rh); }
      const spots = open();
      for (let tries = 0; tries < 40; tries++) {
        const [bx, by] = r.pick(spots), tpl = bigTree(r, bx, by);
        if (treeFits(tpl, bx, by)) { plant(tpl, bx, by); break; }
      }
      const near = ([x, y]) => Math.abs(x - home[0]) + Math.abs(y - home[1]);
      const around = open().filter(c => near(c) >= 2).sort((a, b) => near(a) - near(b));
      const kids = r.int(...VILLAGE.kids), family = ["villager1", "villager2", ...Array.from({ length: kids }, () => r.pick(["villager3", "villager4"]))];
      site.family = family.slice(0, around.length).map(kind => {
        const at = around.splice(r.int(0, Math.min(3, around.length - 1)), 1)[0];
        spawned.add(key(...at));
        return { kind, at };
      });
      // ...and, `lone` of the time, a lone woman by the second house's door, her own home
      const near2 = others[0] && (([x, y]) => Math.abs(x - others[0][0]) + Math.abs(y - others[0][1]));
      const by2 = near2 && open().filter(c => near2(c) >= 2).sort((a, b) => near2(a) - near2(b));
      if (by2?.length && r.rand() < VILLAGE.lone) {
        const at = by2[r.int(0, Math.min(3, by2.length - 1))];
        spawned.add(key(...at));
        site.family.push({ kind: "villager2", at, lone: true, home: others[0] });
      }
      site.doors = doors;
      site.home = home;
      site.heart = home;
      for (const c of cells) quiet.add(key(...c));
    } else if (kind === "bush") {
      // the tree, its foot a little below the middle, so its canopy's in the opening
      const tpl = r.pick(B(px0, py0).bigTrees), [fx, fy] = tpl.foot, bx = px0, by = py0 + 1;
      if (!treeFits(tpl, bx, by)) return null;
      const all = tpl.cells.map(([dx, dy, t]) => [bx - fx + dx, by - fy + dy, t]);
      const canopy = all.filter(([x, y]) => !(x === bx && y > by - 3));   // (never the foot of its trunk)
      const lit = new Set(canopy.filter(() => r.rand() < BUSH.flames).map(([x, y]) => key(x, y)));
      const top = Math.min(...all.map(([, y]) => y)), tops = all.filter(([, y]) => y === top);
      const above = [];
      for (let n = r.int(...BUSH.above); n > 0 && tops.length; n--) { const [x] = tops.splice(r.int(0, tops.length - 1), 1)[0]; above.push([x, top - 1]); }
      plant({ ...tpl, cells: tpl.cells.filter(([dx, dy]) => !lit.has(key(bx - fx + dx, by - fy + dy))) }, bx, by);
      site.bush = { foot: [bx, by], flames: [...[...lit].map(k => k.split(",").map(Number)), ...above] };
      for (const [x, y] of site.bush.flames) bare.add(key(x, y));
      site.landmark = [bx, by];
      site.heart = [bx, by];
      for (const c of cells) sanctuary.add(key(...c));
    } else if (kind === "remnants") {
      // the racks, a cell of the opening at least between each two, then the blood round them
      // and the splats (by px, as game.js's blood is), the finds, and which of its lines it says
      const free = open().filter(([x, y]) => Math.abs(x - px0) < rw && Math.abs(y - py0) < rh);
      const racks = [];
      for (let n = r.int(...REMNANTS.racks), tries = 0; racks.length < n && tries < 60; tries++) {
        const at = r.pick(free);
        if (racks.some(([x, y]) => Math.abs(x - at[0]) <= 1 && Math.abs(y - at[1]) <= 1)) continue;
        place({ cells: [[0, 0, "rack"]], base: [[0, 0]] }, ...at, { low: true });
        racks.push(at);
      }
      if (racks.length < REMNANTS.racks[0]) return null;
      const blood = [], spill = ([x, y], n, reach) => {
        for (let i = 0; i < n; i++) {
          const a = r.rand() * 2 * Math.PI, d = reach * r.rand();
          blood.push([Math.round((x + 0.5 + Math.cos(a) * d) * CELL[0]), Math.round((y + 0.8 + Math.sin(a) * d * 0.7) * CELL[1]),
            r.int(0, REMNANTS.inks - 1), r.rand() < REMNANTS.big ? 2 : 1]);
        }
      };
      for (const at of racks) spill(at, r.int(...REMNANTS.drops), 1.2);
      for (let n = r.int(...REMNANTS.splats); n > 0; n--) spill(r.pick(free), REMNANTS.splat, 0.9);
      site.racks = racks;
      site.blood = blood.filter(([x, y]) => inSite.has(key(Math.floor(x / CELL[0]), Math.floor(y / CELL[1]))) &&
        !taken.has(key(Math.floor(x / CELL[0]), Math.floor(y / CELL[1]))));
      const left = open();
      site.finds = [];
      for (let n = r.int(...REMNANTS.finds); n > 0 && left.length; n--) site.finds.push(left.splice(r.int(0, left.length - 1), 1)[0]);
      // (the bones on bare ground, so no grass is laid over them, and not taken: they're walked over)
      for (let n = r.int(...REMNANTS.bones); n > 0 && left.length; n--) {
        const [x, y] = left.splice(r.int(0, left.length - 1), 1)[0];
        bare.add(key(x, y));
        ground.push([x, y, r.pick(REMNANTS.boneLooks)]);
      }
      site.line = r.int(0, 2);
      site.heart = [px0, py0];
    } else if (kind === "lake") {
      // the lake (see LAKE): its middle `half` cols in from the site's sides, its top row on the
      // house's base row's, flat under the house; then the house; then maybe someone on the shore
      const half = r.int(...LAKE.half), rows = r.int(...LAKE.rows);
      const house = r.pick(P.lakeHouses), [w, h] = size(house);
      const lcx = r.int(px0 - rw + half + 2, px0 + rw - half - 1);
      const hx = Math.max(px0 - rw + 2, Math.min(px0 + rw - w - 1, lcx - (w >> 1) + r.int(-1, 1))), hy = py0 - rh + 2, by = hy + h - 1;
      if (!fits(hx, hy, w, h) || by + rows > py0 + rh - 1) return null;
      const lcy = by + 1 + rows / 2, s0 = Math.floor(r.rand() * 1e9);
      const ringed = (x, y) => DIRS8.every(([dx, dy]) => inSite.has(key(x + dx, y + dy)));
      const wet = [];
      for (let y = by + 1; y <= by + rows; y++)
        for (let x = lcx - half - 1; x <= lcx + half + 1; x++) {
          const under = y === by + 1 && x >= hx && x < hx + w;
          const d = Math.hypot((x + 0.5 - lcx) / (half + 0.5), (y + 0.5 - lcy) / (rows / 2));
          if ((under || d < 1 + LAKE.wobble * (noise(x / 2.5, y / 2.5, s0) - 0.5)) && ringed(x, y)) wet.push([x, y]);
          else if (under) return null;
        }
      if (wet.some(([x, y]) => DIRS8.some(([dx, dy]) => onTrail(x + dx, y + dy) || vein.has(x + dx, y + dy)))) return null;   // (no trail or road through it: they'd bridge it)
      place(house, hx, hy);
      props.at(-1).reflects = true;    // (it shows in the water below it, see game.js REFLECT)
      for (const [x, y] of wet) { const k = key(x, y); lakeWater.set(k, STILL); taken.add(k); bare.add(k); }
      site.lake = wet;
      site.land = cells.filter(c => !lakeWater.has(key(...c)));
      site.heart = [hx + (w >> 1), by];
      const shore = open().filter(([x, y]) => lakeWater.has(key(x, y + 1)));
      if (!lakeHomeLaid) {           // (the first: a lumberjack's home, its people game.js's, see LAKE_HOME there)
        lakeHomeLaid = true;
        Object.assign(site, { home: true, shore });
      } else if (r.rand() < LAKE.company) {
        const bandits = r.rand() < LAKE.bandits, n = bandits ? r.int(...LAKE.band) : 1, band = `lake ${cx},${cy}`;
        for (let i = 0; i < n && shore.length; i++) {
          const at = shore.splice(r.int(0, shore.length - 1), 1)[0];
          spawned.add(key(...at));
          spawns.push(bandits ? { kind: "bandit", at, band } : { kind: "lumberjack", at, rest: true });
        }
      }
    } else {
      // the graves at the top, a column apart and with a row between each row of them, the shed
      // down to their left, and the band in front of them
      const cols = r.int(...GRAVES[0]), rows = r.int(...GRAVES[1]), gw = 2 * cols - 1, gh = 3 * rows - 1;
      const gx = px0 - 2, gy = py0 - rh + 1;
      const shed = P.graveyardShed, [sw, sh] = size(shed), sx = px0 - rw + 1, sy = gy + gh - sh + 2;
      const fx = gx + (gw >> 1) - 1, fy = gy + gh + 1;
      if (!fits(gx, gy, gw, gh) || !fits(sx, sy, sw, sh) || !fits(fx, fy, 3, 2)) return null;
      place(shed, sx, sy);
      site.doors = [{ door: [sx + shed.door[0], sy + shed.door[1]], chest: true }];
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          const x = gx + 2 * i, y = gy + 3 * j;
          const G = B(x, y).graves ?? P.graves;   // (the third biome's own, see WILD_GRAVE)
          if (r.rand() < GRAVE_BARE) place({ cells: [[0, 0, G.mound]], base: [[0, 0]] }, x, y + 1, { low: true });
          else place({ cells: [[0, 0, r.pick(G.crosses)], [0, 1, G.mound]], base: [[0, 1]] }, x, y, { low: true });
          bury(x, y + 1);
        }
      const band = `${cx},${cy}`;
      for (const [kind, at] of [["skeletonMage", [fx + 1, fy]], ...[0, 1, 2].map(i => ["skeleton", [fx + i, fy + 1]])]) {
        spawned.add(key(...at));
        spawns.push({ kind, at, band });
      }
      site.heart = [fx + 1, fy];
    }
    for (const c of cells) patchCells.add(key(...c));
    for (const [x, y] of cells) {
      const k = key(x, y);
      if (taken.has(k) || bare.has(k)) continue;
      if (kind !== "church" && r.rand() < 0.3) { if (r.rand() < PATCH_PEBBLES) ground.push([x, y, P.patchPebbles]); continue; }
      ground.push([x, y, r.pick(siteGrass(x, y))]);
    }
    return site;
  };
  let siteTried = !siteWanted;       // (see SITE_TRY)
  // (and a shrine of the kind asked for, "?shrine=<kind>": the first chunk past SITE_TRY with room for one)
  let shrineTried = !SHRINE.common.includes(shrineWanted) && !SHRINE.rare.includes(shrineWanted);
  const shrines = [];              // each { x, y, w, h, door (the cell below its middle rock), kind }
  // A pathway forking off the main road to clearing `p`, if its edge is within `reach` cells of
  // it (see VEIN)
  const forkTo = (p, reach) => {
    const from = vein.nearest(...p.heart, reach + 2 * Math.max(...WILD_CHUNK));
    if (!from || river.water(...from)) return;
    const to = closest(p.land ?? p.cells, from);
    if (apart(from, to) <= reach) p.fork = lay(from, to, [p]);
  };
  const extend = (x0, y0, x1, y1) => {
    const [cw, ch] = WILD_CHUNK;
    let grown = 0;
    for (let cy = Math.floor(y0 / ch); cy <= Math.floor(y1 / ch); cy++)
      for (let cx = Math.floor(x0 / cw); cx <= Math.floor(x1 / cw); cx++) {
        const k = key(cx, cy);
        if (chunks.has(k)) continue;
        chunks.add(k);
        const r0 = rng(Math.floor(hash(cx, cy, seed + 7) * 4294967296));
        const r = { rand: r0, int: (lo, hi) => lo + Math.floor(r0() * (hi - lo + 1)) };
        r.pick = list => list[r.int(0, list.length - 1)];
        // a rare site (see SITES), in place of its patch
        const away = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]);
        const roll = r.rand();
        let kind = Object.keys(SITES).find((k, i, ks) =>
          away > SITES[k].away && roll < ks.slice(0, i + 1).reduce((a, q) => a + SITES[q].chance, 0)) ?? null;
        const biome = biomeAt(Math.floor((cx + 0.5) * cw), Math.floor((cy + 0.5) * ch));
        const fits = k => !SITES[k]?.biomes || SITES[k].biomes.includes(biome);
        if (kind && !fits(kind)) kind = null;
        if (!siteTried && away > SITE_TRY && SITES[siteWanted] && fits(siteWanted) && (siteIn === null || biome === siteIn)) kind = siteWanted;
        const site = kind && laySite(kind, r, cx, cy);
        if (site) { patches.push(site); grown++; if (kind === siteWanted) siteTried = true; forkTo(site, VEIN.site); }
        else if (r.rand() < WILD_CHANCE) {
          const [left, top] = [cx * cw + WILD_MARGIN, cy * ch + WILD_MARGIN];
          const [right, bottom] = [(cx + 1) * cw - 1 - WILD_MARGIN, (cy + 1) * ch - 1 - WILD_MARGIN];
          const inside = (px, py) => px >= left && px <= right && py >= top && py <= bottom;
          const p = layPatch(wish(r), r, (rw, rh) =>
            [r.int(left + rw + 1, right - rw - 1), r.int(top + rh, bottom - rh)],
            (px, py) => inside(px, py) && wildClear(px, py));
          if (p) { patches.push(p); grown++; if (r.rand() < PATHWAY_FORK) forkTo(p, VEIN.fork); }
        }
        // ...and now and then a tower (see WILD_TOWER), wherever in the chunk it has room
        const far = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > TOWERS_AWAY[1];
        if (far && r.rand() < WILD_TOWER) {
          const inChunk = (px, py) => px >= cx * cw && px < (cx + 1) * cw && py >= cy * ch && py < (cy + 1) * ch;
          for (let tries = 0; tries < 12; tries++)
            if (layTower(r.pick(P.towers), r.int(cx * cw + 1, (cx + 1) * cw - 3), r.int(cy * ch + 1, (cy + 1) * ch - 6), inChunk)) { grown++; break; }
        }
        // ...and now and then a cave (see WILD_CAVE)
        const out = Math.hypot((cx + 0.5) * cw - spawn[0], ((cy + 0.5) * ch - spawn[1]) * CELL[1] / CELL[0]) > WILD_CAVES_AWAY;
        if (out && r.rand() < WILD_CAVE) {
          const inChunk = (px, py) => px >= cx * cw && px < (cx + 1) * cw && py >= cy * ch && py < (cy + 1) * ch;
          for (let tries = 0; tries < 12; tries++)
            if (layTower(r.pick(P.caves), r.int(cx * cw + 1, (cx + 1) * cw - 8), r.int(cy * ch + 1, (cy + 1) * ch - 6), inChunk, caves)) { grown++; break; }
        }
        // ...and now and then a shrine (see SHRINE)
        const h0 = rng(Math.floor(hash(cx, cy, seed + 71) * 4294967296));
        const tryShrine = !shrineTried && away > SITE_TRY;
        if (tryShrine || (h0() < SHRINE.chance && away > SHRINE.away)) {
          const tier = h0() < SHRINE.rareOdds ? SHRINE.rare : SHRINE.common;
          const kind = tryShrine ? shrineWanted : tier[Math.floor(h0() * tier.length)];
          const inChunk = (px, py) => px >= cx * cw && px < (cx + 1) * cw && py >= cy * ch && py < (cy + 1) * ch;
          for (let tries = 0; tries < 12; tries++) {
            const tx = cx * cw + 1 + Math.floor(h0() * (cw - 4)), ty = cy * ch + 1 + Math.floor(h0() * (ch - 6));
            if (!layTower({ ...P.shrines[kind], door: [1, 2] }, tx, ty, inChunk, shrines)) continue;
            Object.assign(shrines.at(-1), { kind, door: [tx + 1, ty + 3] });
            if (tryShrine) shrineTried = true;
            grown++;
            break;
          }
        }
        if (layChunk(cx, cy)) grown++;
        if (layBigTree(cx, cy)) grown++;
      }
    if (grown) { props.sort((a, b) => a.feet - b.feet); forget(); }   // (whatever was laid, nothing kept from before it)
    return grown;
  };

  props.sort((a, b) => a.feet - b.feet);
  // (`chunks`: how many have been laid out so far)
  return { props, ground, blocked, opaque, treeAt, biomeAt, zoneAt, trailAt, river, vein, door, redHouse, chest, caveChest, entrance, spawn, skeletons, demon, ents, lumberjacks, towers, caves, shrines, chests, sanctuary, lady, patches, spawns, graves, extend,
    chunks: () => chunks.size };
}

// The room inside the house, laid out fresh too: a floor about as big as the mock's (with a
// corner or two sometimes cut away), walled all round, the way out somewhere on the bottom
// wall, a chest against a wall, a table with 2-4 chairs, and shelves against the back wall in
// one of SHELF_LAYOUTS. A red house's (`extra`) has a second chest against a wall, blue
// RED_BLUE of the time (`extra`: { at, blue }).
// When asked for, a lady stands in a corner, at least LADY_AWAY steps from the way in. Chairs
// can be walked over; the table, chest, shelf and lady can't. Coordinates are the room's own.
const ROOM_SIZE = [[8, 11], [4, 6]];   // floor [cols, rows], min..max
const ROOM_NOTCH = 0.5;                // chance of each corner being cut away
const CHAIRS = [2, 4];
// How the shelves stand, one layout picked at random: each is a list of units, left to right,
// by how many shelves wide (so [2, 1] is a double unit with a single one to its right). If a
// layout won't fit, the next one down is tried.
const SHELF_LAYOUTS = [[3], [2, 1], [1, 2], [1, 1], [1]];
const LADY_AWAY = 4;               // also how far from the start she stands outside

export function makeRoom(pieces, seed, { lady = false, extra = false } = {}) {
  const extraChest = extra && (rng(seed + 3)() < RED_BLUE ? pieces.fairyRing.chest : pieces.inside.chest);
  for (let attempt = 0; attempt < 100; attempt++) {
    const room = roomLayout(pieces.inside, seed + 1 + attempt * 7919, lady, extraChest);
    if (room) return room;
  }
  throw new Error(`no playable room for seed ${seed}`);
}

function roomLayout(R, seed, withLady, extraChest) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = list => list[int(0, list.length - 1)];
  const w = int(...ROOM_SIZE[0]), h = int(...ROOM_SIZE[1]);

  // Floor: a rectangle from (1, 1), minus the odd corner notch (1-3 cols, 1 row deep)
  const floor = new Set();
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) floor.add(key(x, y));
  for (const [cx, cy, sx] of [[1, 1, 1], [w, 1, -1], [1, h, 1], [w, h, -1]]) {
    if (rand() >= ROOM_NOTCH) continue;
    for (let i = int(1, 3) - 1; i >= 0; i--) floor.delete(key(cx + sx * i, cy));
  }
  const isFloor = (x, y) => floor.has(key(x, y));

  // Way out: a bottom-wall cell under the floor; the character arrives just above it
  const exits = [];
  for (let x = 1; x <= w; x++)
    for (let y = h; y >= 1; y--) if (isFloor(x, y)) { exits.push([x, y + 1]); break; }
  const exit = pick(exits);
  const player = [exit[0], exit[1] - 1];

  // Walls: every cell around the floor, the way out included
  const walls = new Set();
  for (const k of floor) {
    const [x, y] = k.split(",").map(Number);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) if (!isFloor(x + ox, y + oy)) walls.add(key(x + ox, y + oy));
  }
  const nearWall = (x, y) => DIRS.some(([dx, dy]) => walls.has(key(x + dx, y + dy)));
  const busy = new Set([key(...player), key(exit[0], exit[1] - 2)]);   // keep the entry clear

  // Chest: against a wall
  const spots = [...floor].map(k => k.split(",").map(Number))
    .filter(([x, y]) => nearWall(x, y) && !busy.has(key(x, y)));
  const chest = pick(spots);
  busy.add(key(...chest));
  let extra = null;
  if (extraChest) {
    const more = spots.filter(c => !busy.has(key(...c)));
    if (!more.length) return null;
    extra = { at: pick(more), tile: extraChest, blue: extraChest !== R.chest };
    busy.add(key(...extra.at));
  }

  // Table (two cells side by side) with a cell of floor all round, then chairs beside it
  let table = null;
  for (let tries = 0; tries < 100 && !table; tries++) {
    const t = [int(2, w - 2), int(2, h - 1)];
    let ok = true;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 2; ox++)
        if (!isFloor(t[0] + ox, t[1] + oy) || busy.has(key(t[0] + ox, t[1] + oy))) ok = false;
    if (ok) table = t;
  }
  if (!table) return null;
  const [tx, ty] = table;
  const seats = [[tx - 1, ty], [tx + 2, ty], [tx, ty - 1], [tx + 1, ty - 1], [tx, ty + 1], [tx + 1, ty + 1]];
  const chairs = [];
  for (let n = int(...CHAIRS); n > 0; n--) chairs.push(...seats.splice(int(0, seats.length - 1), 1));

  // Shelves: on floor cells with the wall right behind them (above), clear of everything
  // else. Each unit stands on a run of such cells, right of the one before with a cell to
  // spare between them.
  const taken = new Set([...busy, key(tx, ty), key(tx + 1, ty), ...chairs.map(c => key(...c))]);
  const free = [...floor].map(k => k.split(",").map(Number)).filter(([x, y]) => !taken.has(key(x, y)));
  const backWall = new Set(free.filter(([x, y]) => walls.has(key(x, y - 1))).map(c => key(...c)));
  const fits = (x, y, n) => Array.from({ length: n }, (_, i) => key(x + i, y)).every(k => backWall.has(k));
  const placeUnits = (units, fromX = -Infinity) => {
    if (!units.length) return [];
    const [n, ...rest] = units;
    const starts = [...backWall].map(k => k.split(",").map(Number)).filter(([x, y]) => x >= fromX && fits(x, y, n));
    // try the starting spots in a random order until the rest fit to the right
    for (let i = starts.length; i > 0; i--) {
      const [x, y] = starts.splice(int(0, i - 1), 1)[0];
      const after = placeUnits(rest, x + n + 1);
      if (after) return [...Array.from({ length: n }, (_, j) => [x + j, y]), ...after];
    }
    return null;
  };
  let shelves = null;
  for (let i = int(0, SHELF_LAYOUTS.length - 1); i < SHELF_LAYOUTS.length && !shelves; i++)
    shelves = placeUnits(SHELF_LAYOUTS[i]);
  if (!shelves) return null;
  for (const c of shelves) taken.add(key(...c));

  // The lady, now and then: in a corner (walls on two sides), well away from the way in
  let lady = null;
  if (withLady) {
    const corners = free.filter(([x, y]) => !taken.has(key(x, y)) &&
      DIRS.filter(([dx, dy]) => walls.has(key(x + dx, y + dy))).length >= 2 &&
      Math.abs(x - player[0]) + Math.abs(y - player[1]) >= LADY_AWAY);
    if (!corners.length) return null;
    lady = pick(corners);
  }

  const blocked = [[tx, ty], [tx + 1, ty], chest, ...(extra ? [extra.at] : []), ...shelves, ...(lady ? [lady] : [])];
  const solid = new Set(blocked.map(c => key(...c)));
  const special = new Map([
    [key(tx, ty), R.table[0]], [key(tx + 1, ty), R.table[1]], [key(...chest), R.chest], ...(extra ? [[key(...extra.at), extra.tile]] : []),
    ...shelves.map(c => [key(...c), R.shelf]), ...chairs.map(c => [key(...c), R.chair]),
  ]);

  // Everything must be reachable: every floor cell but the solid ones, and the chest's side
  const seen = new Set([key(...player)]), queue = [player];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (!seen.has(k) && isFloor(x + dx, y + dy) && !solid.has(k)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  if (seen.size !== floor.size - solid.size) return null;
  if (extra && !DIRS.some(([dx, dy]) => seen.has(key(extra.at[0] + dx, extra.at[1] + dy)))) return null;

  const cells = [
    ...[...floor].map(k => [...k.split(",").map(Number), special.get(k) ?? R.floor]),
    ...[...walls].map(k => [...k.split(",").map(Number), k === key(...exit) ? R.exit : R.wall]),
  ];
  // walls (but not the way out) stop the character too
  for (const k of walls) if (k !== key(...exit)) blocked.push(k.split(",").map(Number));
  return { cells, blocked, chest, extra, exit, player, lady };
}

// Inside a shed (walked into by its door, the bottom-right cell with the arrow): a small
// wooden room, floored and walled like the house's, SHED_SIZE [cols, rows] of floor, with the
// way out in its bottom wall. It's kept sparse: SHED_FURNITURE of the time one piece of
// furniture, the table where it fits and a chair or a shelf (against the back wall) where it
// doesn't. SHED_CHEST of the time there's a chest against a wall, and SHED_SLIME of the time a
// slime (`slimeKind`: horned HORNED_SLIME of the time), SHED_SLIME_AWAY or more steps from the way in. What's in it is rolled once, then laid
// out until everything can be reached. A red shed's (`extra`) has a chest more, as the house's does.
const SHED_SIZE = [[3, 5], [2, 3]];
const SHED_FURNITURE = 0.6;
const SHED_CHEST = 0.3;
const SHED_SLIME = 0.3;
const SHED_SLIME_AWAY = 2;

// Inside a church ("inside-church", 289:24212 and 290:25766): laid out as in Figma, the same for
// the wooden one and the stone one but for their tiles (pieces.churchInside[kind]). By cell,
// what's there: a `W`all, `F`loor to walk on, the `X` way out (walking down onto it leaves),
// the iconostasis (`I`, the priest at the altar behind it, `A`, between two candle stands, `O`),
// the chanters (`C`, each beside a lectern, `L`), the tables (`T`) and the parishioners (`P`).
// All but the floor and the way out are in the way; only walls block sight.
const CHURCH_INSIDE = [
  "  WWWWWWW  ",
  "  WOFAFOW  ",
  "WWWIIIIIWWW",
  "WCLFFFFFLCW",
  "WFFFFFFFFFW",
  "WTTPPFFFTTW",
  "WWWPFFPPWWW",
  "  WFFFFFW  ",
  "  WWWXWWW  ",
];
export function makeChurch(pieces, kind) {
  const at = ch => CHURCH_INSIDE.flatMap((row, y) => [...row].flatMap((c, x) => (c === ch ? [[x, y]] : [])));
  const [exit] = at("X");
  return {
    cells: pieces.churchInside[kind], exit, player: [exit[0], exit[1] - 1], chest: null,
    blocked: ["O", "A", "I", "C", "L", "T", "P"].flatMap(at),
    walls: [...at("W"), exit],
    priest: at("A")[0], chanters: at("C"), parishioners: at("P"),
    floor: pieces.churchInside[kind].find(([x, y]) => x === at("F")[0][0] && y === at("F")[0][1])[2],
  };
}

// (`chest`: it always has one, as a graveyard's shed does)
export function makeShed(pieces, seed, { chest = false, extra = false } = {}) {
  const rand = rng(seed);
  const wants = { furniture: rand() < SHED_FURNITURE, chest: rand() < SHED_CHEST || chest, slime: rand() < SHED_SLIME,
    slimeKind: rand() < HORNED_SLIME ? "hornedSlime" : "slime" };
  if (extra) wants.extra = rand() < RED_BLUE ? pieces.fairyRing.chest : pieces.inside.chest;
  for (let attempt = 0; attempt < 200; attempt++) {
    const shed = shedLayout(pieces.inside, seed + 1 + attempt * 7919, wants);
    if (shed) return shed;
    if (attempt === 99) wants.furniture = false;   // a room too cramped for it goes without
  }
  throw new Error(`no playable shed for seed ${seed}`);
}

function shedLayout(R, seed, wants) {
  const rand = rng(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = list => list[int(0, list.length - 1)];
  const w = int(...SHED_SIZE[0]), h = int(...SHED_SIZE[1]);
  const floor = [];
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) floor.push([x, y]);
  const isFloor = (x, y) => x >= 1 && x <= w && y >= 1 && y <= h;
  const exit = [int(1, w), h + 1], player = [exit[0], h];
  const walls = [];
  for (let y = 0; y <= h + 1; y++) for (let x = 0; x <= w + 1; x++) if (!isFloor(x, y)) walls.push([x, y]);
  const nearWall = (x, y) => DIRS.some(([dx, dy]) => !isFloor(x + dx, y + dy));
  const taken = new Set([key(...player)]), solid = new Set(), special = new Map();
  const free = () => floor.filter(c => !taken.has(key(...c)));
  const put = (c, tile, blocks = true) => {
    taken.add(key(...c));
    if (blocks) solid.add(key(...c));
    special.set(key(...c), tile);
  };

  if (wants.furniture) {
    const tables = free().filter(([x, y]) => !taken.has(key(x + 1, y)) && isFloor(x + 1, y));
    if (tables.length) {
      const [tx, ty] = pick(tables);
      put([tx, ty], R.table[0]);
      put([tx + 1, ty], R.table[1]);
    } else {
      const shelves = free().filter(([, y]) => y === 1);
      if (shelves.length && rand() < 0.5) put(pick(shelves), R.shelf);
      else put(pick(free()), R.chair, false);
    }
  }
  let chest = null;
  if (wants.chest) {
    const spots = free().filter(c => nearWall(...c));
    if (!spots.length) return null;
    chest = pick(spots);
    put(chest, R.chest);
  }
  let extra = null;
  if (wants.extra) {
    const spots = free().filter(c => nearWall(...c));
    if (!spots.length) return null;
    extra = { at: pick(spots), tile: wants.extra, blue: wants.extra !== R.chest };
    put(extra.at, extra.tile);
  }
  let slime = null;
  if (wants.slime) {
    const spots = free().filter(([x, y]) => Math.abs(x - player[0]) + Math.abs(y - player[1]) >= SHED_SLIME_AWAY);
    if (!spots.length) return null;
    slime = pick(spots);
  }

  // Everything must be reachable: every floor cell but the solid ones, and the chest's side
  const seen = new Set([key(...player)]), queue = [player];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of DIRS) {
      const k = key(x + dx, y + dy);
      if (!seen.has(k) && isFloor(x + dx, y + dy) && !solid.has(k)) { seen.add(k); queue.push([x + dx, y + dy]); }
    }
  }
  if (seen.size !== floor.length - solid.size) return null;
  if ([chest, extra?.at].some(c => c && !DIRS.some(([dx, dy]) => seen.has(key(c[0] + dx, c[1] + dy))))) return null;

  const cells = [
    ...floor.map(([x, y]) => [x, y, special.get(key(x, y)) ?? R.floor]),
    ...walls.map(([x, y]) => [x, y, x === exit[0] && y === exit[1] ? R.exit : R.wall]),
  ];
  const blocked = [...[...solid].map(k => k.split(",").map(Number)),
    ...walls.filter(([x, y]) => x !== exit[0] || y !== exit[1])];
  return { cells, blocked, chest, extra, exit, player, slime, slimeKind: wants.slimeKind, lady: null };
}
