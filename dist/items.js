// Everything that can be found: gear from the v0.12 sheets ("weapon" 477:36729, "armour"
// 487:40094, "trinkets" 494:67393, 2026-10-11), and potions. Each variant comes in five affixes
// (weak, normal, superior, cursed, enchanted), and a chest holds a variant until it's first
// opened, when one of its affixes is picked at random (see roll()); a monster sometimes drops a
// random variant, rolled the same way (drop()).
// An item's id is "<variant>-<affix>"; its icon is tools/items/<id>.png (each card's icon, cut
// from the sheets), baked into the tile atlas by tools/extract.py.
//   kind:   what it is at any tier (a steel axe's is "axe"); tier: I to IV (weapons and armour)
//   rarity: a trinket's instead of a tier, "common", "uncommon" or "rare" (the sheet's three
//           sets, 2026-10-12; the talisman and torch +1 mag on the superior, cursed and
//           enchanted ones, as there)
//   slot:   "weapon", "armour" or "trinket": worn as that, one of each
//   name:   the normal one's; a weak one's starts `weak` instead (Rusted, Crude, Bent,
//           Tarnished, Broken), the rest their affix's name
//   fells:  can chop down forest trees; digs: can dig through the cave's dirt
//   affixes: each affix's (in the order above) stats and what else it does, as words:
//     atk, def, mag, spd: added to the character's own while it's worn; can be negative
//     hp:     added to the character's max hp while it's worn (the heart pin)
//     dodge:  percentage points added to the chance of dodging a blow
//     reduce: percent taken off the damage of every blow the character takes
//     light:  cells added to how far the character sees (the fog pulls back)
//     regen:  heals 1 hp every this many turns
//     drain:  gives back DRAIN of the damage its blows do, as hp (game.js)
//     embers: leaves fire where the character steps from (fiery footprints, game.js EMBERS)
//     sense:  monsters on screen but out of sight show as a red "?" (game.js SENSE)
//     radar:  minibosses anywhere show at the screen's edge, the way they are (SENSE.radar)
//     hunted: every miniboss hunts the character, wherever it is
//     chill:  monsters within game.js CHILL of the character are slowed (slow aura)
//     shock:  percent chance a blow or spell of the character's paralyses what it hurts (game.js HELD)
//     reach:  cells added to the range of every spell (aimed, blink, or ring)
//     cool:   turns taken off every skill's and spell's cooldown as it's cast (never under 1)
//   A cursed one also whispers (game.js WHISPER).
//   main:   the stat its card shows first, as the sheets do: by kind, the first one the weak
//           affix of its first variant adds to (none, for one that adds to none)
// (The descriptions are Claude's, 2026-10-11: the sheets' are still placeholder text.)

import { random } from "./dice.js";

