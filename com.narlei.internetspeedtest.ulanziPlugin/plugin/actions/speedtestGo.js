/**
 * speedtestGo.js — thin wrapper around the native `speedtest-go` binary (a real
 * Ookla-network client). This is the reliable way to measure: browser `fetch`
 * against Cloudflare under-saturates the link, while speedtest-go with many
 * threads reaches line rate (verified: 837 Mbps down / 414 Mbps up on a link
 * where the fetch method read 83 / 22).
 *
 * The darwin-arm64 binary is bundled under plugin/bin; other platforms are
 * downloaded from the speedtest-go GitHub release on first use.
 */

import { spawn, execFile } from "child_process";
import fs from "fs";
import path from "path";

const VERSION = "1.7.10";

// process.platform + process.arch -> release package suffix.
const PLATFORM_PKG = {
  "darwin-arm64": "Darwin_arm64",
  "darwin-x64": "Darwin_x86_64",
  "win32-x64": "Windows_x86_64",
  "win32-ia32": "Windows_i386",
  "win32-arm64": "Windows_arm64",
  "linux-x64": "Linux_x86_64",
  "linux-arm64": "Linux_arm64",
};

export default class SpeedtestGo {
  constructor(pluginRoot) {
    this.pluginRoot = pluginRoot;
    this.binName = process.platform === "win32" ? "speedtest-go.exe" : "speedtest-go";
    this.binDir = path.join(pluginRoot, "plugin", "bin");
    this.binPath = path.join(this.binDir, this.binName);
    this.proc = null;
  }

  binExists() {
    try {
      fs.accessSync(this.binPath, fs.constants.X_OK);
      return true;
    } catch (e) {
      return false;
    }
  }

  exec(cmd, args) {
    return new Promise(function (resolve, reject) {
      execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, function (err, stdout) {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }

  /** Ensure the binary exists (bundled or downloaded). Returns its path. */
  async ensureBinary() {
    if (this.binExists()) return this.binPath;

    const key = process.platform + "-" + process.arch;
    const pkg = PLATFORM_PKG[key];
    if (!pkg) throw new Error("unsupported platform " + key);

    const tarName = "speedtest-go_" + VERSION + "_" + pkg + ".tar.gz";
    const url =
      "https://github.com/showwin/speedtest-go/releases/download/v" + VERSION + "/" + tarName;
    fs.mkdirSync(this.binDir, { recursive: true });
    const tarPath = path.join(this.binDir, tarName);

    // curl + tar exist on macOS, Windows 10+ and Linux.
    await this.exec("curl", ["-fsSL", "-o", tarPath, url]);
    await this.exec("tar", ["-xzf", tarPath, "-C", this.binDir]);
    try { fs.chmodSync(this.binPath, 0o755); } catch (e) {}
    try { fs.unlinkSync(tarPath); } catch (e) {}

    if (!this.binExists()) throw new Error("binary install failed");
    return this.binPath;
  }

  /**
   * Run a measurement.
   * @param {{serverId?:string|number, threads?:number, noDownload?:boolean, noUpload?:boolean}} opts
   * @returns {Promise<{download:number|null, upload:number|null, ping:number, server:string}>}
   *          download/upload in Mbps, ping in ms.
   */
  async run(opts) {
    const o = opts || {};
    const bin = await this.ensureBinary();

    const args = ["--json", "-t", String(o.threads || 32)];
    if (o.serverId) args.push("-s", String(o.serverId));
    if (o.noDownload) args.push("--no-download");
    if (o.noUpload) args.push("--no-upload");

    const self = this;
    return new Promise(function (resolve, reject) {
      if (self.proc) {
        try { self.proc.kill(); } catch (e) {}
      }
      let out = "";
      self.proc = spawn(bin, args);
      self.proc.stdout.on("data", function (d) { out += d.toString(); });
      self.proc.on("error", reject);
      self.proc.on("close", function () {
        self.proc = null;
        try {
          const json = JSON.parse(out);
          const s = json.servers && json.servers[0];
          if (!s) return reject(new Error("no result"));
          resolve({
            // dl_speed/ul_speed are bytes/s; latency is nanoseconds.
            download: o.noDownload ? null : (s.dl_speed * 8) / 1e6,
            upload: o.noUpload ? null : (s.ul_speed * 8) / 1e6,
            ping: s.latency / 1e6,
            server: s.name || "",
          });
        } catch (e) {
          reject(new Error("parse: " + e.message));
        }
      });
    });
  }

  kill() {
    if (this.proc) {
      try { this.proc.kill(); } catch (e) {}
      this.proc = null;
    }
  }
}
