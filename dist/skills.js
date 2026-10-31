// The character's skills and spells (Figma "skill", 138:20400), cast from the shortcut slots
// 1-6 (see cast() in game.js). Each variant comes in affixes, like an item; its id is
// "<variant>-<affix>" and its icon tools/skills/<id>.png, baked into the tile atlas by
// tools/extract.py. Tier I (regeneration, firebolt, blink, haste) turn up anywhere; tier II
// (ice ring, thunderbolt, stoneskin, rage) only rarely, tier III (the Yig summons and barrier)
// more rarely still, and tier IV (charm, void orb, reaper, drain) in place of some of tier III's
// (see rollSkill()). Numbers are the "skills" sheet's, 416:73093.
//   name, desc: shown on its card (its cooldown in the card's footer)
//   cooldown:   turns before it can be cast again
//   aimed:      the player picks where it goes before it's cast (see AIM in game.js)
//   affixes, each with:
//     regen: hp given back over `regenTurns` turns, a share each turn (see REGEN_SPELL in game.js)
//     dmg:   [least, most] damage, times the caster's mag (see spellDmg() in game.js), for the
//            monster its bolt hits (bolt), the one it strikes (strike), or every one right round
//            the caster (ring)
//     burn, freeze, paralyse: the chance, in percent, the monster it hurts burns, freezes or is
//            paralysed (see BURN and HELD in game.js)
//     blink: how far the character can be carried, to a cell they pick (in cell widths, as the
//            fog counts them; see AIM in game.js)
//     boost: what it adds to the caster's stats (can be negative), each [by how much, for how
//            many turns]
//     hp:    hp it costs the caster (rage)
//     barrier: [damage it absorbs, for how many turns] (see BARRIER in game.js)
//     charm: turns the monster it's cast on fights for the caster (see CHARM in game.js)
//     orb:   turns a void orb, put down where it's aimed, hurts everything round it (see ORB in game.js)
//     drain: hp the caster gets back when it hits (strike)
//     summons: the Yig it calls up to fight beside the caster till it dies (see YIG in game.js),
//            its stats `scale` times its kind's, and `spd` more (a cursed one's -2, for good)
// Each class's own skill (tier 0, "class", 406:67419, v0.12) is one only the class starts with: it
// never drops, isn't offered on levelling up, and can't be dropped (see classBound() in game.js).
// Its damage goes by the caster's atk, not mag (`byAtk`). Besides the fields above:
//     range: how far it can be aimed, in cells (a firebolt's is BOLT.range in game.js)
//     lunge: the caster is carried along the line to the first monster on it, and strikes it
//     arrow: a bolt that hits as a melee blow would (atk against def), and sets nothing alight
//     radius: a ring as far round the caster as that (an Ice Ring's too); held: how many turns what it paralyses
//            stays so, called stunned
//     buffFirst: its boost's on before it strikes (it hits with the boost)
//     thrust: strikes the first monster on the line to `range` as a blow would (atk against def), the
//            caster staying put
//     pairs: the skill its slot turns into once it's cast, cooling down as long as this one does
//     boost.reduce: percent less damage taken (as gear's `reduce`), not a stat
//     sneak: turns monsters don't notice the caster (and those that had, lose them), till they
//            attack (see SNEAK in game.js); reveal: turns the whole map shows (see SCREECH)
// (damage is Claude's placeholder, 2026-10-11: Lunge like a Firebolt, Hammertime like an Ice Ring,
// Shoot like a blow, all by atk)

import { random } from "./dice.js";