const AFFIXES = ["weak", "normal", "superior", "cursed", "enchanted"];
const GEAR = {
  // weapons
  "axe": { kind: "axe", tier: 1, slot: "weapon", name: "Iron Axe", weak: "Rusted", fells: true,
    affixes: ["atk1", "atk2", "atk3", "atk4 spd-2", "atk3 spd2"] },
  "pickaxe": { kind: "pickaxe", tier: 1, slot: "weapon", name: "Iron Pickaxe", weak: "Rusted", digs: true,
    affixes: ["atk1", "atk2", "atk3", "atk4 spd-2", "atk3 spd2"] },
  "dagger": { kind: "dagger", tier: 1, slot: "weapon", name: "Iron Dagger", weak: "Rusted",
    affixes: ["atk1", "atk1 spd1", "atk2 spd1", "atk3 def-1 spd1", "atk2 spd3"] },
  "sword": { kind: "sword", tier: 1, slot: "weapon", name: "Iron Sword", weak: "Rusted",
    affixes: ["atk1", "atk1 def1", "atk2 def1", "atk3 def1 spd-2", "atk2 def1 spd2"] },
  "staff": { kind: "staff", tier: 1, slot: "weapon", name: "Iron Staff", weak: "Rusted",
    affixes: ["mag1 spd-1", "atk1 mag1 spd-1", "atk2 mag2 spd-1", "atk3 mag3 spd-3", "atk2 mag2 spd1"] },
  "wand": { kind: "wand", tier: 1, slot: "weapon", name: "Iron Wand", weak: "Rusted",
    affixes: ["mag1", "mag2", "mag3", "mag4 spd-2", "mag3 spd2"] },
  "chalice": { kind: "chalice", tier: 1, slot: "weapon", name: "Iron Chalice", weak: "Rusted",
    affixes: ["mag1", "def1 mag1", "def1 mag2", "def1 mag3 spd-2", "def1 mag2 spd2"] },
  "steel-axe": { kind: "axe", tier: 2, slot: "weapon", name: "Steel Axe", weak: "Rusted", fells: true,
    affixes: ["atk2", "atk3", "atk4", "atk5 spd-2", "atk4 spd2"] },
  "steel-pickaxe": { kind: "pickaxe", tier: 2, slot: "weapon", name: "Steel Pickaxe", weak: "Rusted", digs: true,
    affixes: ["atk2", "atk3", "atk4", "atk5 spd-2", "atk4 spd2"] },
  "steel-dagger": { kind: "dagger", tier: 2, slot: "weapon", name: "Steel Dagger", weak: "Rusted",
    affixes: ["atk2", "atk2 spd1", "atk3 spd1", "atk4 def-1 spd1", "atk3 spd3"] },
  "steel-sword": { kind: "sword", tier: 2, slot: "weapon", name: "Steel Sword", weak: "Rusted",
    affixes: ["atk2", "atk2 def1", "atk3 def1", "atk4 def1 spd-2", "atk3 def1 spd2"] },
  "steel-staff": { kind: "staff", tier: 2, slot: "weapon", name: "Steel Staff", weak: "Rusted",
    affixes: ["atk1 mag1 spd-1", "atk2 mag2 spd-1", "atk3 mag3 spd-1", "atk4 mag4 spd-3", "atk3 mag3 spd1"] },
  "steel-wand": { kind: "wand", tier: 2, slot: "weapon", name: "Steel Wand", weak: "Rusted",
    affixes: ["mag2", "mag3", "mag4", "mag5 spd-2", "mag4 spd2"] },
  "steel-chalice": { kind: "chalice", tier: 2, slot: "weapon", name: "Steel Chalice", weak: "Rusted",
    affixes: ["mag2", "def1 mag2", "def1 mag3", "def1 mag4 spd-2", "def1 mag3 spd2"] },
  "gold-axe": { kind: "axe", tier: 3, slot: "weapon", name: "Gold Axe", weak: "Bent", fells: true,
    affixes: ["atk3 light1", "atk4 light1", "atk5 light1", "atk6 spd-2 light1", "atk5 spd2 light1"] },
  "gold-pickaxe": { kind: "pickaxe", tier: 3, slot: "weapon", name: "Gold Pickaxe", weak: "Bent", digs: true,
    affixes: ["atk3 light1", "atk4 light1", "atk5 light1", "atk6 spd-2 light1", "atk5 spd2 light1"] },
  "gold-dagger": { kind: "dagger", tier: 3, slot: "weapon", name: "Gold Dagger", weak: "Bent",
    affixes: ["atk3 spd1 light1", "atk3 spd2 light1", "atk4 spd2 light1", "atk5 def-1 spd2 light1", "atk4 spd4 light1"] },
  "gold-sword": { kind: "sword", tier: 3, slot: "weapon", name: "Gold Sword", weak: "Bent",
    affixes: ["atk3 def1 light1", "atk3 def2 light1", "atk4 def2 light1", "atk5 def2 spd-2 light1", "atk4 def2 spd2 light1"] },
  "gold-staff": { kind: "staff", tier: 3, slot: "weapon", name: "Gold Staff", weak: "Bent",
    affixes: ["atk2 mag2 light1", "atk3 mag3 light1", "atk4 mag4 light1", "atk5 mag5 spd-2 light1", "atk4 mag4 spd2 light1"] },
  "gold-wand": { kind: "wand", tier: 3, slot: "weapon", name: "Gold Wand", weak: "Bent",
    affixes: ["mag3 light1", "mag4 light1", "mag5 light1", "mag6 spd-2 light1", "mag5 spd2 light1"] },
  "gold-chalice": { kind: "chalice", tier: 3, slot: "weapon", name: "Gold Chalice", weak: "Bent",
    affixes: ["mag3 light1", "def2 mag3 light1", "def2 mag4 light1", "def2 mag5 spd-2 light1", "def2 mag4 spd2 light1"] },
  "blood-axe": { kind: "axe", tier: 4, slot: "weapon", name: "Blood Axe", weak: "Bent", fells: true,
    affixes: ["atk4 drain", "atk5 drain", "atk6 drain", "atk7 spd-2 drain", "atk6 spd2 drain"] },
  "blood-pickaxe": { kind: "pickaxe", tier: 4, slot: "weapon", name: "Blood Pickaxe", weak: "Bent", digs: true,
    affixes: ["atk4 drain", "atk5 drain", "atk6 drain", "atk7 spd-2 drain", "atk6 spd2 drain"] },
  "blood-dagger": { kind: "dagger", tier: 4, slot: "weapon", name: "Blood Dagger", weak: "Bent",
    affixes: ["atk4 spd2 drain", "atk4 spd3 drain", "atk5 spd3 drain", "atk6 def-1 spd3 drain", "atk5 spd5 drain"] },
  "blood-sword": { kind: "sword", tier: 4, slot: "weapon", name: "Blood Sword", weak: "Bent",
    affixes: ["atk4 def2 drain", "atk4 def3 drain", "atk5 def3 drain", "atk6 def3 spd-2 drain", "atk5 def3 spd2 drain"] },
  "blood-staff": { kind: "staff", tier: 4, slot: "weapon", name: "Blood Staff", weak: "Bent",
    affixes: ["atk3 mag3 drain", "atk4 mag4 drain", "atk5 mag5 drain", "atk6 mag6 spd-2 drain", "atk5 mag5 spd2 drain"] },
  "blood-wand": { kind: "wand", tier: 4, slot: "weapon", name: "Blood Wand", weak: "Bent",
    affixes: ["mag4 drain", "mag5 drain", "mag6 drain", "mag7 spd-2 drain", "mag6 spd2 drain"] },
  "blood-chalice": { kind: "chalice", tier: 4, slot: "weapon", name: "Blood Chalice", weak: "Bent",
    affixes: ["mag4 drain", "def3 mag4 drain", "def3 mag5 drain", "def3 mag6 spd-2 drain", "def3 mag5 spd2 drain"] },
  // armours
  "cuirass": { kind: "cuirass", tier: 1, slot: "armour", name: "Iron Cuirass", weak: "Rusted",
    affixes: ["def2 spd-1 reduce5", "def3 spd-1 reduce5", "def4 spd-1 reduce5", "def5 spd-3 reduce5", "def4 spd1 reduce5"] },
  "shield": { kind: "shield", tier: 1, slot: "armour", name: "Iron Shield", weak: "Rusted",
    affixes: ["def2 spd-1 reduce5", "def2 reduce5", "def3 reduce5", "def4 spd-2 reduce5", "def3 spd2 reduce5"] },
  "gambeson": { kind: "gambeson", tier: 1, slot: "armour", name: "Leather Gambeson", weak: "Crude",
    affixes: ["def1 dodge5", "def1 spd1 dodge5", "def1 spd2 dodge5", "atk-2 def2 spd3 dodge5", "def1 spd4 dodge5"] },
  "jacket": { kind: "jacket", tier: 1, slot: "armour", name: "Leather Jacket", weak: "Crude",
    affixes: ["atk1 dodge5", "atk1 spd1 dodge5", "atk1 spd2 dodge5", "atk2 def-2 spd3 dodge5", "atk1 spd4 dodge5"] },
  "manteau": { kind: "manteau", tier: 1, slot: "armour", name: "Leather Manteau", weak: "Crude",
    affixes: ["mag1 dodge5", "mag1 spd1 dodge5", "mag1 spd2 dodge5", "def-2 spd3 mag2 dodge5", "mag1 spd4 dodge5"] },
  "robe": { kind: "robe", tier: 1, slot: "armour", name: "Leather Robe", weak: "Crude",
    affixes: ["mag1 def1 spd-1 light1", "mag1 def1 light1", "mag2 def1 light1", "mag3 def1 spd-2 light1", "mag2 def1 spd2 light1"] },
  "hat": { kind: "hat", tier: 1, slot: "armour", name: "Leather Hat", weak: "Crude",
    affixes: ["atk1 mag1 spd-1 light1", "atk1 mag1 light1", "atk2 mag2 light1", "atk1 mag3 spd-2 light1", "atk1 mag2 spd2 light1"] },
  "steel-cuirass": { kind: "cuirass", tier: 2, slot: "armour", name: "Steel Cuirass", weak: "Rusted",
    affixes: ["def3 spd-1 reduce7", "def4 spd-1 reduce7", "def5 spd-1 reduce7", "def6 spd-3 reduce7", "def5 spd1 reduce7"] },
  "steel-shield": { kind: "shield", tier: 2, slot: "armour", name: "Steel Shield", weak: "Rusted",
    affixes: ["def3 spd-1 reduce7", "def3 reduce7", "def4 reduce7", "def5 spd-2 reduce7", "def4 spd2 reduce7"] },
  "fustian-gambeson": { kind: "gambeson", tier: 2, slot: "armour", name: "Fustian Gambeson", weak: "Crude",
    affixes: ["def2 dodge7", "def2 spd1 dodge7", "def2 spd2 dodge7", "atk-2 def3 spd3 dodge7", "def2 spd4 dodge7"] },
  "fustian-jacket": { kind: "jacket", tier: 2, slot: "armour", name: "Fustian Jacket", weak: "Crude",
    affixes: ["atk2 dodge7", "atk2 spd1 dodge7", "atk2 spd2 dodge7", "atk3 def-2 spd3 dodge7", "atk2 spd4 dodge7"] },
  "fustian-manteau": { kind: "manteau", tier: 2, slot: "armour", name: "Fustian Manteau", weak: "Crude",
    affixes: ["mag2 dodge7", "mag2 spd1 dodge7", "mag2 spd2 dodge7", "def-2 spd3 mag3 dodge7", "mag2 spd4 dodge7"] },
  "fustian-robe": { kind: "robe", tier: 2, slot: "armour", name: "Fustian Robe", weak: "Crude",
    affixes: ["mag1 def2 spd-1 light2", "mag1 def2 light2", "mag2 def2 light2", "mag3 def2 spd-2 light2", "mag2 def2 spd2 light2"] },
  "fustian-hat": { kind: "hat", tier: 2, slot: "armour", name: "Fustian Hat", weak: "Crude",
    affixes: ["atk1 mag1 light2", "atk2 mag2 light2", "atk3 mag3 light2", "atk4 mag4 spd-2 light2", "atk3 mag3 spd2 light2"] },
  "golden-cuirass": { kind: "cuirass", tier: 3, slot: "armour", name: "Golden Cuirass", weak: "Tarnished",
    affixes: ["def4 spd-1 reduce9 light1", "def5 spd-1 reduce9 light1", "def6 spd-1 reduce9 light1", "def7 spd-3 reduce9 light1", "def6 spd1 reduce9 light1"] },
  "golden-shield": { kind: "shield", tier: 3, slot: "armour", name: "Golden Shield", weak: "Tarnished",
    affixes: ["def4 spd-1 reduce9 light1", "def4 reduce9 light1", "def5 reduce9 light1", "def6 spd-2 reduce9 light1", "def5 spd2 reduce9 light1"] },
  "golden-gambeson": { kind: "gambeson", tier: 3, slot: "armour", name: "Golden Gambeson", weak: "Tarnished",
    affixes: ["def3 dodge9 light1", "def3 spd1 dodge9 light1", "def3 spd2 dodge9 light1", "atk-2 def4 spd3 dodge9 light1", "def3 spd4 dodge9 light1"] },
  "golden-jacket": { kind: "jacket", tier: 3, slot: "armour", name: "Golden Jacket", weak: "Tarnished",
    affixes: ["atk3 spd1 dodge9 light1", "atk3 spd2 dodge9 light1", "atk3 spd3 dodge9 light1", "atk4 def-2 spd4 dodge9 light1", "atk3 spd5 dodge9 light1"] },
  "golden-manteau": { kind: "manteau", tier: 3, slot: "armour", name: "Golden Manteau", weak: "Crude",
    affixes: ["mag3 spd1 dodge9 light1", "mag3 spd2 dodge9 light1", "mag3 spd3 dodge9 light1", "def-2 spd4 mag4 dodge9 light1", "mag3 spd5 dodge9 light1"] },
  "golden-robe": { kind: "robe", tier: 3, slot: "armour", name: "Golden Robe", weak: "Crude",
    affixes: ["mag2 def3 spd-1 light4", "mag2 def3 light4", "mag3 def3 light4", "mag4 def3 spd-2 light4", "mag3 def3 spd2 light4"] },
  "golden-hat": { kind: "hat", tier: 3, slot: "armour", name: "Golden Hat", weak: "Crude",
    affixes: ["atk2 mag2 light4", "atk3 mag3 light4", "atk4 mag4 light4", "atk5 mag5 spd-2 light4", "atk4 mag4 spd2 light4"] },
  "spirit-cuirass": { kind: "cuirass", tier: 4, slot: "armour", name: "Spirit Cuirass", weak: "Tarnished",
    affixes: ["def5 spd-1 reduce12 regen2", "def6 spd-1 reduce12 regen2", "def7 spd-1 reduce12 regen2", "def8 spd-3 reduce12 regen2", "def7 spd1 reduce12 regen2"] },
  "spirit-shield": { kind: "shield", tier: 4, slot: "armour", name: "Spirit Shield", weak: "Tarnished",
    affixes: ["def5 spd-1 reduce12 regen2", "def5 reduce12 regen2", "def6 reduce12 regen2", "def7 spd-2 reduce12 regen2", "def6 spd2 reduce12 regen2"] },
  "spirit-gambeson": { kind: "gambeson", tier: 4, slot: "armour", name: "Spirit Gambeson", weak: "Tarnished",
    affixes: ["def4 dodge12 regen2", "def4 spd2 dodge12 regen2", "def4 spd3 dodge12 regen2", "atk-2 def5 spd4 dodge12 regen2", "def4 spd5 dodge12 regen2"] },
  "spirit-jacket": { kind: "jacket", tier: 4, slot: "armour", name: "Spirit Jacket", weak: "Tarnished",
    affixes: ["atk4 spd2 dodge12 regen2", "atk4 spd3 dodge12 regen2", "atk4 spd4 dodge12 regen2", "atk5 def-2 spd5 dodge12 regen2", "atk4 spd6 dodge12 regen2"] },
  "spirit-manteau": { kind: "manteau", tier: 4, slot: "armour", name: "Spirit Manteau", weak: "Crude",
    affixes: ["mag4 spd2 dodge12 regen2", "mag4 spd3 dodge12 regen2", "mag4 spd4 dodge12 regen2", "def-2 spd5 mag5 dodge12 regen2", "mag4 spd6 dodge12 regen2"] },
  "spirit-robe": { kind: "robe", tier: 4, slot: "armour", name: "Spirit Robe", weak: "Crude",
    affixes: ["mag3 def4 spd-1 light4 regen2", "mag3 def4 light4 regen2", "mag4 def4 light4 regen2", "mag5 def4 spd-2 light4 regen2", "mag4 def4 spd2 light4 regen2"] },
  "spirit-hat": { kind: "hat", tier: 4, slot: "armour", name: "Spirit Hat", weak: "Crude",
    affixes: ["atk3 mag3 light4 regen2", "atk4 mag4 light4 regen2", "atk5 mag5 light4 regen2", "atk6 mag6 spd-2 light4 regen2", "atk5 mag5 spd2 light4 regen2"] },
  // trinkets
  "talisman": { kind: "talisman", rarity: "common", slot: "trinket", name: "Alover Talisman", weak: "Broken",
    affixes: ["regen4", "regen3", "mag1 regen2", "mag1 spd-2 regen1", "mag1 spd2 regen2"] },
  "torch": { kind: "torch", rarity: "common", slot: "trinket", name: "Torch", weak: "Broken",
    affixes: ["light1", "light2", "mag1 light3", "mag1 spd-2 light4", "mag1 spd2 light3"] },
  "heart-pin": { kind: "heart-pin", rarity: "common", slot: "trinket", name: "Heart Pin", weak: "Broken",
    affixes: ["hp10", "hp15", "hp20", "hp30 spd-2", "hp20 spd2"] },
  "medallion": { kind: "medallion", rarity: "uncommon", slot: "trinket", name: "Medallion", weak: "Broken",
    affixes: ["atk1", "atk1 spd1", "atk2 spd1", "atk3 spd-1", "atk2 spd3"] },
  "helmet": { kind: "helmet", rarity: "uncommon", slot: "trinket", name: "Helmet", weak: "Broken",
    affixes: ["def1", "def1 spd1", "def2 spd1", "def3 spd-1", "def2 spd3"] },
  "sabatons": { kind: "sabatons", rarity: "uncommon", slot: "trinket", name: "Sabatons", weak: "Broken",
    affixes: ["spd1", "spd2", "spd3", "atk-1 mag-1 spd5", "spd4"] },
  "orb": { kind: "orb", rarity: "uncommon", slot: "trinket", name: "Orb", weak: "Broken",
    affixes: ["mag1", "mag1 spd1", "mag2 spd1", "mag3 spd-1", "mag2 spd3"] },
  "resonator": { kind: "resonator", rarity: "rare", slot: "trinket", name: "Resonator", weak: "Broken",
    affixes: ["spd-2 sense", "spd-1 sense", "sense", "spd-2 sense radar hunted", "spd2 sense"] },
  "lava-boots": { kind: "lava-boots", rarity: "rare", slot: "trinket", name: "Lava Boots", weak: "Broken",
    affixes: ["spd1 embers", "spd2 embers", "spd3 embers", "atk-1 mag-1 spd5 embers", "spd4 embers"] },
  "glacier-medallion": { kind: "glacier-medallion", rarity: "rare", slot: "trinket", name: "Glacier Medallion", weak: "Broken",
    affixes: ["atk1 chill", "atk1 spd1 chill", "atk2 spd1 chill", "atk3 spd-1 chill", "atk2 spd3 chill"] },
  "thunder-helmet": { kind: "thunder-helmet", rarity: "rare", slot: "trinket", name: "Thunder Helmet", weak: "Broken",
    affixes: ["def1 shock10", "def1 spd1 shock10", "def2 spd1 shock10", "def3 spd-1 shock10", "def2 spd3 shock10"] },
  "emerald-orb": { kind: "emerald-orb", rarity: "rare", slot: "trinket", name: "Emerald Orb", weak: "Broken",
    affixes: ["mag1 reach1", "mag1 spd1 reach1", "mag2 spd1 reach1", "mag3 spd-1 reach1", "mag2 spd3 reach1"] },
  // (the user's, Figma 936:23365, 2026-10-28; uncommon, the user's too)
  "amulet": { kind: "amulet", rarity: "uncommon", slot: "trinket", name: "Amulet", weak: "Broken",
    affixes: ["spd-1 cool1", "cool1", "atk1 mag1 cool1", "spd-2 cool2", "atk1 mag1 spd2 cool1"] },
};
// What each kind is, for its description ("{of}" what it's made of)
const KINDS = {
  axe: "An axe {of}.", pickaxe: "A pickaxe {of}.", dagger: "A dagger {of}.", sword: "A sword {of}.",
  staff: "A staff {of}.", wand: "A wand {of}.", chalice: "A chalice {of}.",
  cuirass: "A cuirass {of}.", shield: "A shield {of}.", gambeson: "A padded gambeson {of}.", jacket: "A jacket {of}.",
  manteau: "A manteau {of}.", robe: "A robe {of}.", hat: "A hat {of}.",
  talisman: "Aloe vera, bound in a charm. It slowly heals.", torch: "Pushes the dark back.",
  "heart-pin": "A red pin worn over the heart. It keeps a little more of you.",
  medallion: "A medallion that steadies the hand.", helmet: "A helmet for a hard head.", sabatons: "Light steel shoes, quick on the feet.",
  resonator: "It hums when something is near.", "lava-boots": "Each step leaves fire behind.",
  orb: "A glass orb that sharpens the mind.", "glacier-medallion": "Cold to the touch. The air round it slows.",
  "thunder-helmet": "It crackles when it's struck.", "emerald-orb": "A green orb. Spells cast through it carry further.",
  amulet: "A green stone on a cord. Whatever you call on comes back sooner.",
};
const MADE_OF = { Iron: "made out of iron", Steel: "made out of steel", Gold: "made out of gold", Blood: "of blood-red steel",
  Leather: "made out of leather", Fustian: "made out of fustian", Golden: "made out of gold", Spirit: "woven from spirit" };
