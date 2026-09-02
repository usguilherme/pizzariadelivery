// ============================================================================
// menu.js — renderização do cardápio do cliente (index.html)
// ============================================================================

import { $, el, formatBRL, debounce, mediaFallback, icon, toast } from "./ui.js";
import {
  state, loadMenu, loadSettings, storeStatus, productsByCategory, featuredProducts,
  pizzaEffectivePrice, effectivePrice, pizzaFromPrice, hasActivePromo, promoProducts,
} from "./store.js";
import { openProductSheet } from "./pizza-modal.js";
import { initCartBar } from "./checkout.js";
import { addItem } from "./cart.js";

const catNav = $("#catNav");
const menuRoot = $("#menu");
const searchInput = $("#search");
const bannerRoot = $("#promoBanner");

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
  renderBanner();
  renderMenu();
  initCartBar();
  wireSearch();
  wireScrollSpy();
}

// ---- Skeleton -------------------------------------------------------------
function renderSkeleton() {
  bannerRoot.hidden = true;
  menuRoot.innerHTML = `
    <div class="sk h-5 w-40 mb-3"></div>
    <div class="grid grid-cols-2 gap-3">
      ${Array.from({ length: 6 }).map(() => `
        <div class="sk-card">
          <div class="sk sk-card__media rounded-none"></div>
          <div class="p-3 space-y-2">
            <div class="sk h-3.5 w-3/4"></div>
            <div class="sk h-3 w-full"></div>
            <div class="sk h-4 w-1/2 mt-2"></div>
          </div>
        </div>`).join("")}
    </div>`;
}

// ---- Header da loja ------------------------------------------------------
function renderStoreHeader() {
  const s = state.settings;
  $("#storeName").textContent = s.name || "Cardápio";
  const st = storeStatus();
  const badge = $("#storeStatus");
  badge.textContent = st.open ? `● Aberto` : `● Fechado`;
  badge.title = st.reason;
  badge.className = `text-[11px] font-bold px-2.5 py-1 rounded-full ${
    st.open ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
  }`;
  if (s.address) $("#storeAddress").textContent = s.address;
  if (s.deliveryEstimate) $("#storeEta").textContent = `🛵 Entrega ~ ${s.deliveryEstimate}` + (s.minOrder ? ` · mín. ${formatBRL(s.minOrder)}` : "");
}

// ---- Nav de categorias -------------------------------------------------
function renderNav() {
  catNav.innerHTML = "";
  const cats = [
    ...(promoProducts().length ? [{ id: "__promo", name: "🔥 Promoções" }] : []),
    ...(featuredProducts().length ? [{ id: "__feat", name: "⭐ Destaques" }] : []),
    ...state.categories,
  ];
  for (const c of cats) {
    catNav.append(el("a", {
      href: `#cat-${c.id}`,
      class: "chip",
      dataset: { cat: c.id },
    }, c.name));
  }
}

// ---- Banner promocional ----------------------------------------------
function renderBanner() {
  const promos = promoProducts().slice(0, 5);
  if (promos.length < 1) { bannerRoot.hidden = true; return; }
  bannerRoot.hidden = false;
  bannerRoot.innerHTML = "";

  const banner = el("div", { class: "promo-banner" });
  const dots = el("div", { class: "promo-dots" });
  const slides = [];

  promos.forEach((p, i) => {
    const info = p.type === "pizza"
      ? bestPromo(p)
      : effectivePrice(p);
    const slide = el("div", { class: `promo-slide${i === 0 ? " is-active" : ""}`, onclick: () => openProductSheet(p) }, [
      p.imageUrl ? el("img", { src: p.imageUrl, alt: p.name, loading: i === 0 ? "eager" : "lazy" }) : null,
      el("div", { class: "promo-slide__scrim" }),
      el("div", { class: "promo-slide__body" }, [
        el("span", { class: "promo-slide__kicker" }, `Promo · -${info.percent}%`),
        el("h3", { class: "promo-slide__title" }, p.name),
        el("p", { class: "promo-slide__sub" },
          `de ${formatBRL(info.base)} por ${formatBRL(info.price)}`),
      ]),
    ]);
    slides.push(slide);
    banner.append(slide);

    const dot = el("button", {
      class: i === 0 ? "is-active" : "", "aria-label": `Slide ${i + 1}`,
      onclick: (ev) => { ev.stopPropagation(); go(i); },
    });
    dots.append(dot);
  });

  banner.append(dots);
  bannerRoot.append(banner);

  let idx = 0;
  const go = (n) => {
    idx = (n + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === idx));
    [...dots.children].forEach((d, i) => d.classList.toggle("is-active", i === idx));
  };
  if (slides.length > 1) {
    let timer = setInterval(() => go(idx + 1), 5000);
    banner.addEventListener("pointerdown", () => { clearInterval(timer); });
  }
}

function bestPromo(product) {
  // melhor % de desconto entre os tamanhos
  let best = { base: 0, price: 0, hasPromo: false, percent: 0 };
  for (const s of ["P", "M", "G", "GG"]) {
    const info = pizzaEffectivePrice(product, s);
    if (info.hasPromo && info.percent > best.percent) best = info;
  }
  return best;
}

