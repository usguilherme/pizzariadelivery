// ============================================================================
// admin/products.js — CRUD de categorias, produtos e adicionais
// ============================================================================

import {
  db, collection, doc, addDoc, setDoc, deleteDoc, onSnapshot,
} from "../firebase-config.js";
import { $, el, openSheet, toast, confirmSheet, formatBRL, parseMoney } from "../ui.js";
import { SIZES, SIZE_LABELS } from "../store.js";

let categories = [];
let products = [];
let addons = [];
const unsubs = [];

export function initProducts() {
  unsubs.push(
    onSnapshot(collection(db, "categories"), (s) => { categories = docs(s); render(); }),
    onSnapshot(collection(db, "products"), (s) => { products = docs(s); render(); }),
    onSnapshot(collection(db, "addons"), (s) => { addons = docs(s); render(); }),
  );
  $("#addCategoryBtn").onclick = () => editCategory();
  $("#addProductBtn").onclick = () => editProduct();
  $("#addAddonBtn").onclick = () => editAddon();
}
export function stopProducts() { unsubs.forEach((u) => u()); unsubs.length = 0; }

const docs = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

// ---- Render --------------------------------------------------
function render() {
  renderCategories();
  renderProducts();
  renderAddons();
}

function renderCategories() {
  const root = $("#categoriesList");
  root.innerHTML = "";
  for (const c of categories) {
    root.append(rowItem(c.name, c.active === false ? "inativa" : `#${c.order ?? "-"}`,
      () => editCategory(c),
      () => removeDoc("categories", c.id, `Excluir categoria "${c.name}"? Produtos ficam sem categoria.`)));
  }
  if (!categories.length) root.innerHTML = empty("Nenhuma categoria.");
}

function renderProducts() {
  const root = $("#productsList");
  root.innerHTML = "";
  for (const cat of categories) {
    const items = products.filter((p) => p.categoryId === cat.id);
    if (!items.length) continue;
    root.append(el("h4", { class: "text-xs font-bold text-charcoal-400 uppercase mt-3 mb-1" }, cat.name));
    for (const p of items) {
      const price = p.type === "pizza"
        ? `P ${formatBRL(p.prices?.P || 0)} · GG ${formatBRL(p.prices?.GG || 0)}`
        : formatBRL(p.price || 0);
      root.append(rowItem(
        `${p.name}${p.featured ? " ⭐" : ""}${p.active === false ? " (inativo)" : ""}`,
        price,
        () => editProduct(p),
        () => removeDoc("products", p.id, `Excluir "${p.name}"?`),
      ));
    }
  }
  const orphans = products.filter((p) => !categories.some((c) => c.id === p.categoryId));
  if (orphans.length) {
    root.append(el("h4", { class: "text-xs font-bold text-red-400 uppercase mt-3 mb-1" }, "Sem categoria"));
    for (const p of orphans) root.append(rowItem(p.name, "—", () => editProduct(p), () => removeDoc("products", p.id, `Excluir "${p.name}"?`)));
  }
  if (!products.length) root.innerHTML = empty("Nenhum produto.");
}

function renderAddons() {
  const root = $("#addonsList");
  root.innerHTML = "";
  for (const grp of ["borda", "extra"]) {
    const items = addons.filter((a) => a.group === grp);
    if (!items.length) continue;
    root.append(el("h4", { class: "text-xs font-bold text-charcoal-400 uppercase mt-3 mb-1" }, grp === "borda" ? "Bordas" : "Adicionais"));
    for (const a of items) {
      root.append(rowItem(`${a.name}${a.active === false ? " (inativo)" : ""}`, formatBRL(a.price || 0),
        () => editAddon(a),
        () => removeDoc("addons", a.id, `Excluir "${a.name}"?`)));
    }
  }
  if (!addons.length) root.innerHTML = empty("Nenhum adicional.");
}

function rowItem(title, meta, onEdit, onDelete) {
  return el("div", { class: "flex items-center gap-2 py-2 border-b border-charcoal-100" }, [
    el("button", { class: "flex-1 text-left", onclick: onEdit }, [
      el("span", { class: "font-semibold text-sm text-charcoal-800 block" }, title),
      el("span", { class: "text-xs text-charcoal-400" }, meta),
    ]),
    el("button", { class: "text-charcoal-400 text-xs px-2", onclick: onEdit }, "Editar"),
    el("button", { class: "text-red-500 text-xs px-2", onclick: onDelete }, "Excluir"),
  ]);
}
const empty = (t) => `<p class="text-sm text-charcoal-400 py-4 text-center">${t}</p>`;

async function removeDoc(col, id, msg) {
  if (!(await confirmSheet(msg, { okText: "Excluir" }))) return;
  try { await deleteDoc(doc(db, col, id)); toast("Removido.", "info"); }
  catch (e) { console.error(e); toast("Falha ao remover.", "error"); }
}

// ---- Formulários -------------------------------------------
function editCategory(c = null) {
  const f = el("form", { class: "space-y-4" });
  const name = input("Nome", c?.name || "", { required: true });
  const order = input("Ordem", c?.order ?? categories.length + 1, { type: "number" });
  const desc = input("Descrição (opcional)", c?.description || "");
  const active = toggle("Categoria ativa", c ? c.active !== false : true);
  f.append(name.node, order.node, desc.node, active.node, saveRow());
  f.onsubmit = async (e) => {
    e.preventDefault();
    const data = { name: name.value(), order: Number(order.value()) || 99, description: desc.value(), active: active.value() };
    await save("categories", c?.id, data);
    sheet.close();
  };
  const sheet = openSheet(f, { title: c ? "Editar categoria" : "Nova categoria" });
}

