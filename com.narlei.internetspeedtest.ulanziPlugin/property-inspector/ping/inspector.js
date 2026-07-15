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

function hydrate(params) {
  if (!params || JSON.stringify(params) === "{}") return;
  ACTION_SETTING = Object.assign(ACTION_SETTING, params);
  Utils.setFormValue(ACTION_SETTING, form);
}
