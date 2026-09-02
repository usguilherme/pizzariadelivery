// ============================================================================
// pizza-modal.js — bottom-sheet para montar um item (pizza ou produto simples)
// ============================================================================

import { openSheet, el, toast, formatBRL, mediaFallback, icon, segmented, stepHead } from "./ui.js";
import {
  state, SIZES, SIZE_LABELS, pizzaFlavors, borders, extras,
  pizzaEffectivePrice, effectivePrice,
} from "./store.js";
import { addItem, priceOf } from "./cart.js";

/** Abre o construtor do produto. */
export function openProductSheet(product) {
  return product.type === "pizza" ? openPizzaSheet(product) : openSimpleSheet(product);
}

// ---- Produto simples --------------------------------------------------
function openSimpleSheet(product) {
  const info = effectivePrice(product);
  const draft = {
    productId: product.id,
    type: "simple",
    name: product.name,
    size: null,
    flavors: [{ name: product.name, price: info.price }],
    border: null,
    extras: [],
    qty: 1,
    notes: "",
  };

  const wrap = el("div", { class: "space-y-4" });

  const hero = el("div", { class: "relative rounded-card overflow-hidden aspect-[16/10] bg-charcoal-100" });
  hero.append(product.imageUrl
    ? el("img", { src: product.imageUrl, alt: product.name, class: "w-full h-full object-cover" })
    : mediaFallback(product.name));
  if (info.hasPromo) {
    hero.append(el("div", { class: "badge-float" }, [
      el("span", { class: "badge badge-promo", html: `${icon("flame", "w-3 h-3")} -${info.percent}%` }),
    ]));
  }
  wrap.append(hero);

  if (product.description) wrap.append(el("p", { class: "text-charcoal-600 text-sm" }, product.description));

  wrap.append(priceLine(info));

  const footer = buildFooter(draft, () => {
    addItem(draft);
    toast(`${product.name} adicionado`, "success");
    sheet.close();
  });

  // Adicionais (opcionais também para produtos simples)
  const ex = extras();
  if (ex.length) wrap.append(extrasBlock(ex, draft, () => footer.refresh()));

  wrap.append(notesField(draft), footer.node);

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
    flavors: [flavorRef(product)],
    border: null,
    extras: [],
    qty: 1,
    notes: "",
  };
  if (!SIZES.includes(draft.size) || !pizzaEffectivePrice(product, draft.size).price) {
    draft.size = firstSizeWithPrice(product);
  }

  const wrap = el("div", {});

  // -- 1. Tamanho --
  const sizeRow = el("div", { class: "grid grid-cols-4 gap-2" });
  const renderSizes = () => {
    sizeRow.innerHTML = "";
    for (const s of SIZES) {
      const pr = pizzaEffectivePrice(product, s);
      if (!pr.price) continue;
      const card = el("button", {
        type: "button",
        class: "size-card",
        dataset: { on: String(draft.size === s) },
        onclick: () => { draft.size = s; renderSizes(); syncFlavorPrices(); renderFlavorPickers(); footer.refresh(); },
      }, [
        el("span", { class: "size-card__name" }, s),
        el("span", { class: "size-card__sub" }, SIZE_LABELS[s]),
        el("span", { class: "size-card__price" }, formatBRL(pr.price)),
        pr.hasPromo ? el("span", { class: "price-old text-[9px]" }, formatBRL(pr.base)) : null,
      ]);
      sizeRow.append(card);
    }
  };

  // -- 2. Sabores --
  const flavorBox = el("div", { class: "space-y-2" });
  const modeCtl = segmented(
    [[1, "Inteira"], [2, "Meia a meia"]],
    draft.flavors.length,
    (n) => {
      if (n === 1) draft.flavors = [draft.flavors[0] || null];
      else if (draft.flavors.length === 1) draft.flavors.push(null);
      renderFlavorPickers();
      syncFlavorPrices();
      footer.refresh();
    },
  );

  const renderFlavorPickers = () => {
    flavorBox.innerHTML = "";
    const two = draft.flavors.length === 2;
    draft.flavors.forEach((fl, idx) => {
      const sel = el("select", {
        class: "field",
        onchange: (e) => {
          const f = flavors.find((x) => x.id === e.target.value);
          draft.flavors[idx] = f ? flavorRef(f) : null;
          syncFlavorPrices();
          footer.refresh();
        },
      });
      sel.append(el("option", { value: "" }, two ? `Escolha o ${idx === 0 ? "1º" : "2º"} sabor` : "Escolha o sabor"));
      for (const f of flavors) {
        const pr = pizzaEffectivePrice(f, draft.size);
        const opt = el("option", { value: f.id }, `${f.name} — ${formatBRL(pr.price)}`);
        if (fl && fl.id === f.id) opt.selected = true;
        sel.append(opt);
      }
      flavorBox.append(el("label", { class: "block" }, [
        el("span", { class: "field-label" }, two ? `Sabor ${idx + 1}` : "Sabor"),
        sel,
      ]));
    });
    if (two && state.settings.halfPriceRule !== "avg") {
      flavorBox.append(el("p", { class: "text-[11px] text-charcoal-400 flex items-center gap-1" }, [
        el("span", { class: "shrink-0", html: icon("flame", "w-3 h-3") }),
        "Meia a meia: vale o preço do sabor mais caro.",
      ]));
    }
  };

  function syncFlavorPrices() {
    draft.flavors = draft.flavors.map((f) =>
      f ? { ...f, price: pizzaEffectivePrice(f, draft.size).price } : f);
  }

  // -- 3. Borda --
  const bs = borders();
  const borderStep = bs.length ? el("div", { class: "step" }) : null;
  if (borderStep) {
    borderStep.append(stepHead(3, "Borda recheada", "opcional"));
    const grid = el("div", { class: "flex flex-wrap gap-2" });
    const mkChip = (label, price, val) => {
      const chip = el("button", {
        type: "button",
        class: "opt-chip",
        dataset: { on: String((draft.border?.name || null) === val), val: val || "" },
        onclick: () => {
          draft.border = val ? { name: val, price } : null;
          grid.querySelectorAll("button").forEach((b) => (b.dataset.on = "false"));
          chip.dataset.on = "true";
          footer.refresh();
        },
      }, price ? `${label} +${formatBRL(price)}` : label);
      return chip;
    };
    grid.append(mkChip("Sem borda", 0, null));
    for (const b of bs) grid.append(mkChip(b.name, Number(b.price) || 0, b.name));
    borderStep.append(grid);
  }

  // -- 4. Adicionais --
  const ex = extras();
  const extrasStep = ex.length ? el("div", { class: "step" }) : null;
  if (extrasStep) {
    extrasStep.append(stepHead(bs.length ? 4 : 3, "Adicionais", "opcional"));
    extrasStep.append(extrasBlock(ex, draft, () => footer.refresh()));
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
    stepBlock(1, "Tamanho", sizeRow),
    stepBlock(2, "Sabores", el("div", { class: "space-y-3" }, [modeCtl.node, flavorBox])),
    borderStep,
    extrasStep,
    el("div", { class: "step" }, [notesField(draft)]),
    footer.node,
  );

  const sheet = openSheet(wrap, { title: product.name });
  renderSizes();
  renderFlavorPickers();
  syncFlavorPrices();
  footer.refresh();
}

