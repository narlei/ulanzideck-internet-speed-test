/**
 * speedAction.js — one instance per key running the Speed Test action.
 * Runs the native speedtest-go binary and renders the concentric neon rings.
 */

import { renderSpeed, renderStatus, renderError } from "./gauge.js";

export default class SpeedAction {
  constructor(context, $UD, speedtestGo) {
    this.context = context;
    this.$UD = $UD;
    this.st = speedtestGo; // shared SpeedtestGo instance
    this.config = { unit: "Mbps", downMax: 0, upMax: 0, interval: "0" };
    this.last = { download: 0, upload: 0 };
    this.running = false;
    this.allowSend = true;
    this.autoTimer = null;
    this.anim = null;
    this.lastIcon = null;
    this.draw(renderSpeed(this.speedOpts()));
  }

  draw(url) {
    this.lastIcon = url;
    if (this.allowSend) this.$UD.setBaseDataIcon(this.context, url);
  }

  speedOpts() {
    const conv = this.config.unit === "MBps" ? function (v) { return v / 8; } : function (v) { return v; };
    return {
      download: conv(this.last.download || 0),
      upload: conv(this.last.upload || 0),
      unit: this.config.unit,
      downMax: this.config.downMax ? conv(this.config.downMax) : 0,
      upMax: this.config.upMax ? conv(this.config.upMax) : 0,
    };
  }

  async run(jsn) {
    if (jsn && jsn.param) this.setParams(jsn.param);
    if (this.running) return; // never overlap
    this.running = true;
    this.clearAuto();

    let dots = 0;
    this.draw(renderStatus("testing", ""));
    this.anim = setInterval(() => {
      dots = (dots + 1) % 4;
      this.draw(renderStatus("testing", ".".repeat(dots)));
    }, 800);

    try {
      const r = await this.st.run({ threads: 32 });
      this.last = { download: r.download, upload: r.upload };
      this.stopAnim();
      this.draw(renderSpeed(this.speedOpts()));
      this.scheduleAuto();
    } catch (e) {
      this.stopAnim();
      const msg = (e && e.message ? e.message : "offline").slice(0, 20);
      this.draw(renderError(msg));
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

  scheduleAuto() {
    this.clearAuto();
    const min = Number(this.config.interval);
    if (min > 0) {
      this.autoTimer = setTimeout(() => this.run(), min * 60 * 1000);
    }
  }

  clearAuto() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  setParams(param) {
    if (!param) return;
    if (param.unit) this.config.unit = param.unit;
    if (Object.prototype.hasOwnProperty.call(param, "downMax")) this.config.downMax = Number(param.downMax) || 0;
    if (Object.prototype.hasOwnProperty.call(param, "upMax")) this.config.upMax = Number(param.upMax) || 0;
    if (Object.prototype.hasOwnProperty.call(param, "interval")) this.config.interval = String(param.interval);
    if (!this.running) this.draw(renderSpeed(this.speedOpts()));
  }

  setActive(active) {
    this.allowSend = !(active && active.toString() === "false");
    if (this.allowSend && this.lastIcon) this.$UD.setBaseDataIcon(this.context, this.lastIcon);
  }

  clear() {
    this.stopAnim();
    this.clearAuto();
    if (this.st) this.st.kill();
  }
}
