// ============================================================================
// menu.js — renderização do cardápio do cliente (index.html)
// ============================================================================

import { $, el, formatBRL, escapeHtml, debounce } from "./ui.js";
import {
  state, loadMenu, loadSettings, storeStatus, productsByCategory, featuredProducts,
  SIZES, pizzaPrice,
} from "./store.js";
import { openProductSheet } from "./pizza-modal.js";
import { initCartBar } from "./checkout.js";

const catNav = $("#catNav");
const menuRoot = $("#menu");
const searchInput = $("#search");

export async function initMenu() {
  renderSkeleton();
  try {
    await Promise.all([loadSettings(), loadMenu()]);
  } catch (e) {
    console.error(e);
    menuRoot.innerHTML = `<p class="text-center text-charcoal-500 py-10">Não foi possível carregar o cardápio. Tente novamente.</p>`;
    return;
  }
  renderStoreHeader();
  renderNav();
  renderMenu();
  initCartBar();
  wireSearch();
  wireScrollSpy();
}

function renderSkeleton() {
  menuRoot.innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="animate-pulse flex gap-3 py-4 border-b border-charcoal-100">
      <div class="flex-1 space-y-2">
        <div class="h-4 bg-charcoal-100 rounded w-2/3"></div>
        <div class="h-3 bg-charcoal-100 rounded w-full"></div>
        <div class="h-3 bg-charcoal-100 rounded w-1/3"></div>
      </div>
      <div class="w-20 h-20 bg-charcoal-100 rounded-xl"></div>
    </div>`).join("");
}

function renderStoreHeader() {
  const s = state.settings;
  $("#storeName").textContent = s.name || "Cardápio";
  const st = storeStatus();
  const badge = $("#storeStatus");
  badge.textContent = st.open ? `● Aberto · ${st.reason}` : `● Fechado · ${st.reason}`;
  badge.className = `text-xs font-semibold px-2.5 py-1 rounded-full ${
    st.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
  }`;
  if (s.address) $("#storeAddress").textContent = s.address;
  if (s.deliveryEstimate) $("#storeEta").textContent = `Entrega ~ ${s.deliveryEstimate}`;
}

function renderNav() {
  catNav.innerHTML = "";
  const cats = [...(featuredProducts().length ? [{ id: "__feat", name: "⭐ Destaques" }] : []), ...state.categories];
  for (const c of cats) {
    catNav.append(el("a", {
      href: `#cat-${c.id}`,
      class: "cat-chip shrink-0 px-4 py-2 rounded-full bg-charcoal-100 text-charcoal-600 text-sm font-semibold whitespace-nowrap scroll-snap-align-start",
      dataset: { cat: c.id },
    }, c.name));
  }
}

function renderMenu(filter = "") {
  menuRoot.innerHTML = "";
  const f = filter.trim().toLowerCase();
  const match = (p) => !f || p.name.toLowerCase().includes(f) || (p.description || "").toLowerCase().includes(f);

  const feats = featuredProducts().filter(match);
  if (feats.length && !f) {
    menuRoot.append(categorySection({ id: "__feat", name: "⭐ Destaques" }, feats));
  }
  for (const cat of state.categories) {
    const prods = productsByCategory(cat.id).filter(match);
    if (!prods.length) continue;
    menuRoot.append(categorySection(cat, prods));
  }
  if (!menuRoot.children.length) {
    menuRoot.innerHTML = `<p class="text-center text-charcoal-500 py-10">Nenhum item encontrado.</p>`;
  }
}

function categorySection(cat, products) {
  const sec = el("section", { id: `cat-${cat.id}`, class: "scroll-mt-28 pt-2" });
  sec.append(el("h2", { class: "text-lg font-extrabold text-charcoal-900 mb-1 mt-4" }, cat.name));
  if (cat.description) sec.append(el("p", { class: "text-sm text-charcoal-500 mb-2" }, cat.description));
  const list = el("div", {});
  for (const p of products) list.append(productCard(p));
  sec.append(list);
  return sec;
}

function productCard(p) {
  const priceLabel = p.type === "pizza"
    ? `A partir de ${formatBRL(Math.min(...SIZES.map((s) => pizzaPrice(p, s)).filter(Boolean)))}`
    : formatBRL(p.price);

  const card = el("button", {
    class: "w-full text-left flex gap-3 py-4 border-b border-charcoal-100 active:bg-charcoal-50",
    onclick: () => openProductSheet(p),
  }, [
    el("div", { class: "flex-1 min-w-0" }, [
      el("div", { class: "flex items-center gap-2" }, [
        el("h3", { class: "font-bold text-charcoal-900 truncate" }, p.name),
        p.tags?.includes("promo") ? el("span", { class: "text-[10px] font-bold bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded" }, "PROMO") : null,
      ]),
      p.description ? el("p", { class: "text-sm text-charcoal-500 line-clamp-2 mt-0.5" }, p.description) : null,
      el("p", { class: "text-sm font-bold text-brand-700 mt-1" }, priceLabel),
    ]),
    p.imageUrl ? el("img", { src: p.imageUrl, alt: p.name, loading: "lazy", class: "w-20 h-20 rounded-xl object-cover shrink-0" }) : null,
  ]);
  return card;
}

function wireSearch() {
  if (!searchInput) return;
  searchInput.addEventListener("input", debounce((e) => renderMenu(e.target.value), 200));
}

function wireScrollSpy() {
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.id.replace("cat-", "");
      catNav.querySelectorAll(".cat-chip").forEach((chip) => {
        const on = chip.dataset.cat === id;
        chip.classList.toggle("bg-brand-600", on);
        chip.classList.toggle("text-white", on);
        chip.classList.toggle("bg-charcoal-100", !on);
        chip.classList.toggle("text-charcoal-600", !on);
        if (on) chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      });
    }
  }, { rootMargin: "-96px 0px -70% 0px" });
  menuRoot.querySelectorAll("section").forEach((s) => obs.observe(s));
}
