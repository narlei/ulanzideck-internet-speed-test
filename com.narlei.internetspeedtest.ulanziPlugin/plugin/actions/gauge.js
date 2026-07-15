/**
 * gauge.js — neon speed-test icons rendered as SVG (this plugin runs as a Node
 * process, which has no <canvas>). Each function returns a `data:image/svg+xml`
 * URL suitable for $UD.setBaseDataIcon().
 */

const SIZE = 256;
const START = 135; // gauge starts bottom-left
const SWEEP = 270; // 270° arc, gap at the bottom

const C_DOWN = ["#00E5FF", "#00FF9C"]; // cyan -> green
const C_UP = ["#FF9E00", "#FF4D8D"]; // amber -> pink
const C_TRACK = "#222a3d";
const C_DIM = "#8a94ad";
const Q_GOOD = "#00FF9C";
const Q_OK = "#FFC53D";
const Q_BAD = "#FF4D5E";

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const a = polar(cx, cy, r, startDeg);
  const b = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return (
    "M " + a[0].toFixed(2) + " " + a[1].toFixed(2) +
    " A " + r + " " + r + " 0 " + large + " 1 " + b[0].toFixed(2) + " " + b[1].toFixed(2)
  );
}

function ring(cx, cy, r, width, ratio, stops, id) {
  const track =
    '<path d="' + arcPath(cx, cy, r, START, START + SWEEP) + '" fill="none" stroke="' +
    C_TRACK + '" stroke-width="' + width + '" stroke-linecap="round"/>';
  if (ratio <= 0) return track;
  const end = START + SWEEP * Math.min(Math.max(ratio, 0.001), 1);
  const stroke = stops.length > 1 ? 'url(#' + id + ')' : stops[0];
  const val =
    '<path d="' + arcPath(cx, cy, r, START, end) + '" fill="none" stroke="' + stroke +
    '" stroke-width="' + width + '" stroke-linecap="round" filter="url(#glow)"/>';
  return track + val;
}

/**
 * Indeterminate "comet" on a gauge track: a lit segment of length `len`
 * (0–1 of the full sweep) whose head sits at `head` (0–1 along the arc).
 * Clips cleanly at the bottom gap so the comet disappears and reappears.
 */
function ringComet(cx, cy, r, width, head, len, stops, id) {
  const track =
    '<path d="' + arcPath(cx, cy, r, START, START + SWEEP) + '" fill="none" stroke="' +
    C_TRACK + '" stroke-width="' + width + '" stroke-linecap="round"/>';
  const h = ((head % 1) + 1) % 1;
  const L = Math.min(Math.max(len, 0.05), 0.95);
  const endDeg = START + SWEEP * h;
  const startDeg = endDeg - SWEEP * L;
  if (endDeg <= START + 0.5) return track;
  const a0 = Math.max(startDeg, START);
  const a1 = Math.min(endDeg, START + SWEEP);
  if (a1 - a0 < 0.5) return track;
  const stroke = stops.length > 1 ? 'url(#' + id + ')' : stops[0];
  return (
    track +
    '<path d="' + arcPath(cx, cy, r, a0, a1) + '" fill="none" stroke="' + stroke +
    '" stroke-width="' + width + '" stroke-linecap="round" filter="url(#glow)"/>'
  );
}

function grad(id, stops) {
  return (
    '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" stop-color="' + stops[0] + '"/>' +
    '<stop offset="100%" stop-color="' + stops[1] + '"/></linearGradient>'
  );
}

function text(x, y, size, fill, str, weight) {
  return (
    '<text x="' + x + '" y="' + y + '" font-family="Arial, Helvetica, sans-serif" font-size="' +
    size + '" font-weight="' + (weight || "bold") + '" fill="' + fill +
    '" text-anchor="middle" dominant-baseline="central">' + esc(str) + "</text>"
  );
}

