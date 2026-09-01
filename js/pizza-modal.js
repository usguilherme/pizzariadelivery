// ============================================================================
// pizza-modal.js — bottom-sheet para montar um item (pizza ou produto simples)
// ============================================================================

import { openSheet, el, toast, formatBRL, escapeHtml } from "./ui.js";
import {
  state, SIZES, SIZE_LABELS, pizzaFlavors, borders, extras, pizzaPrice,
} from "./store.js";
import { addItem, priceOf } from "./cart.js";

/**
 * Abre o construtor do produto.
 * @param {object} product
 */
export function openProductSheet(product) {
  return product.type === "pizza" ? openPizzaSheet(product) : openSimpleSheet(product);
}

// ---- Produto simples --------------------------------------------------
function openSimpleSheet(product) {
  const draft = {
    productId: product.id,
    type: "simple",
    name: product.name,
    size: null,
    flavors: [{ name: product.name, price: Number(product.price) || 0 }],
    border: null,
    extras: [],
    qty: 1,
    notes: "",
  };

  const wrap = el("div", { class: "space-y-5" });
  if (product.imageUrl) {
    wrap.append(el("img", { src: product.imageUrl, alt: product.name, class: "w-full h-44 object-cover rounded-2xl" }));
  }
  wrap.append(
    el("p", { class: "text-charcoal-600 text-sm" }, product.description || ""),
    notesField(draft),
  );

  const footer = buildFooter(draft, () => {
    addItem(draft);
    toast(`${product.name} adicionado`, "success");
    sheet.close();
  });
  wrap.append(footer.node);
  const sheet = openSheet(wrap, { title: product.name });
  footer.refresh();
}

// ---- Pizza -----------------------------------------------------------
function openPizzaSheet(product) {
  const flavors = pizzaFlavors();
  const draft = {
    productId: product.id,
    type: "pizza",
    name: "",
    size: state.settings.defaultSize || "G",
    flavors: [{ id: product.id, name: product.name, prices: product.prices || {} }],
    border: null,
    extras: [],
    qty: 1,
    notes: "",
  };
  if (!SIZES.includes(draft.size)) draft.size = "G";

  const wrap = el("div", { class: "space-y-5" });

  // -- Tamanho --
  const sizeRow = el("div", { class: "grid grid-cols-4 gap-2" });
  const renderSizes = () => {
    sizeRow.innerHTML = "";
    for (const s of SIZES) {
      const price = pizzaPrice(product, s);
      if (!price) continue;
      const active = draft.size === s;
      sizeRow.append(el("button", {
        class: `flex flex-col items-center gap-0.5 py-2 rounded-xl border text-sm font-semibold transition ${
          active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-charcoal-200 text-charcoal-600"
        }`,
        onclick: () => { draft.size = s; renderSizes(); syncFlavorPrices(); footer.refresh(); },
      }, [
        el("span", {}, s),
        el("span", { class: "text-[10px] font-normal opacity-70" }, SIZE_LABELS[s]),
      ]));
    }
  };

  // -- Sabores (1 ou 2) --
  const flavorBox = el("div", { class: "space-y-2" });
  const modeRow = el("div", { class: "flex gap-2" });
  const setMode = (n) => {
    if (n === 1) draft.flavors = [draft.flavors[0]];
    else if (draft.flavors.length === 1) draft.flavors.push(null);
    renderModes();
    renderFlavorPickers();
    syncFlavorPrices();
    footer.refresh();
  };
  const renderModes = () => {
    modeRow.innerHTML = "";
    [[1, "Inteira"], [2, "Meia a meia"]].forEach(([n, label]) => {
      const active = draft.flavors.length === n;
      modeRow.append(el("button", {
        class: `flex-1 py-2 rounded-xl text-sm font-semibold border ${
          active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-charcoal-200 text-charcoal-600"
        }`,
        onclick: () => setMode(n),
      }, label));
    });
  };

  const renderFlavorPickers = () => {
    flavorBox.innerHTML = "";
    draft.flavors.forEach((fl, idx) => {
      const sel = el("select", {
        class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm bg-white",
        onchange: (e) => {
          const f = flavors.find((x) => x.id === e.target.value);
          draft.flavors[idx] = f ? { id: f.id, name: f.name, prices: f.prices || {} } : null;
          syncFlavorPrices();
          footer.refresh();
        },
      });
      sel.append(el("option", { value: "" }, `Escolha o ${draft.flavors.length === 2 ? (idx === 0 ? "1º" : "2º") + " sabor" : "sabor"}`));
      for (const f of flavors) {
        const opt = el("option", { value: f.id }, `${f.name} — ${formatBRL(pizzaPrice(f, draft.size))}`);
        if (fl && fl.id === f.id) opt.selected = true;
        sel.append(opt);
      }
      flavorBox.append(el("label", { class: "block" }, [
        el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" },
          draft.flavors.length === 2 ? `Sabor ${idx + 1}` : "Sabor"),
        sel,
      ]));
    });
    if (state.settings.halfPriceRule !== "avg" && draft.flavors.length === 2) {
      flavorBox.append(el("p", { class: "text-[11px] text-charcoal-400" },
        "Meia a meia: vale o preço do sabor mais caro."));
    }
  };

  // Mantém flavors[].price atualizado conforme tamanho.
  function syncFlavorPrices() {
    draft.flavors = draft.flavors.map((f) =>
      f ? { ...f, price: pizzaPrice(f, draft.size) } : f);
  }

  // -- Borda --
  const borderBox = el("div", { class: "space-y-2" });
  const bs = borders();
  if (bs.length) {
    borderBox.append(el("span", { class: "text-xs font-semibold text-charcoal-500 block" }, "Borda recheada"));
    const grid = el("div", { class: "flex flex-wrap gap-2" });
    const chip = (label, price, val) => el("button", {
      class: "px-3 py-1.5 rounded-full border text-xs font-semibold border-charcoal-200 text-charcoal-600 data-[on=true]:border-brand-600 data-[on=true]:bg-brand-50 data-[on=true]:text-brand-700",
      dataset: { on: String((draft.border?.name || null) === val) },
      onclick: () => {
        draft.border = val ? { name: val, price } : null;
        grid.querySelectorAll("button").forEach((b) => (b.dataset.on = "false"));
        if (val) grid.querySelector(`[data-val="${CSS.escape(val)}"]`).dataset.on = "true";
        else grid.querySelector('[data-val=""]').dataset.on = "true";
        footer.refresh();
      },
    }, price ? `${label} +${formatBRL(price)}` : label);
    const none = chip("Sem borda", 0, null);
    none.dataset.val = "";
    grid.append(none);
    for (const b of bs) {
      const c = chip(b.name, Number(b.price) || 0, b.name);
      c.dataset.val = b.name;
      grid.append(c);
    }
    borderBox.append(grid);
  }

  // -- Adicionais --
  const extrasBox = el("div", { class: "space-y-2" });
  const ex = extras();
  if (ex.length) {
    extrasBox.append(el("span", { class: "text-xs font-semibold text-charcoal-500 block" }, "Adicionais"));
    for (const e of ex) {
      const id = "ex_" + e.id;
      const row = el("label", { class: "flex items-center justify-between py-1.5", for: id }, [
        el("span", { class: "text-sm text-charcoal-700" }, `${e.name}  ·  +${formatBRL(e.price)}`),
        el("input", {
          type: "checkbox", id, class: "w-5 h-5 accent-brand-600",
          onchange: (ev) => {
            if (ev.target.checked) draft.extras.push({ name: e.name, price: Number(e.price) || 0 });
            else draft.extras = draft.extras.filter((x) => x.name !== e.name);
            footer.refresh();
          },
        }),
      ]);
      extrasBox.append(row);
    }
  }

  const footer = buildFooter(draft, () => {
    if (draft.flavors.some((f) => !f)) return toast("Escolha todos os sabores.", "warn");
    draft.name = `Pizza ${draft.size} — ${draft.flavors.map((f) => f.name).join(" / ")}`;
    addItem({
      productId: draft.productId,
      type: "pizza",
      name: draft.name,
      size: draft.size,
      flavors: draft.flavors.map((f) => ({ name: f.name, price: f.price })),
      border: draft.border,
      extras: draft.extras,
      qty: draft.qty,
      notes: draft.notes,
    });
    toast("Pizza adicionada ao carrinho", "success");
    sheet.close();
  });

  wrap.append(
    section("Tamanho", sizeRow),
    section("Sabores", el("div", { class: "space-y-3" }, [modeRow, flavorBox])),
    bs.length ? borderBox : null,
    ex.length ? extrasBox : null,
    notesField(draft),
    footer.node,
  );

  const sheet = openSheet(wrap, { title: product.name });
  renderSizes();
  renderModes();
  renderFlavorPickers();
  syncFlavorPrices();
  footer.refresh();
}

