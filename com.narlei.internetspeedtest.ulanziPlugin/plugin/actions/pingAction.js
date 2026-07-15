/**
 * pingAction.js — one instance per key running the Ping action.
 *
 * Ping does NOT use speedtest-go: its ping-only mode has a ~30s stall, and we
 * can get the true RTT far faster from Cloudflare's `Server-Timing: cfL4`
 * header (min_rtt), read with Node's global fetch (no CORS in Node, so all
 * headers are readable). Verified ~6 ms in under a second.
 */

import { renderPing, renderLoading, renderError } from "./gauge.js";

const CF_DOWN = "https://speed.cloudflare.com/__down";

async function measurePing(samples) {
  const n = samples || 6;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const url = CF_DOWN + "?bytes=0&t=" + Date.now() + "_" + i;
    const res = await fetch(url, { cache: "no-store" });
    const header = res.headers.get("server-timing");
    await res.arrayBuffer();
    let ms = null;
    if (header) {
      const m = /min_rtt=(\d+)/.exec(header) || /[?&;]rtt=(\d+)/.exec(header);
      if (m) ms = parseInt(m[1], 10) / 1000; // microseconds -> ms
    }
    if (ms == null) continue;
    if (ms > 0 && ms < best) best = ms;
  }
  if (best === Infinity) throw new Error("ping failed");
  return best;
}

export default class PingAction {
  constructor(context, $UD) {
    this.context = context;
    this.$UD = $UD;
    this.config = { interval: "0", maxMs: 200 };
    this.last = 0;
    this.running = false;
    this.allowSend = true;
    this.autoTimer = null;
    this.anim = null;
    this.lastIcon = null;
    this.draw(this.pingIcon(0));
  }

  pingIcon(ms) {
    return renderPing({ ms: ms, maxMs: Number(this.config.maxMs) || 200 });
  }

  draw(url) {
    this.lastIcon = url;
    if (this.allowSend) this.$UD.setBaseDataIcon(this.context, url);
  }

  async run(jsn) {
    if (jsn && jsn.param) this.setParams(jsn.param);
    if (this.running) return;
    this.running = true;
    this.clearAuto();

    let phase = 0;
    this.draw(renderLoading(phase, { mode: "ping" }));
    this.anim = setInterval(() => {
      phase = (phase + 0.06) % 1;
      this.draw(renderLoading(phase, { mode: "ping" }));
    }, 80);

    try {
      const ms = await measurePing(6);
      this.last = ms;
      this.stopAnim();
      this.draw(this.pingIcon(ms));
      this.scheduleAuto();
    } catch (e) {
      this.stopAnim();
      this.draw(renderError("offline"));
    } finally {
      this.running = false;
    }
  }

  stopAnim() {
    if (this.anim) {
      clearInterval(this.anim);
      this.anim = null;
    }
  }

  /**
   * Parse auto-run interval to ms.
   * New format: "5s", "30s", "1m", "15m", "60m".
   * Legacy bare numbers (5, 15, 30, 60) are treated as minutes.
   */
  intervalMs() {
    const raw = String(this.config.interval || "0").trim().toLowerCase();
    if (!raw || raw === "0") return 0;
    const m = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(raw);
    if (!m) return 0;
    const n = Number(m[1]);
    if (!(n > 0)) return 0;
    const unit = m[2] || "m"; // bare number = minutes (legacy)
    return unit === "s" ? n * 1000 : n * 60 * 1000;
  }

  scheduleAuto() {
    this.clearAuto();
    const ms = this.intervalMs();
    if (ms > 0) this.autoTimer = setTimeout(() => this.run(), ms);
  }

  clearAuto() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  setParams(param) {
    if (!param) return;
    if (Object.prototype.hasOwnProperty.call(param, "interval")) this.config.interval = String(param.interval);
    if (Object.prototype.hasOwnProperty.call(param, "maxMs")) this.config.maxMs = Number(param.maxMs) || 200;
    if (!this.running) this.draw(this.pingIcon(this.last));
  }

  setActive(active) {
    this.allowSend = !(active && active.toString() === "false");
    if (this.allowSend && this.lastIcon) this.$UD.setBaseDataIcon(this.context, this.lastIcon);
  }

  clear() {
    this.stopAnim();
    this.clearAuto();
  }
}