// (as the "skills" sheet, 416:73093, has them, 2026-10-11, but for the weak Blink, which it has
// further than the normal one: it's kept at the normal's 3)
const VARIANTS = {
  lunge: {
    tier: 0, name: "Lunge Attack", desc: "Buff yourself and lunge to hit an enemy {range} tiles away.", cooldown: 10, aimed: true,
    lunge: true, byAtk: true, buffFirst: true, range: 3, affixes: { normal: { dmg: [5, 8], boost: { def: [1, 5] } } },
  },
  sneak: {
    tier: 0, name: "Sneak", desc: "Buff and sneak for 8 turns. Buff and sneak ceases after attack.", cooldown: 20,
    affixes: { normal: { sneak: 8, boost: { atk: [1, 8] } } },
  },
  adrenaline: {
    tier: 0, name: "Adrenaline", desc: "A rush of blood-boiling adrenaline.", cooldown: 20,
    affixes: { normal: { boost: { atk: [2, 10], def: [2, 10] } } },
  },
  shoot: {
    tier: 0, name: "Shoot", desc: "Shoot the enemy with your bow and arrow from {range} tiles away.", cooldown: 9, aimed: true,
    bolt: true, arrow: true, byAtk: true, range: 4, affixes: { normal: {} },
  },
  hammertime: {
    tier: 0, name: "Hammertime!", desc: "Buff yourself and send a shockwave {radius} tiles round you that damages and stuns enemies.",
    cooldown: 12, byAtk: true, buffFirst: true, radius: 2, affixes: { normal: { dmg: [2, 4], paralyse: 50, held: 2, boost: { atk: [1, 5] } } },
  },
  // the pikeman's pair, one slot between them (see PAIRED in game.js), each 4 turns (the user's, 2026-10-25)
  thrust: {
    tier: 0, name: "Thrust", desc: "Thrust your pike at an enemy up to {range} tiles away. Guard comes next.", cooldown: 4, aimed: true,
    thrust: true, byAtk: true, range: 2, pairs: "guard", affixes: { normal: {} },
  },
  guard: {
    tier: 0, name: "Guard", desc: "Brace behind your pike: 15% less damage taken for 2 turns. Thrust comes next.", cooldown: 4,
    pairs: "thrust", affixes: { normal: { boost: { reduce: [15, 2] } } },
  },
  screech: {
    tier: 0, name: "Screech", desc: "Unleash a loud screech to feel your surroundings, revealing the map round you for 3 turns. Each enemy it reaches has a 20% chance to flee in fear for 5 turns.", cooldown: 10,
    affixes: { normal: { reveal: 3, scare: 20 } },
  },
  regeneration: {
    tier: 1, name: "Regeneration", desc: "Gradually restores health.", cooldown: 15, regenTurns: 3,
    affixes: {
      normal: { regen: 10 }, weak: { regen: 7 }, superior: { regen: 13 }, cursed: { regen: 15, boost: { spd: [-2, 5] } },
      enchanted: { regen: 13, boost: { spd: [2, 5] } },
    },
  },
  firebolt: {
    tier: 1, name: "Firebolt", desc: "Single target spell with a chance to burn.", cooldown: 10, aimed: true, bolt: true,
    affixes: {
      normal: { dmg: [5, 8], burn: 35 }, weak: { dmg: [4, 7], burn: 35 }, superior: { dmg: [6, 9], burn: 35 },
      cursed: { dmg: [7, 10], burn: 45, boost: { spd: [-2, 5] } }, enchanted: { dmg: [6, 9], burn: 45, boost: { spd: [2, 5] } },
    },
  },
  blink: {
    tier: 1, name: "Blink", desc: "Instantly teleport to another tile, up to {blink} cells away.", cooldown: 15, aimed: true,
    affixes: {
      normal: { blink: 3 }, weak: { blink: 3 }, superior: { blink: 5 }, cursed: { blink: 6, boost: { spd: [-2, 5] } },
      enchanted: { blink: 5, boost: { spd: [2, 5] } },
    },
  },
  haste: {
    tier: 1, name: "Haste", desc: "Increase your speed over a short period of time.", cooldown: 15,
    affixes: {
      normal: { boost: { spd: [3, 5] } }, weak: { boost: { spd: [2, 5] } }, superior: { boost: { spd: [4, 5] } },
      cursed: { boost: { spd: [6, 5], atk: [-2, 5] } }, enchanted: { boost: { spd: [6, 5] } },
    },
  },
  "ice-ring": {
    tier: 2, name: "Ice Ring", desc: "Radiate frost to your surrounding for {radius} tile radius.", cooldown: 20, ring: true, radius: 2,
    affixes: {
      normal: { dmg: [2, 4], freeze: 35 }, weak: { dmg: [1, 3], freeze: 35 }, superior: { dmg: [4, 6], freeze: 35 },
      cursed: { dmg: [5, 8], freeze: 45, boost: { spd: [-2, 5] } }, enchanted: { dmg: [4, 6], freeze: 45, boost: { spd: [2, 5] } },
    },
  },
  thunderbolt: {
    tier: 2, name: "Thunderbolt", desc: "Single target spell with a chance to paralyse.", cooldown: 20, aimed: true, strike: true,
    affixes: {
      normal: { dmg: [3, 5], paralyse: 35 }, weak: { dmg: [2, 4], paralyse: 35 }, superior: { dmg: [4, 6], paralyse: 35 },
      cursed: { dmg: [6, 9], paralyse: 45, boost: { spd: [-2, 5] } }, enchanted: { dmg: [4, 6], paralyse: 45, boost: { spd: [2, 5] } },
    },
  },
  stoneskin: {
    tier: 2, name: "Stoneskin", desc: "Harden your skin into stone.", cooldown: 20,
    affixes: {
      normal: { boost: { def: [2, 10], spd: [-1, 5] } }, weak: { boost: { def: [1, 10], spd: [-1, 5] } },
      superior: { boost: { def: [3, 10], spd: [-1, 5] } }, cursed: { boost: { def: [4, 10], spd: [-2, 5] } },
      enchanted: { boost: { def: [3, 10], spd: [1, 5] } },
    },
  },
  rage: {
    tier: 2, name: "Rage", desc: "More power, more speed, more blood.", cooldown: 20,
    affixes: {
      normal: { boost: { atk: [2, 7], spd: [2, 7] }, hp: 5 }, weak: { boost: { atk: [1, 7], spd: [1, 7] }, hp: 5 },
      superior: { boost: { atk: [3, 7], spd: [2, 7] }, hp: 5 }, cursed: { boost: { atk: [4, 7], spd: [2, 7] }, hp: 10 },
      enchanted: { boost: { atk: [3, 7], spd: [4, 7] }, hp: 5 },
    },
  },
  "summon-yig-warrior": {
    tier: 3, name: "Summon Yig Warrior", desc: "Summons a Yig Warrior that attacks nearby enemies in melee combat.", cooldown: 100,
    summons: "warrior", affixes: summonAffixes(),
  },
  "summon-yig-mage": {
    tier: 3, name: "Summon Yig Mage", desc: "Summon a Yig Mage that heals you and launches ranged attacks at enemies.", cooldown: 100,
    summons: "mage", affixes: summonAffixes(),
  },
  "summon-yig-spirit": {
    tier: 3, name: "Summon Yig Spirit", desc: "Summon a Yig Spirit that casts supportive spells on allies and applies debuffs to enemies.",
    cooldown: 100, summons: "spirit", affixes: summonAffixes(),
  },
  barrier: {
    tier: 3, name: "Barrier", desc: "Creates a barrier that absorbs incoming attacks.", cooldown: 30,
    affixes: {
      normal: { barrier: [40, 10] }, weak: { barrier: [30, 10] }, superior: { barrier: [50, 10] },
      cursed: { barrier: [60, 10], boost: { spd: [-2, 5] } }, enchanted: { barrier: [50, 10], boost: { spd: [2, 5] } },
    },
  },
  charm: {
    tier: 4, name: "Charm", desc: "Charm and turn a non-boss enemy to fight for you.", cooldown: 33, aimed: true,
    affixes: {
      normal: { charm: 6 }, weak: { charm: 3 }, superior: { charm: 9 }, cursed: { charm: 12, boost: { spd: [-2, 5] } },
      enchanted: { charm: 9, boost: { spd: [2, 5] } },
    },
  },
  "void-orb": {
    tier: 4, name: "Void Orb", desc: "Place a void orb that damages everything around it, friends or foe alike.", cooldown: 20, aimed: true,
    affixes: {
      normal: { dmg: [3, 6], orb: 3 }, weak: { dmg: [2, 5], orb: 3 }, superior: { dmg: [4, 7], orb: 3 },
      cursed: { dmg: [5, 8], orb: 3, boost: { spd: [-2, 5] } }, enchanted: { dmg: [4, 7], orb: 3, boost: { spd: [2, 5] } },
    },
  },
  reaper: {
    tier: 4, name: "Reaper", desc: "Sacrifice your HP to cast a high-damage, single-target spell.", cooldown: 20, aimed: true, strike: true,
    affixes: {
      normal: { dmg: [8, 10], hp: 30 }, weak: { dmg: [7, 9], hp: 30 }, superior: { dmg: [9, 11], hp: 30 },
      cursed: { dmg: [10, 12], hp: 30, boost: { spd: [-2, 5] } }, enchanted: { dmg: [9, 11], hp: 30, boost: { spd: [2, 5] } },
    },
  },
  drain: {
    tier: 4, name: "Drain", desc: "Siphon and absorb life essence from a single enemy.", cooldown: 20, aimed: true, strike: true,
    affixes: {
      normal: { dmg: [4, 7], drain: 12 }, weak: { dmg: [3, 6], drain: 12 }, superior: { dmg: [5, 8], drain: 12 },
      cursed: { dmg: [6, 9], drain: 12, boost: { spd: [-2, 5] } }, enchanted: { dmg: [5, 8], drain: 12, boost: { spd: [2, 5] } },
    },
  },
};
// (the summons' affixes, alike for all three: Figma's cards don't tell them apart, so the numbers are Claude's)
function summonAffixes() {
  return { normal: { scale: 1 }, weak: { scale: 0.5 }, superior: { scale: 1.5 }, cursed: { scale: 1.5, spd: -2 }, enchanted: { scale: 1.5, spd: 2 } };
}