// ---- Cardápio ---------------------------------------------------------
function renderMenu(filter = "") {
  menuRoot.innerHTML = "";
  const f = filter.trim().toLowerCase();
  const match = (p) => !f || p.name.toLowerCase().includes(f) || (p.description || "").toLowerCase().includes(f);

  if (!f) {
    const promos = promoProducts().filter(match);
    if (promos.length) {
      menuRoot.append(categorySection({ id: "__promo", name: "🔥 Promoções da Casa" }, promos, { accent: true }));
    }
    const feats = featuredProducts().filter((p) => !hasActivePromo(p)).filter(match);
    if (feats.length) {
      menuRoot.append(categorySection({ id: "__feat", name: "⭐ Destaques" }, feats));
    }
  }

  for (const cat of state.categories) {
    const prods = productsByCategory(cat.id).filter(match);
    if (!prods.length) continue;
    menuRoot.append(categorySection(cat, prods));
  }

  if (!menuRoot.children.length) {
    menuRoot.innerHTML = `<p class="text-center text-charcoal-500 py-16 text-sm">Nenhum item encontrado.</p>`;
  }
}

function categorySection(cat, products, { accent = false } = {}) {
  const sec = el("section", { id: `cat-${cat.id}`, class: "scroll-mt-[150px] pt-4" });
  sec.append(el("div", { class: "flex items-baseline gap-2 mb-2.5" }, [
    el("h2", { class: `font-display text-lg font-extrabold ${accent ? "text-gradient" : "text-charcoal-900"}` }, cat.name),
    el("span", { class: "text-xs text-charcoal-400 font-semibold" }, `${products.length}`),
  ]));
  if (cat.description) sec.append(el("p", { class: "text-sm text-charcoal-500 -mt-1.5 mb-2.5" }, cat.description));
  const grid = el("div", { class: "grid grid-cols-2 gap-3" });
  for (const p of products) grid.append(productCard(p));
  sec.append(grid);
  return sec;
}

function productCard(p) {
  const isPizza = p.type === "pizza";
  const info = isPizza ? pizzaEffectivePrice(p, bestSize(p)) : effectivePrice(p);
  const promo = hasActivePromo(p);
  const fromPrice = isPizza ? pizzaFromPrice(p) : info.price;

  // Media
  const media = el("div", { class: "product-card__media" });
  media.append(p.imageUrl
    ? el("img", { src: p.imageUrl, alt: p.name, loading: "lazy", class: "product-card__img" })
    : mediaFallback(p.name));
  if (promo) {
    media.append(el("div", { class: "badge-float" }, [
      el("span", { class: "badge badge-promo", html: `${icon("flame", "w-3 h-3")} -${bestDiscount(p)}%` }),
    ]));
  } else if (p.featured || p.tags?.includes("promo")) {
    media.append(el("div", { class: "badge-float" }, [
      el("span", { class: "badge badge-featured", html: `${icon("star", "w-3 h-3")} ${p.featured ? "Destaque" : "Promo"}` }),
    ]));
  }

  // Preço
  const priceWrap = el("div", { class: "flex flex-col leading-tight min-w-0" });
  if (isPizza) priceWrap.append(el("span", { class: "text-[10px] text-charcoal-400 font-semibold" }, "a partir de"));
  if (!isPizza && info.hasPromo) {
    priceWrap.append(el("span", { class: "price-old text-[11px]" }, formatBRL(info.base)));
  }
  priceWrap.append(el("span", { class: "price-now text-[15px]" }, formatBRL(fromPrice)));

  // CTA
  const cta = el("button", {
    type: "button",
    class: "btn btn-solid btn-sm shrink-0",
    onclick: (ev) => {
      ev.stopPropagation();
      if (isPizza) return openProductSheet(p);
      quickAddSimple(p);
    },
  }, isPizza ? "Montar" : "＋");

  const card = el("button", {
    type: "button",
    class: "product-card",
    onclick: () => openProductSheet(p),
  }, [
    media,
    el("div", { class: "p-3 flex flex-col flex-1 gap-1" }, [
      el("h3", { class: "font-display font-bold text-sm text-charcoal-900 line-clamp-1" }, p.name),
      p.description ? el("p", { class: "text-[11px] text-charcoal-500 line-clamp-2 min-h-[2rem]" }, p.description) : el("div", { class: "min-h-[2rem]" }),
      p.serves ? el("div", { class: "flex items-center gap-1 text-[11px] text-accent-600 font-semibold" }, [
        el("span", { class: "shrink-0", html: icon("users", "w-3 h-3") }), String(p.serves),
      ]) : null,
      el("div", { class: "mt-auto pt-2 flex items-end justify-between gap-1.5" }, [priceWrap, cta]),
    ]),
  ]);
  return card;
}

function quickAddSimple(p) {
  const info = effectivePrice(p);
  addItem({
    productId: p.id,
    type: "simple",
    name: p.name,
    size: null,
    flavors: [{ name: p.name, price: info.price }],
    border: null,
    extras: [],
    qty: 1,
    notes: "",
  });
  toast(`${p.name} adicionado`, "success");
}

function bestSize(p) {
  for (const s of ["G", "M", "GG", "P"]) if (pizzaEffectivePrice(p, s).price > 0) return s;
  return "G";
}
function bestDiscount(p) {
  if (p.type !== "pizza") return effectivePrice(p).percent;
  let best = 0;
  for (const s of ["P", "M", "G", "GG"]) best = Math.max(best, pizzaEffectivePrice(p, s).percent);
  return best;
}

// ---- Busca ----------------------------------------------------------------
function wireSearch() {
  if (!searchInput) return;
  searchInput.addEventListener("input", debounce((e) => renderMenu(e.target.value), 200));
}

// ---- Scroll-spy ---------------------------------------------------------
function wireScrollSpy() {
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.id.replace("cat-", "");
      catNav.querySelectorAll(".chip").forEach((chip) => {
        const on = chip.dataset.cat === id;
        chip.classList.toggle("chip--on", on);
        if (on) chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      });
    }
  }, { rootMargin: "-155px 0px -70% 0px" });
  menuRoot.querySelectorAll("section").forEach((s) => obs.observe(s));
}
