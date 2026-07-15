/**
 * app.js — Node entry point for the Internet Speed Test plugin.
 *
 * Runs as a Node process (manifest CodePath is a .js, so Ulanzi spawns
 * `node app.js <address> <port> <language>`). Connects to the host over
 * WebSocket via the ulanzideck-api SDK and routes events to per-key action
 * instances. Two action types, distinguished by the action UUID:
 *   com.narlei.internetspeedtest.speedtest -> SpeedAction (speedtest-go)
 *   com.narlei.internetspeedtest.ping      -> PingAction (Cloudflare cfL4)
 */

import { UlanzideckApi, Utils } from "./actions/ulanzideck-api/index.js";
import SpeedtestGo from "./actions/speedtestGo.js";
import SpeedAction from "./actions/speedAction.js";
import PingAction from "./actions/pingAction.js";

const ACTION_CACHES = {};
const $UD = new UlanzideckApi();

$UD.connect("com.narlei.internetspeedtest");
$UD.onConnected(() => {});

const pluginRoot = Utils.getPluginPath();

// Warm up: make sure the native binary is present before the first press.
new SpeedtestGo(pluginRoot).ensureBinary().catch((e) => {
  console.error("[speedtest] binary warmup failed:", e && e.message);
});

function createInstance(jsn) {
  const uuid = jsn.uuid || "";
  if (uuid.indexOf("ping") !== -1) return new PingAction(jsn.context, $UD);
  return new SpeedAction(jsn.context, $UD, new SpeedtestGo(pluginRoot));
}

// A key was assigned this action.
$UD.onAdd((jsn) => {
  const ctx = jsn.context;
  if (!ACTION_CACHES[ctx]) {
    ACTION_CACHES[ctx] = createInstance(jsn);
    if (jsn.param) ACTION_CACHES[ctx].setParams(jsn.param);
  }
});

// Visibility / active state.
$UD.onSetActive((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst) inst.setActive(jsn.active);
});

// Key pressed -> run.
$UD.onRun((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (!inst) $UD.emit("add", jsn);
  else inst.run(jsn);
});

// Key removed / reassigned -> tear down.
$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (let i = 0; i < jsn.param.length; i++) {
    const ctx = jsn.param[i].context;
    const inst = ACTION_CACHES[ctx];
    if (inst) {
      inst.clear();
      delete ACTION_CACHES[ctx];
    }
  }
});

// Settings changed from the host or the property inspector.
$UD.onParamFromApp((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst) inst.setParams(jsn.param);
});
$UD.onParamFromPlugin((jsn) => {
  const inst = ACTION_CACHES[jsn.context];
  if (inst) inst.setParams(jsn.param);
});
