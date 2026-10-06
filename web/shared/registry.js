// The list of games shown on the hub. Adding a game = add a folder under web/games/
// and one entry here (and, if it uses the API, one module in api/src/games/).
// `status`: "live" can be played; "soon" shows a dimmed teaser card.
// `accent`: the game's own color. Every game gets a different one.
// `category`: the hub section the card sits in. Sections appear in the order of CATEGORIES.
export const CATEGORIES = ["Word", "Knowledge", "Play", "Logic"];

export const GAMES = [
  {
    id: "middleman",
    name: "Middleman",
    tagline: "Name the thing halfway between two others.",
    category: "Knowledge",
    accent: "#F59E4C",
    path: "games/middleman/",
    launchDay: "2026-10-05",
    maxScore: 500,
    status: "live",
  },
  {
    id: "orbit",
    name: "Orbit",
    tagline: "Tap to sling a ship from planet to planet.",
    category: "Play",
    accent: "#A78BFA",
    path: "games/orbit/",
    launchDay: "2026-10-05",
    maxScore: 5,
    status: "live",
  },
  {
    id: "pins",
    name: "Pins",
    tagline: "Three frames of bowling, two taps a ball.",
    category: "Play",
    accent: "#F27DB0",
    path: "games/pins/",
    launchDay: "2026-10-05",
    maxScore: 90,
    status: "live",
  },
  {
    id: "spot",
    name: "Spot",
    tagline: "Five penalty kicks. Read the keeper.",
    category: "Play",
    accent: "#6FDC8C",
    path: "games/spot/",
    launchDay: "2026-10-05",
    maxScore: 5,
    status: "live",
  },
  {
    id: "skip",
    name: "Skip",
    tagline: "Skip a stone. Tap every time it touches the water.",
    category: "Play",
    accent: "#5BB8F5",
    path: "games/skip/",
    launchDay: "2026-10-05",
    maxScore: 30,
    status: "live",
  },
];