const SPECIAL = ["drain", "embers", "sense", "radar", "hunted", "chill"];
// The words an affix's are given as, made into an item's fields
function affixFields(words) {
  const fields = { stats: {} };
  for (const w of words.split(" ").filter(Boolean)) {
    const [, k, n] = w.match(/^([a-z]+)(-?\d*)$/);
    if (["hp", "atk", "def", "mag", "spd"].includes(k)) fields.stats[k] = Number(n);
    else if (SPECIAL.includes(k)) fields[k] = true;
    else fields[k] = Number(n);
  }
  return fields;
}
const MAIN = {};
for (const { kind, affixes } of Object.values(GEAR))
  MAIN[kind] ??= Object.entries(affixFields(affixes[0]).stats).find(([, n]) => n > 0)?.[0] ?? null;
const VARIANTS = Object.fromEntries(Object.entries(GEAR).map(([variant, { name, weak, affixes, ...g }]) => {
  const material = Object.keys(MADE_OF).find(m => name.startsWith(m + " "));
  const desc = KINDS[g.kind].replace("{of}", MADE_OF[material] ?? "");
  const main = MAIN[g.kind];
  return [variant, { ...g, ...(main ? { main } : {}), ...(material ? { material: material.toLowerCase() } : {}), affixes: Object.fromEntries(AFFIXES.map((affix, i) => [affix, {
    name: affix === "normal" ? name : `${affix === "weak" ? weak : affix[0].toUpperCase() + affix.slice(1)} ${name}`, desc,
    ...affixFields(affixes[i]), ...(affix === "cursed" ? { traits: ["whispers"] } : {}),
  }])) }];
}));

