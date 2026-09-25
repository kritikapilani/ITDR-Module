import { e } from "./core.js";
import { App } from "./App.js";

function boot() {
  if (!window.React || !window.ReactDOM) {
    document.getElementById("root").innerHTML =
      "<div class='card empty'>React did not load from the CDN. Check network access to unpkg.com, then refresh.</div>";
    return;
  }
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(e(App));
}

boot();
