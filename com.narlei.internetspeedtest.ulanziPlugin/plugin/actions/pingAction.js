/**
 * pingAction.js — one instance per key running the Ping action.
 *
 * Ping does NOT use speedtest-go: its ping-only mode has a ~30s stall, and we
 * can get the true RTT far faster from Cloudflare's `Server-Timing: cfL4`
 * header (min_rtt), read with Node's global fetch (no CORS in Node, so all
 * headers are readable). Verified ~6 ms in under a second.
 */

import { renderPing, renderStatus, renderError } from "./gauge.js";

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
    this.draw(renderStatus("ping", "..."));

    try {
      const ms = await measurePing(6);
      this.last = ms;
      this.draw(this.pingIcon(ms));
      this.scheduleAuto();
    } catch (e) {
      this.draw(renderError("offline"));
    } finally {
      this.running = false;
    }
  }

  scheduleAuto() {
    this.clearAuto();
    const min = Number(this.config.interval);
    if (min > 0) this.autoTimer = setTimeout(() => this.run(), min * 60 * 1000);
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
    this.clearAuto();
  }
}