// How often each affix comes up, in percent: normal and weak are common, superior uncommon,
// and cursed and enchanted rare, enchanted the rarer (superior and cursed made rarer 2026-10-05,
// from 15 and 7)
const AFFIX_ODDS = { normal: 45, weak: 34, superior: 12, cursed: 5, enchanted: 4 };

// Consumables ("consumables", 306:29639): potions, each drunk from the bag (taking a turn, and
// one of its stack, up to `stack` to a slot) for what it does:
//   heal:     hp given back at once
//   cooldown: turns taken off every spell still cooling down
//   boost:    what it adds to the character's stats (can be negative), each [by how much, for
//             how many turns], as a spell's boost does (skills.js)
//   hp:       what it costs, at once (never the last of it)
// Each is found `odds` times in a hundred potions (see potion()). An Unknown Potion is one of
// the others, or of the bad ones in UNKNOWN, rolled as it's found and kept hidden: its id is
// "potion-unknown-<what it is>", and it's called and drawn as an Unknown Potion until it's drunk,
// or seen by a character with the mag to know it (see IDENTIFY in game.js).
// (the Rage Potion's description, the odds and the bad potions are Claude's picks; the mock's says
// "Lorem Ipsum")
const POTIONS = {
  health: { name: "Health Potion", desc: "Restores a moderate amount of health.", heal: 25, odds: 34 },
  energy: { name: "Energy Potion", desc: "Reduce the cooldown of all spells.", cooldown: 10, odds: 12 },
  stoneskin: { name: "Stoneskin Potion", desc: "Harden your skin into stone.", boost: { def: [2, 10], spd: [-1, 10] }, odds: 11 },
  haste: { name: "Haste Potion", desc: "Increase your speed over a short period of time.", boost: { spd: [2, 10] }, odds: 12 },
  rage: { name: "Rage Potion", desc: "Trade some of your health for fury.", boost: { atk: [2, 5], spd: [1, 5] }, hp: 15, odds: 11 },
  unknown: { name: "Unknown Potion", desc: "Unknown potion with random buff/debuff effects.", odds: 20 },
};
// What an Unknown Potion may turn out to be: any of the others (`good` of the time, each as
// likely), or one of these
const UNKNOWN = {
  good: 0.6,
  bad: {
    poison: { name: "Poison Potion", desc: "It burns going down.", hp: 15 },
    weakness: { name: "Weakness Potion", desc: "Your arms grow heavy.", boost: { atk: [-2, 10] } },
    frailty: { name: "Frailty Potion", desc: "Your skin grows thin.", boost: { def: [-2, 10] } },
    sloth: { name: "Sloth Potion", desc: "Your legs grow heavy.", boost: { spd: [-2, 10] } },
  },
};
const POTION_STACK = 9;
const { unknown: unknownPotion, ...knownPotions } = POTIONS;
const potionItem = (kind, p) => ({ variant: "potion", kind, tier: 1, consumable: true, stack: POTION_STACK, ...p });
const potionItems = Object.fromEntries([
  ...Object.entries(knownPotions).map(([kind, p]) => [`potion-${kind}`, potionItem(kind, p)]),
  ...Object.entries({ ...knownPotions, ...UNKNOWN.bad }).map(([truly, p]) => [`potion-unknown-${truly}`,
    potionItem("unknown", { name: unknownPotion.name, desc: unknownPotion.desc, icon: "potion-unknown", truly: { ...p, kind: truly } })]),
]);

