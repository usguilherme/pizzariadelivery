// ============================================================================
// admin/orders.js — painel de pedidos em tempo real (onSnapshot)
// ============================================================================

import {
  db, collection, query, orderBy, onSnapshot, doc, updateDoc,
} from "../firebase-config.js";
import { $, el, formatBRL, openSheet, toast, confirmSheet, escapeHtml, segmented } from "../ui.js";
import { state, SIZE_LABELS } from "../store.js";
import { buildOrderMessage, whatsappUrl } from "../whatsapp.js";
import { printOrder, connectPrinter, isPrinterConnected, bluetoothSupported } from "./printer.js";

const FLOW = ["pending", "accepted", "preparing", "delivering", "done"];
const LABELS = {
  pending: "Novo", accepted: "Aceito", preparing: "Em preparo",
  delivering: "Saiu p/ entrega", done: "Concluído", canceled: "Cancelado",
};
const NEXT_LABEL = {
  pending: "Aceitar", accepted: "Iniciar preparo", preparing: "Despachar", delivering: "Concluir",
};

let orders = [];
let unsub = null;
let knownIds = new Set();
let firstLoad = true;
let filter = "active"; // active | done | canceled | all

export function initOrders() {
  renderControls();
  subscribe();
}

export function stopOrders() {
  unsub?.();
  unsub = null;
}

function subscribe() {
  stopOrders();
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  unsub = onSnapshot(q, (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!firstLoad) {
      for (const o of orders) {
        if (!knownIds.has(o.id) && o.status === "pending") notifyNew(o);
      }
    }
    knownIds = new Set(orders.map((o) => o.id));
    firstLoad = false;
    render();
  }, (err) => {
    console.error(err);
    $("#ordersRoot").innerHTML = `<p class="text-red-600 p-4">Erro ao carregar pedidos: ${escapeHtml(err.message)}</p>`;
  });
}

// ---- Notificação de novo pedido --------------------------------
let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    o.start(); o.stop(audioCtx.currentTime + 0.4);
  } catch { /* */ }
}
function notifyNew(o) {
  beep();
  toast(`🔔 Novo pedido #${o.code} — ${formatBRL(o.total)}`, "success", 6000);
  if (Notification?.permission === "granted") {
    new Notification(`Novo pedido #${o.code}`, { body: `${o.customer.name} — ${formatBRL(o.total)}` });
  }
  document.title = "🔔 Novo pedido!";
  setTimeout(() => (document.title = "Painel · Pizzaria Delivery"), 8000);
}

// ---- Controles -------------------------------------------------
function renderControls() {
  const bar = $("#ordersControls");
  bar.innerHTML = "";

  const filterCtl = segmented(
    [["active", "Ativos"], ["done", "Concluídos"], ["canceled", "Cancelados"], ["all", "Todos"]],
    filter,
    (val) => { filter = val; render(); },
    { wrap: true },
  );
  filterCtl.node.classList.add("flex-1", "min-w-[220px]");
  bar.append(filterCtl.node);

  const btnWrap = el("div", { class: "flex gap-2" });
  if (bluetoothSupported()) {
    btnWrap.append(el("button", {
      type: "button",
      class: `btn btn-sm ${isPrinterConnected() ? "btn-success" : "btn-dark"}`,
      onclick: () => connectPrinter().then(renderControls),
    }, isPrinterConnected() ? "🖨️ Conectada" : "🖨️ Conectar"));
  }
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    btnWrap.append(el("button", {
      type: "button",
      class: "btn btn-outline btn-sm",
      onclick: () => Notification.requestPermission().then(renderControls),
    }, "🔔 Avisos"));
  }
  bar.append(btnWrap);
}

