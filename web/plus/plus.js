// Plus page: what the subscription gives, and a switch to turn it on.
//
// THERE IS NO PAYMENT HERE YET. The button flips a setting saved in this browser so the rest
// of the site (unlocked games, no ads, earlier days) can be seen working. The price is a
// placeholder. Replace start() with a real checkout when there is one.
import { isPlus, setPlus, LOCKED } from "../shared/account.js";
import { GAMES } from "../shared/registry.js";

const PRICE = "$3.99"; // a month. A placeholder, not a decision.
const view = document.getElementById("view");
const locked = Object.keys(LOCKED).map((id) => GAMES.find((g) => g.id === id).name);

function render() {
  const on = isPlus();
  document.getElementById("sub").textContent = on ? "You have Plus" : "Everything, every day";
  document.getElementById("foot").textContent = "This is a preview: payments aren't set up, so nothing is charged. Turning Plus on only changes this browser.";
  view.innerHTML = `
    <div class="price"><b>${PRICE}</b><span>a month</span></div>
    <ul class="perks">
      <li><b>Every game, unlocked</b><span>${locked.join(", ")} open straight away, with no points spent.</span></li>
      <li><b>New games as they arrive</b><span>Anything added later is yours on day one.</span></li>
      <li><b>Every earlier day</b><span>Step back through the calendar and play the days you missed.</span></li>
      <li><b>No ads</b><span>Just the games.</span></li>
    </ul>
    <div class="dg-actions">
      <button class="dg-btn ${on ? "plain" : ""}" type="button" id="toggle">${on ? "Cancel Plus" : `Start Plus for ${PRICE} a month`}</button>
      <a class="dg-btn plain" href="../">Back to the hub</a>
    </div>`;
  document.getElementById("toggle").addEventListener("click", () => { setPlus(!on); render(); });
}
render();