// ---- Peças reutilizáveis --------------------------------------------
function flavorRef(f) {
  return { id: f.id, name: f.name, prices: f.prices || {}, promoPrices: f.promoPrices || null, promoActive: !!f.promoActive };
}
function firstSizeWithPrice(product) {
  for (const s of SIZES) if (pizzaEffectivePrice(product, s).price) return s;
  return "G";
}

function stepBlock(num, title, node) {
  return el("div", { class: "step" }, [stepHead(num, title), node]);
}

function priceLine(info) {
  const wrap = el("div", { class: "flex items-baseline gap-2" });
  if (info.hasPromo) wrap.append(el("span", { class: "price-old text-sm" }, formatBRL(info.base)));
  wrap.append(el("span", { class: "price-now text-xl" }, formatBRL(info.price)));
  if (info.hasPromo) wrap.append(el("span", { class: "badge badge-promo", html: `-${info.percent}%` }));
  return wrap;
}

function extrasBlock(ex, draft, onChange) {
  const box = el("div", { class: "space-y-0.5" });
  for (const e of ex) {
    const id = "ex_" + e.id;
    box.append(el("label", { class: "list-row cursor-pointer", for: id }, [
      el("span", { class: "text-sm text-charcoal-700" }, `${e.name}`),
      el("span", { class: "flex items-center gap-2 shrink-0" }, [
        el("span", { class: "text-xs font-semibold text-charcoal-500" }, `+${formatBRL(e.price)}`),
        el("input", {
          type: "checkbox", id, class: "w-5 h-5 accent-brand-600",
          onchange: (ev) => {
            if (ev.target.checked) draft.extras.push({ name: e.name, price: Number(e.price) || 0 });
            else draft.extras = draft.extras.filter((x) => x.name !== e.name);
            onChange?.();
          },
        }),
      ]),
    ]));
  }
  return box;
}

function notesField(draft) {
  return el("label", { class: "block" }, [
    el("span", { class: "field-label" }, "Observações (opcional)"),
    el("textarea", {
      class: "field", rows: "2", placeholder: "Ex.: sem cebola, bem assada…",
      oninput: (e) => { draft.notes = e.target.value; },
    }),
  ]);
}

function buildFooter(draft, onConfirm) {
  const qtyLabel = el("span", {}, "1");
  const priceLabel = el("span", { class: "opacity-90" }, "");
  const node = el("div", { class: "sheet-footer" }, [
    el("div", { class: "qty" }, [
      el("button", { type: "button", onclick: () => { draft.qty = Math.max(1, draft.qty - 1); refresh(); } }, "−"),
      qtyLabel,
      el("button", { type: "button", onclick: () => { draft.qty += 1; refresh(); } }, "+"),
    ]),
    el("button", {
      type: "button",
      class: "btn btn-primary flex-1",
      onclick: onConfirm,
    }, [el("span", {}, "Adicionar"), priceLabel]),
  ]);

  function refresh() {
    qtyLabel.textContent = String(draft.qty);
    const unit = priceOf({
      type: draft.type,
      flavors: draft.flavors.map((f) => ({ price: f && (f.price ?? 0) })),
      border: draft.border,
      extras: draft.extras,
    });
    priceLabel.textContent = unit ? `· ${formatBRL(unit * draft.qty)}` : "";
  }
  return { node, refresh };
}