// Keepsakes (.TIFF's codex fuzhu-soul, 2026-10-19): trinkets that do nothing, no stats at all, and
// are always plain (never weak, cursed or enchanted, so none whispers, and the blacksmith won't
// take one); never in a chest or rolled as a drop, only left by what they're of (game.js KEEPSAKE).
// Each id is its own, with its icon (game.js NOTE_LOOKS) and its card's words.
const KEEPSAKES = {
  "white-tuft": { name: "White Tuft", desc: "It smells of rain." },
  "lumberjack-locket": { name: "Lumberjack's Locket", desc: "It opens to a photo of a man holding a little girl." },   // (.TIFF's lumberjack-locket)
};
const keepsakeItems = Object.fromEntries(Object.entries(KEEPSAKES).map(([id, k]) =>
  [id, { variant: id, kind: id, affix: "normal", slot: "trinket", keepsake: true, stats: {}, ...k }]));

// Relics (the user's list, 2026-10-19): rare trinkets that bend one of the game's rules, each its
// own id, always plain like a keepsake (never weak, cursed or enchanted, and the blacksmith won't
// take one), never in an ordinary roll: found only as game.js RELIC says, one a journey at most.
// `scale`: what each stat's multiplied by while it's worn (game.js stat()); the rest is done in
// game.js by the relic's id (see RELIC). The words are Claude's.
const RELICS = {
  "echo-stone": { name: "Echo Stone", desc: "Every spell you cast rings out again a turn later, at half its strength." },
  "bone-flute": { name: "Bone Flute", desc: "The dead that rise at night leave you be, and one of them walks with you." },
  "moon-dial": { name: "Moon Dial", desc: "+30% ATK, DEF, MAG and SPD at night, -10% by day." },
  "hungry-blade": { name: "Hungry Blade", desc: "Every kill feeds you. Out of a fight it feeds on you, 1 hp every 7 turns." },
  "lost-souls-lantern": { name: "Lantern of Lost Souls", desc: "Ghosts and graves show through the dark, and each night a lost soul fights beside you." },
  "aegis": { name: "Aegis", desc: "Doubles your DEF, but halves your ATK.", scale: { def: 2, atk: 0.5 } },
  "hermes": { name: "Hermes", desc: "Doubles your SPD, but halves your DEF.", scale: { spd: 2, def: 0.5 } },
  "fang": { name: "Fang", desc: "Doubles your ATK, but halves your DEF.", scale: { atk: 2, def: 0.5 } },
  "mistral": { name: "Mistral", desc: "Doubles your MAG, but halves your DEF.", scale: { mag: 2, def: 0.5 } },
  "thorn": { name: "Thorn", desc: "Doubles your ATK and MAG, but halves your DEF and SPD.", scale: { atk: 2, mag: 2, def: 0.5, spd: 0.5 } },
};
export const RELIC_IDS = Object.keys(RELICS);
const relicItems = Object.fromEntries(Object.entries(RELICS).map(([id, r]) =>
  [id, { variant: id, kind: id, affix: "normal", slot: "trinket", relic: true, stats: {}, ...r }]));

