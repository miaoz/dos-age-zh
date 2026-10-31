// Ko-fi's Support me button on the title screen ("landing", 607:297824, 2026-10-14): Ko-fi's own
// floating-chat widget (the user's code), its donation panel opening over the game as it's pressed.
// Its script's fetched the first time the title's up, into #kofi (index.html), and it's shown only
// while the title is: at the bottom right, in from the corner as the mock has it (web/site.css).
// The page's Content-Security-Policy lets in what it needs (_headers, worker/pages.js).
const KOFI = {
  id: "michaelmicasso",
  src: "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js",
  options: {
    type: "floating-chat",
    "floating-chat.donateButton.text": "Support me",
    "floating-chat.donateButton.background-color": "#d9534f",
    "floating-chat.donateButton.text-color": "#fff",
  },
};

const host = document.getElementById("kofi");
let loading = null, shown = false;

function load() {
  loading = new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = KOFI.src;
    s.onload = ok;
    s.onerror = no;
    document.head.append(s);
  }).then(() => window.kofiWidgetOverlay.draw(KOFI.id, KOFI.options, "kofi")).catch(() => {});
}

// Each of its frames (a computer's and a phone's) as wide as the pill in it, so its right edge is
// where the CSS puts the frame's (the pill's width is the font's, known only once it's drawn)
function fit() {
  for (const wrap of host.querySelectorAll(".floatingchat-container-wrap, .floatingchat-container-wrap-mobi")) {
    const pill = wrap.querySelector("iframe")?.contentDocument?.querySelector(".floatingchat-donate-button");
    const w = pill && Math.ceil(pill.getBoundingClientRect().width);
    if (w && wrap.style.width !== `${w}px`) wrap.style.setProperty("width", `${w}px`, "important");
  }
}

// Shows the button (or hides it, and its panel with it); on a phone it's nearer the corner
export function showKofi(on, phone) {
  if (!host) return;
  if (on && !loading) load();
  if (on) fit();
  if (on === shown && host.dataset.phone === String(phone)) return;
  shown = on;
  host.hidden = !on;
  host.dataset.phone = phone;
}
