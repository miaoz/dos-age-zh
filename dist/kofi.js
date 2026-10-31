// Preserve author attribution without loading a third-party payment widget.
export function showKofi(on, phone) {
 const host = document.getElementById("kofi");
 if (host) host.hidden = !on;
}
