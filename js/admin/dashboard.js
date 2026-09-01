// ============================================================================
// admin/dashboard.js — orquestra o painel: guarda de auth + abas
// ============================================================================

import { $, $$ } from "../ui.js";
import { loadSettings } from "../store.js";
import { guard } from "./auth.js";
import { initOrders, stopOrders } from "./orders.js";
import { initProducts, stopProducts } from "./products.js";
import { initSettings, stopSettings } from "./settings.js";
import { initCoupons, stopCoupons } from "./coupons.js";
import { seedSampleMenu } from "./seed.js";

const TABS = {
  orders: { init: initOrders, stop: stopOrders },
  products: { init: initProducts, stop: stopProducts },
  settings: { init: initSettings, stop: stopSettings },
  coupons: { init: initCoupons, stop: stopCoupons },
};

let active = null;
let started = false;

function showTab(name) {
  if (active === name) return;
  if (active) TABS[active].stop?.();
  active = name;

  $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  $$("[data-tab]").forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("text-brand-600", on);
    b.classList.toggle("text-charcoal-400", !on);
    b.querySelector(".tab-dot")?.classList.toggle("bg-brand-600", on);
  });
  TABS[name].init?.();
  location.hash = name;
}

function startApp() {
  if (started) return;
  started = true;

  loadSettings().catch((e) => console.warn("settings:", e));

  $$("[data-tab]").forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });
  $("#seedBtn")?.addEventListener("click", seedSampleMenu);

  const initial = (location.hash || "#orders").slice(1);
  showTab(TABS[initial] ? initial : "orders");
}

function stopApp() {
  if (active) TABS[active].stop?.();
  active = null;
  started = false;
}

guard({ onIn: startApp, onOut: stopApp });