// ---- Render ----------------------------------------------------
function render() {
  renderControls();
  const root = $("#ordersRoot");
  const list = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return FLOW.includes(o.status) && o.status !== "done";
    if (filter === "done") return o.status === "done";
    if (filter === "canceled") return o.status === "canceled";
    return true;
  });

  // Contadores como chips
  const counts = { pending: 0, accepted: 0, preparing: 0, delivering: 0 };
  for (const o of orders) if (counts[o.status] != null) counts[o.status]++;
  const summary = $("#ordersSummary");
  summary.innerHTML = "";
  summary.className = "flex flex-wrap gap-1.5 mb-3";
  for (const st of FLOW.slice(0, 4)) {
    summary.append(el("span", {
      class: `text-[11px] font-bold px-2.5 py-1 rounded-full ${counts[st] ? badgeCls(st) : "bg-charcoal-100 text-charcoal-400"}`,
    }, `${counts[st]} ${LABELS[st]}`));
  }

  if (!list.length) {
    root.innerHTML = `<p class="text-center text-charcoal-400 py-16 text-sm">Nenhum pedido ${filter === "active" ? "ativo" : ""}.</p>`;
    return;
  }

  root.innerHTML = "";
  for (const o of list) root.append(orderCard(o));
}

function orderCard(o) {
  const isNew = o.status === "pending";
  const card = el("div", {
    class: `relative card ${o.status === "done" || o.status === "canceled" ? "opacity-80" : ""} ${isNew ? "pulse-ring border-brand-300" : ""} p-3.5 pl-4 space-y-2`,
  });
  card.append(el("span", { class: `status-rail rail-${o.status}` }));

  card.append(el("div", { class: "flex items-start justify-between gap-2" }, [
    el("div", { class: "min-w-0" }, [
      el("div", { class: "flex items-center gap-2 flex-wrap" }, [
        el("span", { class: "font-display font-extrabold text-lg" }, `#${o.code}`),
        el("span", { class: `text-[10px] font-extrabold px-2 py-0.5 rounded-full ${badgeCls(o.status)}` }, LABELS[o.status] || o.status),
        el("span", { class: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-charcoal-100 text-charcoal-600" },
          o.fulfillment === "delivery" ? "🛵 Entrega" : "🏪 Retirada"),
      ]),
      el("p", { class: "text-xs text-charcoal-500 mt-0.5" }, `${o.customer.name} · ${fmtTime(o.createdAt)}`),
    ]),
    el("span", { class: "font-display font-extrabold text-brand-700 shrink-0" }, formatBRL(o.total)),
  ]));

  card.append(el("ul", { class: "text-[13px] text-charcoal-700 space-y-0.5" },
    o.items.map((it) => el("li", {}, `${it.qty}× ${it.type === "pizza"
      ? `Pizza ${it.size} ${it.flavors.map((f) => f.name).join("/")}`
      : it.name}${it.border ? ` (borda ${it.border.name})` : ""}`))
  ));

  const actions = el("div", { class: "flex flex-wrap gap-2 pt-1" });
  actions.append(el("button", {
    type: "button", class: "btn btn-outline btn-sm", onclick: () => openDetail(o),
  }, "Detalhes"));
  actions.append(el("button", {
    type: "button", class: "btn btn-outline btn-sm", onclick: () => printOrder(o, state.settings),
  }, "🖨️"));
  actions.append(el("a", {
    href: whatsappUrl(o.customer.phone, `Olá ${o.customer.name}! Sobre seu pedido #${o.code}...`),
    target: "_blank", rel: "noopener",
    class: "btn btn-sm bg-emerald-100 text-emerald-700",
  }, "WhatsApp"));

  const next = nextStatus(o);
  if (next) {
    actions.append(el("button", {
      type: "button", class: "btn btn-primary btn-sm ml-auto",
      onclick: () => setStatus(o, next),
    }, NEXT_LABEL[o.status] || "Avançar"));
  }
  if (o.status !== "canceled" && o.status !== "done") {
    actions.append(el("button", {
      type: "button", class: "btn btn-ghost btn-sm text-red-600",
      onclick: async () => { if (await confirmSheet(`Cancelar o pedido #${o.code}?`, { danger: true, okText: "Cancelar pedido" })) setStatus(o, "canceled"); },
    }, "Cancelar"));
  }
  card.append(actions);
  return card;
}

function nextStatus(o) {
  if (o.status === "done" || o.status === "canceled") return null;
  const i = FLOW.indexOf(o.status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

async function setStatus(o, status) {
  try {
    await updateDoc(doc(db, "orders", o.id), { status });
    toast(`Pedido #${o.code} → ${LABELS[status]}`, "info");
  } catch (e) {
    console.error(e);
    toast("Não foi possível atualizar o status.", "error");
  }
}

function openDetail(o) {
  const s = state.settings;
  const a = o.address || {};
  const wrap = el("div", { class: "space-y-3 text-sm" });
  wrap.append(
    row("Pedido", `#${o.code} · ${LABELS[o.status]}`),
    row("Cliente", `${o.customer.name} — ${o.customer.phone}`),
    row("Quando", fmtFull(o.createdAt)),
    row("Tipo", o.fulfillment === "delivery" ? "Entrega" : "Retirada"),
  );
  if (o.fulfillment === "delivery") {
    wrap.append(row("Endereço",
      `${a.street}, ${a.number}${a.complement ? " — " + a.complement : ""} · ${a.district}${a.reference ? " · " + a.reference : ""}`));
  }
  wrap.append(el("hr", { class: "divider" }));
  for (const it of o.items) {
    wrap.append(el("div", { class: "flex justify-between gap-2" }, [
      el("span", {}, `${it.qty}× ${it.type === "pizza" ? `Pizza ${it.size} (${SIZE_LABELS[it.size]}) — ${it.flavors.map((f) => f.name).join(" / ")}` : it.name}${it.border ? ` + borda ${it.border.name}` : ""}${it.extras?.length ? " + " + it.extras.map((e) => e.name).join(", ") : ""}${it.notes ? ` · ${it.notes}` : ""}`),
      el("span", { class: "font-semibold shrink-0" }, formatBRL(it.lineTotal)),
    ]));
  }
  wrap.append(el("hr", { class: "divider" }));
  wrap.append(
    row("Subtotal", formatBRL(o.subtotal)),
    o.discount > 0 ? row("Desconto" + (o.couponCode ? ` (${o.couponCode})` : ""), "-" + formatBRL(o.discount)) : null,
    o.fulfillment === "delivery" ? row("Entrega", o.deliveryFee > 0 ? formatBRL(o.deliveryFee) : "a combinar") : null,
    row("Total", formatBRL(o.total)),
    row("Pagamento", ({ pix: "PIX", card: "Cartão", cash: "Dinheiro" })[o.payment.method] + (o.payment.method === "cash" && o.payment.changeFor ? ` · troco p/ ${formatBRL(o.payment.changeFor)}` : "")),
    o.notes ? row("Obs.", o.notes) : null,
  );

  wrap.append(el("div", { class: "flex gap-2 pt-2" }, [
    el("button", { type: "button", class: "btn btn-outline flex-1", onclick: () => printOrder(o, s) }, "🖨️ Imprimir"),
    el("a", {
      href: whatsappUrl(s.whatsapp, buildOrderMessage(o, s)),
      target: "_blank", rel: "noopener",
      class: "btn btn-success flex-1",
    }, "Reenviar resumo"),
  ]));

  openSheet(wrap, { title: `Pedido #${o.code}` });
}

// ---- helpers -------------------------------------------------
function row(k, v) {
  if (v == null) return null;
  return el("div", { class: "flex justify-between gap-3" }, [
    el("span", { class: "text-charcoal-500" }, k),
    el("span", { class: "font-medium text-right" }, v),
  ]);
}
function badgeCls(s) {
  return {
    pending: "bg-brand-600 text-white",
    accepted: "bg-blue-100 text-blue-700",
    preparing: "bg-amber-100 text-amber-700",
    delivering: "bg-purple-100 text-purple-700",
    done: "bg-emerald-100 text-emerald-700",
    canceled: "bg-charcoal-200 text-charcoal-600",
  }[s] || "bg-charcoal-100 text-charcoal-600";
}
function fmtTime(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date();
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtFull(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date();
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