function editProduct(p = null) {
  const f = el("form", { class: "space-y-4" });
  const name = input("Nome", p?.name || "", { required: true });
  const cat = select("Categoria", categories.map((c) => [c.id, c.name]), p?.categoryId || categories[0]?.id);
  const type = select("Tipo", [["pizza", "Pizza (com tamanhos)"], ["simple", "Simples (preço único)"]], p?.type || "pizza");
  const desc = textarea("Descrição", p?.description || "");
  const img = input("URL da imagem (opcional)", p?.imageUrl || "");
  const order = input("Ordem", p?.order ?? 99, { type: "number" });

  // Preços
  const priceBox = el("div", { class: "space-y-2" });
  const simplePrice = input("Preço (R$)", p?.price ?? "", { inputmode: "decimal" });
  const sizeInputs = {};
  const pizzaBox = el("div", { class: "grid grid-cols-2 gap-2" });
  for (const s of SIZES) {
    sizeInputs[s] = input(`${s} — ${SIZE_LABELS[s]}`, p?.prices?.[s] ?? "", { inputmode: "decimal" });
    pizzaBox.append(sizeInputs[s].node);
  }
  const halfElig = toggle("Disponível para meia a meia", p ? p.halfEligible !== false : true);
  const featured = toggle("Destaque na home", !!p?.featured);
  const promo = toggle("Marcar como PROMO", !!p?.tags?.includes("promo"));
  const active = toggle("Produto ativo", p ? p.active !== false : true);

  const syncType = () => {
    const isPizza = type.value() === "pizza";
    priceBox.innerHTML = "";
    priceBox.append(isPizza ? pizzaBox : simplePrice.node);
    halfElig.node.hidden = !isPizza;
  };
  type.node.querySelector("select").addEventListener("change", syncType);

  f.append(name.node, cat.node, type.node, desc.node, priceBox, img.node, order.node,
    halfElig.node, featured.node, promo.node, active.node, saveRow());
  syncType();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const isPizza = type.value() === "pizza";
    const data = {
      name: name.value(), categoryId: cat.value(), type: type.value(),
      description: desc.value(), imageUrl: img.value(), order: Number(order.value()) || 99,
      featured: featured.value(), active: active.value(),
      tags: promo.value() ? ["promo"] : [],
    };
    if (isPizza) {
      data.prices = {};
      for (const s of SIZES) { const v = parseMoney(sizeInputs[s].value()); if (v) data.prices[s] = v; }
      data.halfEligible = halfElig.value();
      if (!Object.keys(data.prices).length) return toast("Informe ao menos um preço.", "warn");
    } else {
      data.price = parseMoney(simplePrice.value());
      if (!data.price) return toast("Informe o preço.", "warn");
    }
    await save("products", p?.id, data);
    sheet.close();
  };
  const sheet = openSheet(f, { title: p ? "Editar produto" : "Novo produto" });
}

function editAddon(a = null) {
  const f = el("form", { class: "space-y-4" });
  const name = input("Nome", a?.name || "", { required: true });
  const group = select("Grupo", [["borda", "Borda recheada"], ["extra", "Adicional"]], a?.group || "borda");
  const price = input("Preço (R$)", a?.price ?? "", { inputmode: "decimal", required: true });
  const order = input("Ordem", a?.order ?? 99, { type: "number" });
  const active = toggle("Ativo", a ? a.active !== false : true);
  f.append(name.node, group.node, price.node, order.node, active.node, saveRow());
  f.onsubmit = async (e) => {
    e.preventDefault();
    await save("addons", a?.id, {
      name: name.value(), group: group.value(), price: parseMoney(price.value()),
      order: Number(order.value()) || 99, active: active.value(),
    });
    sheet.close();
  };
  const sheet = openSheet(f, { title: a ? "Editar adicional" : "Novo adicional" });
}

async function save(col, id, data) {
  try {
    if (id) await setDoc(doc(db, col, id), data, { merge: true });
    else await addDoc(collection(db, col), data);
    toast("Salvo!", "success");
  } catch (e) {
    console.error(e);
    toast("Falha ao salvar.", "error");
  }
}

// ---- widgets de form -------------------------------------
function input(label, value, attrs = {}) {
  const inp = el("input", {
    class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm", value: value ?? "", ...attrs,
  });
  return { node: wrapField(label, inp), value: () => inp.value, input: inp };
}
function textarea(label, value) {
  const inp = el("textarea", { class: "w-full rounded-xl border border-charcoal-200 py-2 px-3 text-sm", rows: "2" }, value || "");
  inp.value = value || "";
  return { node: wrapField(label, inp), value: () => inp.value };
}
function select(label, opts, selected) {
  const sel = el("select", { class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm bg-white" });
  for (const [v, l] of opts) {
    const o = el("option", { value: v }, l);
    if (v === selected) o.selected = true;
    sel.append(o);
  }
  return { node: wrapField(label, sel), value: () => sel.value };
}
function toggle(label, checked) {
  const inp = el("input", { type: "checkbox", class: "w-5 h-5 accent-brand-600" });
  inp.checked = !!checked;
  const node = el("label", { class: "flex items-center justify-between py-1" }, [
    el("span", { class: "text-sm text-charcoal-700" }, label), inp,
  ]);
  return { node, value: () => inp.checked };
}
function wrapField(label, control) {
  return el("label", { class: "block" }, [
    el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" }, label),
    control,
  ]);
}
function saveRow() {
  return el("button", { type: "submit", class: "w-full h-12 rounded-xl bg-brand-600 text-white font-bold" }, "Salvar");
}