// Every item by id, each with its variant's fields and its affix's
// (`kind` is what it is at any tier: a steel axe's is "axe")
export const ITEMS = {
  ...Object.fromEntries(Object.entries(VARIANTS).flatMap(([variant, { affixes, ...base }]) =>
    Object.entries(affixes).map(([affix, a]) => [`${variant}-${affix}`, { variant, kind: variant, affix, ...base, ...a }]))),
  ...potionItems,
  ...keepsakeItems,
  ...relicItems,
};

// The burning bush's glory (game.js BUSH): `luck` percentage points of the odds moved off weak,
// three in five of them onto superior and the rest onto enchanted, for every roll from then on
let luck = 0;
export const setLuck = points => { luck = points; };
const affixOdds = a => AFFIX_ODDS[a] + luck * ({ weak: -1, superior: 0.6, enchanted: 0.4 }[a] ?? 0);

// The id of a variant with one of its affixes, picked by AFFIX_ODDS (and any luck)
export function roll(variant) {
  const affixes = Object.keys(VARIANTS[variant].affixes);
  let r = random() * affixes.reduce((sum, a) => sum + affixOdds(a), 0);
  const affix = affixes.find(a => (r -= affixOdds(a)) < 0) || affixes.at(-1);
  return `${variant}-${affix}`;
}

