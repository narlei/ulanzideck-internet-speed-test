let ACTION_SETTING = { interval: "0", maxMs: 200 };
let form = "";

$UD.connect();

$UD.onConnected(() => {
  form = document.querySelector("#property-inspector");

  const el = document.querySelector(".uspi-wrapper");
  el.classList.remove("hidden");

  form.addEventListener(
    "input",
    Utils.debounce(() => {
      ACTION_SETTING = Utils.getFormValue(form);
      $UD.sendParamFromPlugin(ACTION_SETTING);
    })
  );
});

$UD.onAdd((jsn) => {
  if (jsn && jsn.param) hydrate(jsn.param);
});
$UD.onParamFromApp((jsn) => {
  if (jsn && jsn.param) hydrate(jsn.param);
});

// Legacy bare-minute values (5/15/30/60) → new "Nm" form so the select matches.
function normalizeInterval(v) {
  if (v == null || v === "" || v === "0") return "0";
  const s = String(v).trim().toLowerCase();
  if (/^\d+(?:\.\d+)?[sm]$/.test(s)) return s;
  if (/^\d+(?:\.\d+)?$/.test(s) && Number(s) > 0) return s + "m";
  return "0";
}

function hydrate(params) {
  if (!params || JSON.stringify(params) === "{}") return;
  ACTION_SETTING = Object.assign(ACTION_SETTING, params);
  if (Object.prototype.hasOwnProperty.call(ACTION_SETTING, "interval")) {
    ACTION_SETTING.interval = normalizeInterval(ACTION_SETTING.interval);
  }
  Utils.setFormValue(ACTION_SETTING, form);
}