// How often each affix comes up, in percent (superior and cursed made rarer 2026-10-05, from 18 and 7;
// enchanted, 416:73093, as rare as an item's, 2026-10-11)
const AFFIX_ODDS = { normal: 50, weak: 28, superior: 13, cursed: 5, enchanted: 4 };
// How often a tier III spell that comes up is a tier IV one instead (Claude's pick, 2026-10-11)
const TIER4 = 0.3;

// Every skill by id, each with its variant's fields and its affix's
export const SKILLS = Object.fromEntries(Object.entries(VARIANTS).flatMap(([variant, { affixes, name, desc, ...rest }]) =>
  Object.entries(affixes).map(([affix, a]) => [`${variant}-${affix}`, {
    variant, affix, ...rest, ...a,
    // (the affix after "Summon", as Figma has it: "Summon Cursed Yig Warrior")
    name: affix === "normal" ? name : name.replace(/^(Summon )?/, `$1${affix[0].toUpperCase()}${affix.slice(1)} `),
    // (no "Reusable after N turns": the card's footer shows the cooldown, as the v0.13 sheet's cards have it, 834:90893)
    desc: desc.replace("{blink}", a.blink).replace("{range}", rest.range).replace("{radius}", rest.radius),
  }])));

// The id of a random variant of `tier`, each as likely as the others, with an affix picked by AFFIX_ODDS
// (a tier III one TIER4 of the time tier IV instead, unless `exact`: loot's tier is rolled already,
// items.js lootTier())
export function rollSkill(tier = 1, exact = false) {
  if (tier === 3 && !exact && random() < TIER4) tier = 4;
  const variants = Object.keys(VARIANTS).filter(v => VARIANTS[v].tier === tier);
  const variant = variants[Math.floor(random() * variants.length)];
  let r = random() * 100;
  const affix = Object.keys(AFFIX_ODDS).find(a => (r -= AFFIX_ODDS[a]) < 0) || "normal";
  return `${variant}-${affix}`;
}
