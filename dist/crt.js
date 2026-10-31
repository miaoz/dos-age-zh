import { recordRenderEvent } from "./render-health.js";
// Subtle CRT post-process: the game still draws to its 2D canvas (which keeps all input),
// and a WebGL canvas laid over it shows that picture with scanlines, a faint glow, a touch of
// colour fringing toward the edges and a soft vignette, and a slight curve like a tube's glass
// (CURVE; the settings' Screen Curve takes it away), on every screen, the title too: the whole
// picture still shows, its edges bowed out and the corners past them the background's dark1
// (DARK1, put through the same pass, so they meet the picture seamlessly), and touchAt() takes a
// press to where it lands on the picture, so taps land where drawn.
// Without WebGL nothing changes. enabled(false) takes it away (the game's own canvas shows
// instead), for when the game's only faintly seen behind the website. Each frame's drawn at a
// `strength` (1 the whole effect, less for less, 0 none: the title's off, see game.js CRT_TITLE), the curve
// aside, which every screen keeps.

const VERT = `
attribute vec2 p;
varying vec2 screen;
void main() { screen = p * 0.5 + 0.5; screen.y = 1.0 - screen.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
varying vec2 screen;   // this pixel, 0-1 across and down the screen
uniform sampler2D img;
uniform vec2 res;     // device px
uniform float dpr;
uniform float time;
uniform float strength;   // how much of all of it (1: as below)
uniform float curve;      // how bowed (0 flat, see CURVE)

const float SCANLINE = 0.4;   // how dark the gap between scanlines gets
const float FRINGE = 0.6;      // colour fringing at the edges, in CSS px
const float GLOW = 0.3;       // how much of the blurred picture is added back
const float VIGNETTE = 0.0; // darkening in the corners
const float GRAIN = 0.012;

vec2 uv;  // where on the picture this pixel shows (bowed, see bend())

// The curve: each axis stretched by the other's distance from the middle, so the middle is as drawn
// and the edges' middles touch the screen's edges, the rest bowed out (the same as crt.js bend())
vec2 bend(vec2 s) {
  vec2 c = s - 0.5;
  return 0.5 + c * (1.0 + curve * c.yx * c.yx);
}

// The background's colour (dark1), shown past the picture's edges in the corners
const vec3 DARK1 = vec3(7.0, 19.0, 36.0) / 255.0;

// The picture at p, and dark1 off it (so the glow and fringing treat the corners as background)
vec3 pic(vec2 p) {
  return p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 ? DARK1 : texture2D(img, p).rgb;
}

vec3 tap(vec2 o) { return pic(uv + o / res); }

void main() {
  uv = bend(screen);
  vec2 c = uv - 0.5;
  float edge = dot(c, c) * 4.0;              // 0 in the middle, ~2 in the corners

  // colour fringing: red and blue drift apart a little toward the edges
  vec2 f = c * FRINGE * strength * dpr * edge;
  vec3 col = vec3(pic(uv + f / res).r, pic(uv).g, pic(uv - f / res).b);

  // glow: a cheap blur of the neighbourhood, added on top (4 taps, not the 8 with the diagonals:
  // the pass reads the picture 7 times a pixel where it read it 11, cheaper on a tablet)
  float r = 2.0 * dpr;
  vec3 blur = (tap(vec2(r, 0.0)) + tap(vec2(-r, 0.0)) + tap(vec2(0.0, r)) + tap(vec2(0.0, -r))) / 4.0;
  col += blur * GLOW * strength;

  // scanlines: one per 3 CSS px, brighter pixels bleed over the gap like a real beam
  float line = 0.5 + 0.5 * cos(6.2831853 * gl_FragCoord.y / (3.0 * dpr));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= 1.0 - SCANLINE * strength * line * (1.0 - lum);

  col *= 1.0 - VIGNETTE * smoothstep(0.2, 2.0, edge);
  col += (fract(sin(dot(gl_FragCoord.xy + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * GRAIN * strength;
  gl_FragColor = vec4(col, 1.0);
}`;

// How bowed the screen is: at 0.1 the picture's corners sit about 1% of the screen in from its own
// (the user's ask for "ever so slightly", 2026-10-27; Claude's number, to tune by eye)
export const CURVE = 0.1;
// bend() of the shader, for a point 0-1 across and down
const bend = (x, y, k) => [0.5 + (x - 0.5) * (1 + k * (y - 0.5) ** 2), 0.5 + (y - 0.5) * (1 + k * (x - 0.5) ** 2)];

export function createCrt(source) {
  const none = Object.assign(() => {}, { enabled() {}, curved() {}, touchAt: (x, y) => [x, y] });
  const out = document.createElement("canvas");
  out.setAttribute("aria-hidden", "true");
  // over the game's canvas exactly, which fills the box they're both in
  Object.assign(out.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none" });
  const gl = out.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) { recordRenderEvent("webgl-unavailable"); return none; }

  // The program and what it draws with; made again if the context's lost and given back (a
  // phone or tablet drops it when the browser's put away, and the picture would freeze black)
  let res, dpr, time, strength, curveAt;
  const setup = () => {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u = name => gl.getUniformLocation(prog, name);
    res = u("res"); dpr = u("dpr"); time = u("time"); strength = u("strength"); curveAt = u("curve");
    gl.viewport(0, 0, out.width, out.height);
    return true;
  };
  if (!setup()) { recordRenderEvent("webgl-setup-failed"); return none; }

  source.after(out);
  source.style.opacity = "0"; // still drawn to and still takes input, just not seen

  let on = true, lost = false, curve = CURVE;
  // while the context's lost the game's own canvas shows, as with the pass turned off
  const show = () => {
    out.style.display = on && !lost ? "" : "none";
    source.style.opacity = on && !lost ? "0" : "";
  };
  out.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; recordRenderEvent("webgl-context-lost", { status: e.statusMessage, trusted: e.isTrusted }); show(); });
  out.addEventListener("webglcontextrestored", () => { lost = !setup(); recordRenderEvent("webgl-context-restored", { ok: !lost }); show(); });
  // call once per frame, after the game has drawn (`k`: the strength, see above)
  const render = (now, k = 1) => {
    if (!on || lost || !source.width || !source.height) return; // nothing to draw (a window of no size)
    if (out.width !== source.width || out.height !== source.height) {
      out.width = source.width; out.height = source.height;
      gl.viewport(0, 0, out.width, out.height);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform2f(res, out.width, out.height);
    gl.uniform1f(dpr, source.width / (source.clientWidth || source.width));   // (canvas px per CSS px: the game may draw coarser than the screen, see game.js MAX_PIXELS)
    gl.uniform1f(time, (now / 1000) % 100);
    gl.uniform1f(strength, k);
    gl.uniform1f(curveAt, curve);   // (whatever the strength: the title's bowed too, the user's, 2026-10-27)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  render.enabled = yes => {
    on = yes;
    show();
  };
  // the Screen Curve setting: bowed or flat
  render.curved = yes => { curve = yes ? CURVE : 0; };
  // A press at x, y (CSS px on the canvas) to where it lands on the picture as drawn, with the
  // curve as it's shown now
  render.touchAt = (x, y) => {
    const w = source.clientWidth, h = source.clientHeight, c = on && !lost ? curve : 0;
    if (!c || !w || !h) return [x, y];
    const [u, v] = bend(x / w, y / h, c);
    return [u * w, v * h];
  };
  return render;
}
