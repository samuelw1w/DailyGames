// The name a player goes by on the leaderboards, made from their anonymous client id, like
// "Swift Otter 42". There are no accounts yet, so names are given rather than chosen: nobody can
// put anything rude on the board. No DOM, storage or network code; the API uses it too.
import { hash } from "./random.js";

const ADJECTIVES = [
  "Swift", "Quiet", "Bold", "Lucky", "Clever", "Brave", "Calm", "Eager", "Fancy", "Gentle", "Happy", "Jolly",
  "Keen", "Lively", "Mighty", "Nimble", "Proud", "Quick", "Rapid", "Sharp", "Steady", "Sunny", "Witty", "Zesty",
  "Amber", "Cosmic", "Daring", "Golden", "Hidden", "Silver", "Velvet", "Wild",
];
const ANIMALS = [
  "Otter", "Falcon", "Badger", "Heron", "Lynx", "Panda", "Raven", "Tiger", "Walrus", "Yak", "Zebra", "Bison",
  "Cobra", "Dingo", "Eagle", "Ferret", "Gecko", "Hare", "Ibis", "Jackal", "Koala", "Lemur", "Moose", "Newt",
  "Owl", "Puffin", "Quail", "Robin", "Seal", "Toucan", "Viper", "Wombat",
];

/** The leaderboard name for a client id. Always the same for the same id. */
export function nameFor(clientId) {
  const h = hash(`name:${clientId}`);
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >>> 8) % ANIMALS.length]} ${(h >>> 16) % 100}`;
}
