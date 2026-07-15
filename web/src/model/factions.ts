/** The 28 WTC Warhammer 40k factions, alphabetical (matches the faction list in
 * rockethamster/hamsterhelper). Stored on a matrix as the plain faction-name
 * string; the empty string means "not chosen" and renders as the positional
 * Player N / Opponent K label (see model/matrix.ts). */
export const FACTIONS: readonly string[] = [
  'Adepta Sororitas', 'Adeptus Custodes', 'Adeptus Mechanicus', 'Aeldari',
  'Astra Militarum', 'Black Templars', 'Blood Angels', 'Chaos Daemons',
  'Chaos Knights', 'Chaos Space Marines', 'Dark Angels', 'Death Guard',
  'Deathwatch', 'Drukhari', "Emperor's Children", 'Genestealer Cults',
  'Grey Knights', 'Imperial Agents', 'Imperial Knights', 'Leagues of Votann',
  'Necrons', 'Orks', 'Space Marines', 'Space Wolves', "T'au Empire",
  'Thousand Sons', 'Tyranids', 'World Eaters',
];

/** Membership test for distinguishing a real faction from a legacy free-text
 * name (imported JSON, older saves) that predates the faction dropdown. */
export const FACTION_SET: ReadonlySet<string> = new Set(FACTIONS);
