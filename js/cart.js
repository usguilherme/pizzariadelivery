// ============================================================================
// cart.js — carrinho do cliente (localStorage) + precificação de itens
// ============================================================================

import { state } from "./store.js";

const KEY = "pd_cart_v1";
const listeners = new Set();

/** @type {Array<CartItem>} */
let items = load();

/**
 * @typedef {Object} CartItem
 * @property {string} uid            id local da linha
 * @property {string} productId
 * @property {string} name           nome exibido (ex.: "Pizza G — Calabresa / Portuguesa")
 * @property {"pizza"|"simple"} type
 * @property {string|null} size
 * @property {Array<{name:string, price:number}>} flavors
 * @property {{name:string, price:number}|null} border
 * @property {Array<{name:string, price:number}>} extras
 * @property {number} qty
 * @property {string} notes
 * @property {number} unitPrice
 * @property {number} lineTotal
 */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch { /* modo privado */ }
  listeners.forEach((fn) => fn(items));
}

export function onCartChange(fn) {
  listeners.add(fn);
  fn(items);
  return () => listeners.delete(fn);
}

export const getItems = () => items.slice();
export const count = () => items.reduce((n, it) => n + it.qty, 0);
export const subtotal = () => items.reduce((n, it) => n + it.lineTotal, 0);
export const isEmpty = () => items.length === 0;

/**
 * Calcula o preço unitário de um item conforme a regra de meia-a-meia.
 * @param {Pick<CartItem,"type"|"flavors"|"border"|"extras">} it
 */
export function priceOf(it) {
  let base = 0;
  if (it.type === "pizza") {
    const prices = (it.flavors || []).map((f) => Number(f.price) || 0);
    if (prices.length <= 1) {
      base = prices[0] || 0;
    } else {
      base = state.settings.halfPriceRule === "avg"
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : Math.max(...prices);
    }
  } else {
    base = Number(it.flavors?.[0]?.price) || 0;
  }
  const border = Number(it.border?.price) || 0;
  const extrasTotal = (it.extras || []).reduce((n, e) => n + (Number(e.price) || 0), 0);
  return Math.round((base + border + extrasTotal) * 100) / 100;
}

/** Adiciona um item já montado (sem uid/preços). */
export function addItem(partial) {
  const unitPrice = priceOf(partial);
  const item = {
    uid: crypto.randomUUID?.() || String(Date.now() + Math.random()),
    qty: 1,
    notes: "",
    border: null,
    extras: [],
    ...partial,
    unitPrice,
    lineTotal: unitPrice * (partial.qty || 1),
  };
  // Mescla linhas idênticas (mesma assinatura).
  const sig = signature(item);
  const existing = items.find((it) => signature(it) === sig);
  if (existing) {
    existing.qty += item.qty;
    existing.lineTotal = existing.unitPrice * existing.qty;
  } else {
    items.push(item);
  }
  persist();
  return item;
}

function signature(it) {
  return JSON.stringify({
    p: it.productId, s: it.size,
    f: (it.flavors || []).map((x) => x.name).sort(),
    b: it.border?.name || null,
    e: (it.extras || []).map((x) => x.name).sort(),
    n: it.notes || "",
  });
}

export function setQty(uid, qty) {
  const it = items.find((x) => x.uid === uid);
  if (!it) return;
  it.qty = Math.max(0, qty);
  if (it.qty === 0) items = items.filter((x) => x.uid !== uid);
  else it.lineTotal = it.unitPrice * it.qty;
  persist();
}

export const inc = (uid) => setQty(uid, (items.find((x) => x.uid === uid)?.qty || 0) + 1);
export const dec = (uid) => setQty(uid, (items.find((x) => x.uid === uid)?.qty || 0) - 1);

export function removeItem(uid) {
  items = items.filter((x) => x.uid !== uid);
  persist();
}

export function clear() {
  items = [];
  persist();
}
