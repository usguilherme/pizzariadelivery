// ============================================================================
// ui.js — helpers de UI compartilhados (formatação, toasts, DOM)
// ============================================================================

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata número como moeda brasileira. */
export const formatBRL = (n) => BRL.format(Number(n || 0));

/** Converte "12,50" ou "12.50" ou 12.5 em Number. */
export function parseMoney(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return Number(String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
}

/** querySelector curto. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Cria elemento com atributos e filhos. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Escapa texto para uso seguro em innerHTML. */
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---- Toasts ---------------------------------------------------------------
let toastHost;
export function toast(message, type = "info", ms = 3200) {
  if (!toastHost) {
    toastHost = el("div", { class: "toast-host", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const colors = {
    info: "bg-charcoal-800 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    warn: "bg-amber-500 text-charcoal-900",
  };
  const t = el("div", {
    class: `toast ${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg text-sm font-medium`,
  }, message);
  toastHost.append(t);
  requestAnimationFrame(() => t.classList.add("toast--in"));
  setTimeout(() => {
    t.classList.remove("toast--in");
    setTimeout(() => t.remove(), 250);
  }, ms);
}

// ---- Bottom sheet --------------------------------------------------------
/**
 * Abre um bottom-sheet modal. Retorna { close }.
 * @param {Node|string} content
 * @param {{title?:string, onClose?:Function}} opts
 */
export function openSheet(content, opts = {}) {
  const backdrop = el("div", { class: "sheet-backdrop" });
  const sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true" });

  const header = el("div", { class: "sheet__header" }, [
    el("div", { class: "sheet__grip" }),
    opts.title ? el("h2", { class: "sheet__title" }, opts.title) : null,
    el("button", { class: "sheet__close", "aria-label": "Fechar", onclick: () => close() }, "✕"),
  ]);
  const body = el("div", { class: "sheet__body" });
  if (typeof content === "string") body.innerHTML = content;
  else body.append(content);

  sheet.append(header, body);
  backdrop.append(sheet);
  document.body.append(backdrop);
  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    backdrop.classList.add("sheet-backdrop--in");
    sheet.classList.add("sheet--in");
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.remove("sheet-backdrop--in");
    sheet.classList.remove("sheet--in");
    setTimeout(() => {
      backdrop.remove();
      document.body.style.overflow = "";
      opts.onClose?.();
    }, 260);
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  return { close, body };
}

/** Confirmação simples (promise<boolean>). */
export function confirmSheet(message, { okText = "Confirmar", cancelText = "Cancelar" } = {}) {
  return new Promise((resolve) => {
    const wrap = el("div", { class: "space-y-4" });
    wrap.append(
      el("p", { class: "text-charcoal-700" }, message),
      el("div", { class: "flex gap-3" }, [
        el("button", {
          class: "flex-1 py-3 rounded-xl bg-charcoal-100 font-semibold",
          onclick: () => { sheet.close(); resolve(false); },
        }, cancelText),
        el("button", {
          class: "flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold",
          onclick: () => { sheet.close(); resolve(true); },
        }, okText),
      ]),
    );
    const sheet = openSheet(wrap, { title: "Confirmar", onClose: () => resolve(false) });
  });
}

/** Debounce utilitário. */
export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Gera um código curto para o pedido, ex. "A1B2". */
export function shortCode(len = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