// What's found is of the tier of where it's found (game.js lootBase(): the forest's biome, a
// cave's floor), a step below it, or a step or two above, by LOOT's odds in percent [-1, same,
// +1, +2]: `found` for chests, felled trees, dug dirt, mined crystals and the easy foes, the rest
// by a foe's rank (the user's numbers, 2026-10-12; the step down, 10, taken off the same tier's).
// Nothing goes below tier I or past tier IV: a step that would stays at the end.
export const LOOT = { found: [10, 80, 8.5, 1.5], medium: [10, 60, 27, 3], hard: [10, 50, 35, 5], miniboss: [10, 10, 70, 10] };
// ...and a foe's affix moves some of them (game.js MONSTER_AFFIXES `loot`): [down, +1, +2], the
// points for a step down taken off the same tier's, and those for the steps up off the step
// down's first, then the same tier's
export function lootOdds(rank, [down, up1, up2] = [0, 0, 0]) {
  let [d, same, u1, u2] = LOOT[rank] ?? LOOT.found;
  const moveDown = Math.min(down, same);
  d += moveDown; same -= moveDown;
  let up = up1 + up2;
  const fromD = Math.min(up, d); d -= fromD; up -= fromD;
  same = Math.max(0, same - up);
  return [d, same, u1 + up1, u2 + up2];
}
const MIN_TIER = 1, MAX_TIER = 4;
const lootStep = (odds = LOOT.found) => {
  let r = random() * odds.reduce((a, b) => a + b, 0);
  const i = odds.findIndex(o => (r -= o) < 0);
  return (i < 0 ? 1 : i) - 1;      // (-1, 0, 1 or 2)
};
export const lootTier = (base = 1, odds) => Math.max(MIN_TIER, Math.min(MAX_TIER, base + lootStep(odds)));
// A trinket has no tier: it's common, uncommon or rare by the same odds' steps up, wherever it's
// found (a step down is common). TRINKETS of what's dropped is a trinket (the user's 17%, 2026-10-12)
const RARITY = ["common", "uncommon", "rare"], TRINKETS = 0.17;
const pick = list => list[Math.floor(random() * list.length)];
// A variant, each of the tier (or rarity) as likely as the others, with a rolled affix
export function drop(base = 1, odds) {
  const trinket = random() < TRINKETS;
  const step = trinket ? RARITY[Math.max(0, lootStep(odds))] : lootTier(base, odds);
  return roll(pick(Object.keys(VARIANTS).filter(v => (trinket ? VARIANTS[v].rarity : VARIANTS[v].tier) === step)));
}
// A variant (not its affix: that's rolled when it's found, see roll()) of a slot and tier
export const variantOf = (slot, tier) => pick(Object.keys(VARIANTS).filter(v => VARIANTS[v].slot === slot && VARIANTS[v].tier === tier));

// A potion, picked by POTIONS' odds (an Unknown Potion's true kind rolled there and then)
export function potion() {
  let r = random() * Object.values(POTIONS).reduce((sum, p) => sum + p.odds, 0);
  const kind = Object.keys(POTIONS).find(k => (r -= POTIONS[k].odds) < 0) || "health";
  if (kind !== "unknown") return `potion-${kind}`;
  const pool = Object.keys(random() < UNKNOWN.good ? knownPotions : UNKNOWN.bad);
  return `potion-unknown-${pool[Math.floor(random() * pool.length)]}`;
}