// ---- Peças reutilizáveis --------------------------------------------
function section(title, node) {
  return el("div", { class: "space-y-2" }, [
    el("span", { class: "text-xs font-semibold text-charcoal-500 block" }, title),
    node,
  ]);
}

function notesField(draft) {
  return el("label", { class: "block" }, [
    el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" }, "Observações (opcional)"),
    el("textarea", {
      class: "w-full rounded-xl border border-charcoal-200 py-2 px-3 text-sm resize-none",
      rows: "2", placeholder: "Ex.: sem cebola, bem assada…",
      oninput: (e) => { draft.notes = e.target.value; },
    }),
  ]);
}

function buildFooter(draft, onConfirm) {
  const qtyLabel = el("span", { class: "w-8 text-center font-bold" }, "1");
  const priceLabel = el("span", {}, "");
  const node = el("div", { class: "sticky bottom-0 -mx-1 pt-3 bg-white/95 backdrop-blur border-t border-charcoal-100 flex items-center gap-3" }, [
    el("div", { class: "flex items-center gap-1 border border-charcoal-200 rounded-xl" }, [
      el("button", { class: "w-9 h-10 text-lg font-bold text-charcoal-500", onclick: () => { draft.qty = Math.max(1, draft.qty - 1); refresh(); } }, "−"),
      qtyLabel,
      el("button", { class: "w-9 h-10 text-lg font-bold text-charcoal-500", onclick: () => { draft.qty += 1; refresh(); } }, "+"),
    ]),
    el("button", {
      class: "flex-1 h-12 rounded-xl bg-brand-600 text-white font-bold flex items-center justify-center gap-2",
      onclick: onConfirm,
    }, [el("span", {}, "Adicionar"), priceLabel]),
  ]);

  function refresh() {
    qtyLabel.textContent = String(draft.qty);
    const unit = priceOf({
      type: draft.type,
      flavors: draft.flavors.map((f) => (f ? { price: f.price ?? f.prices?.[draft.size] ?? 0 } : { price: 0 })),
      border: draft.border,
      extras: draft.extras,
    });
    priceLabel.textContent = unit ? `· ${formatBRL(unit * draft.qty)}` : "";
  }
  return { node, refresh };
}
