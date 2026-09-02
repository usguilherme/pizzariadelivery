// ============================================================================
// ui.js — helpers de UI compartilhados (formatação, toasts, DOM, sheet)
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

/** SVG inline de ícone (stroke currentColor). */
export function icon(name, cls = "w-4 h-4") {
  const paths = {
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    star: '<path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3.5 11.5 3-8h2l1.5 3M6 17.5 12 9"/>',
    store: '<path d="m2 7 2-4h16l2 4M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7M2 7h20"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
  };
  return `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
}

/** Fallback visual para produto sem imagem (gradiente + inicial). */
export function mediaFallback(label = "🍕") {
  const initial = /^[a-zà-ú]/i.test(label) ? label.trim().charAt(0).toUpperCase() : label;
  return el("div", { class: "media-fallback" }, [el("span", {}, initial)]);
}

/**
 * Segmented control. options: [[value, label, emoji?], …]
 * onChange(value) chamado a cada seleção. Retorna { node, get, set }.
 */
export function segmented(options, value, onChange, { wrap = false } = {}) {
  let cur = value;
  const node = el("div", { class: `segmented${wrap ? " segmented--wrap" : ""}` });
  const buttons = new Map();
  const paint = () => buttons.forEach((btn, val) => btn.setAttribute("aria-pressed", String(val === cur)));
  for (const [val, label, emoji] of options) {
    const btn = el("button", {
      type: "button",
      onclick: () => { cur = val; paint(); onChange?.(val); },
    }, [
      emoji ? el("span", { class: "seg-emoji" }, emoji) : null,
      el("span", {}, label),
    ]);
    buttons.set(val, btn);
    node.append(btn);
  }
  paint();
  return { node, get: () => cur, set: (v) => { cur = v; paint(); } };
}

/** Cabeçalho de passo numerado (builder). */
export function stepHead(num, title, meta) {
  return el("div", { class: "step__head" }, [
    num != null ? el("span", { class: "step__num" }, String(num)) : null,
    el("span", { class: "step__title" }, title),
    meta ? el("span", { class: "step__meta" }, meta) : null,
  ]);
}

// ---- Toasts ---------------------------------------------------------------
let toastHost;
export function toast(message, type = "info", ms = 3200) {
  if (!toastHost) {
    toastHost = el("div", { class: "toast-host", "aria-live": "polite" });
    document.body.append(toastHost);
  }
  const t = el("div", { class: `toast toast--${type}` }, [
    el("span", { class: "toast__dot" }),
    el("span", {}, message),
  ]);
  toastHost.append(t);
  requestAnimationFrame(() => t.classList.add("toast--in"));
  setTimeout(() => {
    t.classList.remove("toast--in");
    setTimeout(() => t.remove(), 250);
  }, ms);
}

// ---- Bottom sheet --------------------------------------------------------
/**
 * Abre um bottom-sheet modal. Retorna { close, body }.
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
    }, 300);
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  return { close, body };
}

/** Confirmação simples (promise<boolean>). */
export function confirmSheet(message, { okText = "Confirmar", cancelText = "Cancelar", danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = el("div", { class: "space-y-4" });
    wrap.append(
      el("p", { class: "text-charcoal-700 text-sm" }, message),
      el("div", { class: "flex gap-3" }, [
        el("button", {
          class: "btn btn-outline flex-1",
          onclick: () => { sheet.close(); resolve(false); },
        }, cancelText),
        el("button", {
          class: `btn flex-1 ${danger ? "btn-solid" : "btn-primary"}`,
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
