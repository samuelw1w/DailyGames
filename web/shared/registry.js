// The list of games shown on the hub. Adding a game = add a folder under web/games/
// and one entry here (and, if it uses the API, one module in api/src/games/).
// `status`: "live" shows a Play button; "soon" shows a teaser card.
export const GAMES = [
  {
    id: "middleman",
    name: "Middleman",
    tagline: "Name the thing halfway between two others.",
    icon: "⚖️",
    accent: "#FF5B3A",
    path: "games/middleman/",
    launchDay: "2026-10-05",
    maxScore: 500,
    status: "live",
  },
];