/** Centered line with two colored spans (e.g. "↓" + "837"). */
function textPair(x, y, size, leftFill, left, rightFill, right, weight) {
  const w = weight || "bold";
  return (
    '<text x="' + x + '" y="' + y + '" font-family="Arial, Helvetica, sans-serif" font-size="' +
    size + '" font-weight="' + w + '" text-anchor="middle" dominant-baseline="central">' +
    '<tspan fill="' + leftFill + '">' + esc(left) + "</tspan>" +
    '<tspan fill="' + rightFill + '">' + esc(right) + "</tspan>" +
    "</text>"
  );
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function svgWrap(inner) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SIZE + " " + SIZE + '" width="' +
    SIZE + '" height="' + SIZE + '">' +
    "<defs>" +
    '<radialGradient id="bg" cx="50%" cy="50%" r="75%">' +
    '<stop offset="0%" stop-color="#141a29"/><stop offset="100%" stop-color="#0a0d16"/>' +
    "</radialGradient>" +
    '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">' +
    '<feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/>' +
    '<feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    grad("gd", C_DOWN) + grad("gu", C_UP) +
    "</defs>" +
    '<rect x="0" y="0" width="' + SIZE + '" height="' + SIZE + '" rx="46" fill="url(#bg)"/>' +
    inner +
    "</svg>"
  );
}

