// ============================================================================
// admin/products.js — CRUD de categorias, produtos e adicionais
// ============================================================================

import {
  db, collection, doc, addDoc, setDoc, deleteDoc, onSnapshot,
  storage, storageRef, uploadBytes, getDownloadURL,
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
      const price = (p.type === "pizza"
        ? `P ${formatBRL(p.prices?.P || 0)} · GG ${formatBRL(p.prices?.GG || 0)}`
        : formatBRL(p.price || 0)) + (p.promoActive ? " · 🔥 promo" : "");
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
  return el("div", { class: "flex items-center gap-2 py-2.5 border-b border-charcoal-200 last:border-0" }, [
    el("button", { type: "button", class: "flex-1 text-left min-w-0", onclick: onEdit }, [
      el("span", { class: "font-semibold text-sm text-charcoal-800 block truncate" }, title),
      el("span", { class: "text-xs text-charcoal-400" }, meta),
    ]),
    el("button", { type: "button", class: "text-charcoal-500 text-xs font-semibold px-2 py-1 rounded-lg bg-charcoal-100", onclick: onEdit }, "Editar"),
    el("button", { type: "button", class: "text-red-500 text-xs font-semibold px-2 py-1", onclick: onDelete }, "Excluir"),
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
  const serves = input("Serve quantas pessoas? (opcional)", p?.serves || "", { placeholder: "Ex.: Serve 2–3" });
  const img = fileImage("Imagem do produto (opcional)", p?.imageUrl || "");
  const order = input("Ordem", p?.order ?? 99, { type: "number" });

  // Preços de tabela
  const priceBox = el("div", { class: "space-y-2" });
  const simplePrice = input("Preço (R$)", p?.price ?? "", { inputmode: "decimal" });
  const sizeInputs = {};
  const pizzaBox = el("div", { class: "grid grid-cols-2 gap-2" });
  for (const s of SIZES) {
    sizeInputs[s] = input(`${s} — ${SIZE_LABELS[s]}`, p?.prices?.[s] ?? "", { inputmode: "decimal" });
    pizzaBox.append(sizeInputs[s].node);
  }

  // Preços promocionais
  const promoActive = toggle("Promoção ativa (mostra preço riscado)", !!p?.promoActive);
  const promoBox = el("div", { class: "space-y-2" });
  const simplePromo = input("Preço promocional (R$)", p?.promoPrice ?? "", { inputmode: "decimal" });
  const promoSizeInputs = {};
  const pizzaPromoBox = el("div", { class: "grid grid-cols-2 gap-2" });
  for (const s of SIZES) {
    promoSizeInputs[s] = input(`${s} promo`, p?.promoPrices?.[s] ?? "", { inputmode: "decimal" });
    pizzaPromoBox.append(promoSizeInputs[s].node);
  }
  const promoWrap = el("fieldset", { class: "fieldset space-y-2" }, [
    el("legend", {}, "🔥 Promoção"),
    promoActive.node,
    promoBox,
  ]);

  const halfElig = toggle("Disponível para meia a meia", p ? p.halfEligible !== false : true);
  const featured = toggle("Destaque na home", !!p?.featured);
  const active = toggle("Produto ativo", p ? p.active !== false : true);

  const syncType = () => {
    const isPizza = type.value() === "pizza";
    priceBox.innerHTML = "";
    priceBox.append(isPizza ? pizzaBox : simplePrice.node);
    promoBox.innerHTML = "";
    promoBox.append(isPizza ? pizzaPromoBox : simplePromo.node);
    halfElig.node.hidden = !isPizza;
  };
  type.node.querySelector("select").addEventListener("change", syncType);

  f.append(name.node, cat.node, type.node, desc.node, serves.node, priceBox, promoWrap,
    img.node, order.node, halfElig.node, featured.node, active.node, saveRow());
  syncType();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const isPizza = type.value() === "pizza";
    const data = {
      name: name.value(), categoryId: cat.value(), type: type.value(),
      description: desc.value(), serves: serves.value().trim(),
      order: Number(order.value()) || 99,
      featured: featured.value(), active: active.value(),
      promoActive: promoActive.value(),
      tags: promoActive.value() ? ["promo"] : [],
    };
    if (isPizza) {
      data.prices = {};
      data.promoPrices = {};
      for (const s of SIZES) {
        const v = parseMoney(sizeInputs[s].value()); if (v) data.prices[s] = v;
        const pv = parseMoney(promoSizeInputs[s].value()); if (pv) data.promoPrices[s] = pv;
      }
      data.halfEligible = halfElig.value();
      data.promoPrice = null;
      if (!Object.keys(data.prices).length) return toast("Informe ao menos um preço.", "warn");
    } else {
      data.price = parseMoney(simplePrice.value());
      data.promoPrice = parseMoney(simplePromo.value()) || null;
      data.promoPrices = null;
      if (!data.price) return toast("Informe o preço.", "warn");
    }

    // Faz o upload da imagem (se houver arquivo novo) e usa a URL gerada.
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      data.imageUrl = await img.resolve();
    } catch {
      btn.disabled = false;
      return toast("Falha ao enviar a imagem. Tente novamente.", "error");
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
  const inp = el("input", { class: "field", value: value ?? "", ...attrs });
  return { node: wrapField(label, inp), value: () => inp.value, input: inp };
}
/**
 * Campo de upload de imagem para o Firebase Storage.
 * - `change`: mostra um preview local imediato.
 * - `resolve()`: chamado no submit — se houver arquivo novo, faz `uploadBytes`
 *   em `produtos/${Date.now()}_${nome}` e devolve a `getDownloadURL`.
 *   Sem arquivo novo, mantém a URL atual do produto.
 */
function fileImage(label, currentUrl = "") {
  const inp = el("input", { type: "file", id: "imageUpload", accept: "image/*", class: "field" });
  const status = el("p", { class: "text-xs text-charcoal-400 mt-1", hidden: true });
  const preview = el("img", {
    class: "mt-2 rounded-lg max-h-32 w-auto object-cover border border-charcoal-200",
    hidden: !currentUrl, alt: "Pré-visualização",
  });
  if (currentUrl) preview.src = currentUrl;

  inp.addEventListener("change", () => {
    const file = inp.files?.[0];
    status.hidden = true;
    if (!file) return;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  async function resolve() {
    const file = inp.files?.[0];
    if (!file) return currentUrl;

    status.hidden = false;
    status.textContent = "⏳ Enviando imagem…";
    status.className = "text-xs text-brand-600 font-semibold mt-1";
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `produtos/${Date.now()}_${safeName}`;
      const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      const url = await getDownloadURL(snap.ref);
      status.textContent = "✅ Imagem enviada.";
      status.className = "text-xs text-green-600 font-semibold mt-1";
      return url;
    } catch (err) {
      console.error("[storage] upload falhou:", err);
      status.textContent = "❌ Não foi possível enviar a imagem.";
      status.className = "text-xs text-red-600 font-semibold mt-1";
      throw err;
    }
  }

  const node = wrapField(label, inp);
  node.append(status, preview);
  return { node, resolve };
}

function textarea(label, value) {
  const inp = el("textarea", { class: "field", rows: "2" }, value || "");
  inp.value = value || "";
  return { node: wrapField(label, inp), value: () => inp.value };
}
function select(label, opts, selected) {
  const sel = el("select", { class: "field" });
  for (const [v, l] of opts) {
    const o = el("option", { value: v }, l);
    if (v === selected) o.selected = true;
    sel.append(o);
  }
  return { node: wrapField(label, sel), value: () => sel.value };
}
function toggle(label, checked) {
  const inp = el("input", { type: "checkbox", class: "switch" });
  inp.checked = !!checked;
  const node = el("label", { class: "toggle-row cursor-pointer" }, [
    el("span", {}, label), inp,
  ]);
  return { node, value: () => inp.checked };
}
function wrapField(label, control) {
  return el("label", { class: "block" }, [
    el("span", { class: "field-label" }, label),
    control,
  ]);
}
function saveRow() {
  return el("button", { type: "submit", class: "btn btn-primary btn-block" }, "Salvar");
}
