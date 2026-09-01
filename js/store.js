// ============================================================================
// store.js — camada de dados (Firestore) para o cardápio e configuração
// ============================================================================

import {
  db, collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy,
} from "./firebase-config.js";

export const SIZES = ["P", "M", "G", "GG"];
export const SIZE_LABELS = { P: "Pequena", M: "Média", G: "Grande", GG: "Família" };

/** Configuração padrão da loja (fallback caso o doc settings/store não exista). */
export const DEFAULT_SETTINGS = {
  name: "Pizzaria Delivery",
  whatsapp: "",
  address: "",
  pixKey: "",
  pixName: "",
  isOpenManual: true,
  minOrder: 0,
  defaultDeliveryFee: 0,
  deliveryFees: [], // [{ neighborhood, fee }]
  pickupEnabled: true,
  deliveryEstimate: "40–60 min",
  halfPriceRule: "max", // "max" | "avg"
  hours: {
    sun: { enabled: true, open: "18:00", close: "23:00" },
    mon: { enabled: false, open: "18:00", close: "23:00" },
    tue: { enabled: true, open: "18:00", close: "23:00" },
    wed: { enabled: true, open: "18:00", close: "23:00" },
    thu: { enabled: true, open: "18:00", close: "23:00" },
    fri: { enabled: true, open: "18:00", close: "23:59" },
    sat: { enabled: true, open: "18:00", close: "23:59" },
  },
};

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Estado em memória. */
export const state = {
  settings: { ...DEFAULT_SETTINGS },
  categories: [],
  products: [],
  addons: [],
};

// ---- Carregamento -------------------------------------------------------

export async function loadSettings() {
  const snap = await getDoc(doc(db, "settings", "store"));
  state.settings = snap.exists()
    ? { ...DEFAULT_SETTINGS, ...snap.data() }
    : { ...DEFAULT_SETTINGS };
  return state.settings;
}

export async function loadMenu() {
  const [cats, prods, adds] = await Promise.all([
    getDocs(collection(db, "categories")),
    getDocs(collection(db, "products")),
    getDocs(collection(db, "addons")),
  ]);
  state.categories = cats.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.active !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  state.products = prods.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.active !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  state.addons = adds.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.active !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return state;
}

/** Assina o cardápio em tempo real (usado pelo admin e, opcionalmente, cliente). */
export function watchCollection(name, cb) {
  return onSnapshot(collection(db, name), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ---- Seletores --------------------------------------------------------

export const productsByCategory = (categoryId) =>
  state.products.filter((p) => p.categoryId === categoryId);

export const featuredProducts = () => state.products.filter((p) => p.featured);

export const pizzaFlavors = () =>
  state.products.filter((p) => p.type === "pizza" && p.halfEligible !== false);

export const borders = () => state.addons.filter((a) => a.group === "borda");
export const extras = () => state.addons.filter((a) => a.group === "extra");

/** Preço de um produto pizza para um tamanho. */
export function pizzaPrice(product, size) {
  return Number(product?.prices?.[size] ?? 0);
}

// ---- Status da loja ---------------------------------------------------

/**
 * Verifica se a loja está aberta agora, considerando toggle manual + horários.
 * @returns {{ open:boolean, reason:string }}
 */
export function storeStatus(now = new Date(), settings = state.settings) {
  if (settings.isOpenManual === false) {
    return { open: false, reason: "Estamos fechados no momento." };
  }
  const key = WEEKDAY_KEYS[now.getDay()];
  const today = settings.hours?.[key];
  if (!today || today.enabled === false) {
    return { open: false, reason: "Hoje não há atendimento." };
  }
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = String(today.open || "00:00").split(":").map(Number);
  const [ch, cm] = String(today.close || "23:59").split(":").map(Number);
  const openMin = oh * 60 + om;
  let closeMin = ch * 60 + cm;
  if (closeMin <= openMin) closeMin += 24 * 60; // vira o dia
  const curAdj = cur < openMin ? cur + 24 * 60 : cur;
  if (curAdj >= openMin && curAdj <= closeMin) {
    return { open: true, reason: `Aberto até ${today.close}` };
  }
  return { open: false, reason: `Abre às ${today.open}` };
}

/** Taxa de entrega para um bairro (case-insensitive), com fallback. */
export function deliveryFeeFor(neighborhood, settings = state.settings) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const found = (settings.deliveryFees || []).find((f) => norm(f.neighborhood) === norm(neighborhood));
  return found ? Number(found.fee) : Number(settings.defaultDeliveryFee || 0);
}

export const neighborhoods = (settings = state.settings) =>
  (settings.deliveryFees || []).map((f) => f.neighborhood).filter(Boolean);