function toDataUrl(svg) {
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

function ratioFor(v, max, autoCap) {
  const val = Math.max(0, v || 0);
  if (max && max > 0) return Math.min(val / max, 1);
  return Math.sqrt(Math.min(val / autoCap, 1));
}

function fmt(v) {
  if (!isFinite(v) || v <= 0) return "--";
  if (v >= 100) return String(Math.round(v));
  return v.toFixed(1);
}

/** Font size that keeps multi-digit speeds inside the center hole. */
function speedNumSize(dStr, uStr) {
  const n = Math.max(dStr.length, uStr.length);
  if (n >= 5) return 24;
  if (n >= 4) return 30;
  if (n >= 3) return 38;
  return 44;
}

/**
 * Dual concentric gauges filling the key. Rings sit close together near the
 * edges so the center hole stays large enough for the stacked readouts.
 * Values use gauge colors; ↓ down / ↑ up live in the bottom arc gap as a legend.
 *
 * @param {{download:number, upload:number, unit:string, downMax?:number, upMax?:number}} o
 */
function renderSpeed(o) {
  const unit = o.unit === "MBps" ? "MB/s" : "Mbps";
  const autoCap = o.unit === "MBps" ? 125 : 1000;
  const cx = SIZE / 2, cy = SIZE / 2;

  // Full-width rings (outer ≈ key edge), tight gap between down/up arcs.
  const outerR = 112;
  const innerR = 90;
  const stroke = 18;

  let g = "";
  g += ring(cx, cy, outerR, stroke, ratioFor(o.download, o.downMax, autoCap), C_DOWN, "gd");
  g += ring(cx, cy, innerR, stroke, ratioFor(o.upload, o.upMax, autoCap), C_UP, "gu");

  const dStr = fmt(o.download);
  const uStr = fmt(o.upload);
  const numSize = speedNumSize(dStr, uStr);

  // Down/up pair slightly below center; unit sits low on the up-gauge bottom.
  g += text(cx, cy - 12, numSize, C_DOWN[0], dStr, "bold");
  g += text(cx, cy + 32, numSize, C_UP[0], uStr, "bold");
  // Bottom of the up ring (inner arc tips ≈ cy + innerR * sin(135°) ≈ cy + 64).
  g += text(cx, cy + 78, 18, C_DIM, unit, "600");

  // Single centered legend line in the open bottom gap.
  g +=
    '<text x="' + cx + '" y="' + (cy + 108) +
    '" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" ' +
    'text-anchor="middle" dominant-baseline="central">' +
    '<tspan fill="' + C_DOWN[0] + '">↓ </tspan>' +
    '<tspan fill="' + C_DIM + '">down</tspan>' +
    '<tspan fill="' + C_DIM + '">   </tspan>' +
    '<tspan fill="' + C_UP[0] + '">↑ </tspan>' +
    '<tspan fill="' + C_DIM + '">up</tspan>' +
    "</text>";
  return toDataUrl(svgWrap(g));
}

function pingColor(ms) {
  if (ms <= 0) return C_DIM;
  if (ms < 40) return Q_GOOD;
  if (ms < 100) return Q_OK;
  return Q_BAD;
}

/**
 * @param {{ms:number, maxMs?:number}} o
 */
function renderPing(o) {
  const cx = SIZE / 2, cy = SIZE / 2;
  const color = pingColor(o.ms);
  const maxMs = o.maxMs && o.maxMs > 0 ? o.maxMs : 200;
  const ratio = Math.min(Math.max(o.ms || 0, 0) / maxMs, 1);

  // Large ring; number sits low and tight above "ms" as a single visual block.
  let g = ring(cx, cy, 108, 20, ratio, [color], "");
  const label = o.ms > 0 ? String(Math.round(o.ms)) : "--";
  const numSize = label.length >= 4 ? 56 : label.length === 3 ? 68 : 80;
  g += text(cx, cy + 8, numSize, "#eef2ff", label, "bold");
  g += text(cx, cy + 52, 24, color, "ms", "600");
  return toDataUrl(svgWrap(g));
}

/** Centered status text (e.g. "testing", "loading"). */
function renderStatus(label, sub) {
  const cx = SIZE / 2, cy = SIZE / 2;
  let g = ring(cx, cy, 108, 14, 0, [C_DIM], "");
  g += text(cx, sub ? cy - 8 : cy, 34, "#eaf6ff", label, "bold");
  if (sub) g += text(cx, cy + 34, 20, C_DIM, sub, "600");
  return toDataUrl(svgWrap(g));
}

/**
 * Dual-gauge indeterminate loading. Outer (down) and inner (up) comets
 * chase opposite ways on the same tracks used by the final speed readout.
 *
 * @param {number} phase 0–1 animation phase (loops)
 * @param {{mode?: "speed"|"ping"}} [opts]
 */
function renderLoading(phase, opts) {
  const mode = (opts && opts.mode) || "speed";
  const cx = SIZE / 2, cy = SIZE / 2;
  const t = ((phase % 1) + 1) % 1;
  // Ease so the comet lingers a touch mid-arc (feels less mechanical).
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  let g = "";
  if (mode === "ping") {
    // Single ring: cyan→green comet + soft pulse length.
    const len = 0.22 + 0.12 * Math.sin(t * Math.PI * 2);
    g += ringComet(cx, cy, 108, 20, ease, len, C_DOWN, "gd");
    g += text(cx, cy + 8, 36, C_DIM, "···", "bold");
    g += text(cx, cy + 48, 20, C_DIM, "ping", "600");
  } else {
    // Match final speed layout: outer down / inner up, reverse chase.
    const outerR = 112;
    const innerR = 90;
    const stroke = 18;
    const lenOut = 0.28 + 0.08 * Math.sin(t * Math.PI * 2);
    const lenIn = 0.28 + 0.08 * Math.sin(t * Math.PI * 2 + Math.PI);
    g += ringComet(cx, cy, outerR, stroke, ease, lenOut, C_DOWN, "gd");
    g += ringComet(cx, cy, innerR, stroke, 1 - ease, lenIn, C_UP, "gu");

    // Soft center hint — no ugly "testing" label.
    g += text(cx, cy - 6, 28, C_DOWN[0], "↓", "bold");
    g += text(cx, cy + 28, 28, C_UP[0], "↑", "bold");
    g +=
      '<text x="' + cx + '" y="' + (cy + 108) +
      '" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" ' +
      'text-anchor="middle" dominant-baseline="central">' +
      '<tspan fill="' + C_DOWN[0] + '">↓ </tspan>' +
      '<tspan fill="' + C_DIM + '">down</tspan>' +
      '<tspan fill="' + C_DIM + '">   </tspan>' +
      '<tspan fill="' + C_UP[0] + '">↑ </tspan>' +
      '<tspan fill="' + C_DIM + '">up</tspan>' +
      "</text>";
  }
  return toDataUrl(svgWrap(g));
}

function renderError(label) {
  const cx = SIZE / 2, cy = SIZE / 2;
  let g = ring(cx, cy, 108, 18, 1, [Q_BAD], "");
  g += text(cx, cy - 10, 72, Q_BAD, "!", "bold");
  g += text(cx, cy + 42, 22, C_DIM, label || "offline", "600");
  return toDataUrl(svgWrap(g));
}

export { renderSpeed, renderPing, renderStatus, renderLoading, renderError };
