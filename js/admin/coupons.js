// ============================================================================
// admin/coupons.js — CRUD de cupons de desconto
// ============================================================================

import { db, collection, doc, setDoc, deleteDoc, onSnapshot } from "../firebase-config.js";
import { $, el, openSheet, toast, confirmSheet, parseMoney, formatBRL } from "../ui.js";

let coupons = [];
let unsub = null;

export function initCoupons() {
  unsub = onSnapshot(collection(db, "coupons"), (s) => {
    coupons = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  $("#addCouponBtn").onclick = () => editCoupon();
}
export function stopCoupons() { unsub?.(); unsub = null; }

function render() {
  const root = $("#couponsList");
  root.innerHTML = "";
  if (!coupons.length) { root.innerHTML = `<p class="text-sm text-charcoal-400 text-center py-6">Nenhum cupom.</p>`; return; }
  for (const c of coupons) {
    const val = c.type === "percent" ? `${c.value}%` : formatBRL(c.value);
    const used = c.usageLimit != null ? `${c.used || 0}/${c.usageLimit}` : `${c.used || 0} usos`;
    root.append(el("div", { class: "flex items-center gap-2 py-2 border-b border-charcoal-100" }, [
      el("button", { class: "flex-1 text-left", onclick: () => editCoupon(c) }, [
        el("span", { class: `font-bold text-sm ${c.active === false ? "text-charcoal-400 line-through" : "text-charcoal-800"}` }, c.code),
        el("span", { class: "text-xs text-charcoal-400 block" },
          `${val} · mín. ${formatBRL(c.minOrder || 0)} · ${used}${c.expiresAt ? " · exp. " + fmtDate(c.expiresAt) : ""}`),
      ]),
      el("button", { class: "text-red-500 text-xs px-2", onclick: () => remove(c) }, "Excluir"),
    ]));
  }
}

function editCoupon(c = null) {
  const f = el("form", { class: "space-y-4" });
  const code = input("Código", c?.code || "", { required: true, autocapitalize: "characters", disabled: !!c });
  const type = selectField("Tipo", [["percent", "Percentual (%)"], ["fixed", "Valor fixo (R$)"]], c?.type || "percent");
  const value = input("Valor", c?.value ?? "", { inputmode: "decimal", required: true });
  const minOrder = input("Pedido mínimo (R$)", c?.minOrder ?? "", { inputmode: "decimal" });
  const limit = input("Limite de usos (vazio = ilimitado)", c?.usageLimit ?? "", { type: "number" });
  const expires = input("Expira em", c?.expiresAt ? toDateInput(c.expiresAt) : "", { type: "date" });
  const active = toggle("Cupom ativo", c ? c.active !== false : true);

  f.append(code.node, type.node, value.node, minOrder.node, limit.node, expires.node, active.node,
    el("button", { type: "submit", class: "w-full h-12 rounded-xl bg-brand-600 text-white font-bold" }, "Salvar"));

  f.onsubmit = async (e) => {
    e.preventDefault();
    const codeUp = (c?.code || code.value()).trim().toUpperCase();
    if (!codeUp) return toast("Informe o código.", "warn");
    const data = {
      code: codeUp,
      type: type.value(),
      value: parseMoney(value.value()),
      minOrder: parseMoney(minOrder.value()),
      usageLimit: limit.value() ? Number(limit.value()) : null,
      expiresAt: expires.value() ? new Date(expires.value() + "T23:59:59") : null,
      active: active.value(),
      used: c?.used || 0,
    };
    try {
      await setDoc(doc(db, "coupons", codeUp), data);
      toast("Cupom salvo!", "success");
      sheet.close();
    } catch (err) {
      console.error(err);
      toast("Falha ao salvar cupom.", "error");
    }
  };
  const sheet = openSheet(f, { title: c ? `Editar ${c.code}` : "Novo cupom" });
}

async function remove(c) {
  if (!(await confirmSheet(`Excluir o cupom ${c.code}?`, { okText: "Excluir" }))) return;
  try { await deleteDoc(doc(db, "coupons", c.id)); toast("Cupom removido.", "info"); }
  catch (e) { console.error(e); toast("Falha ao remover.", "error"); }
}

// helpers
function input(label, value, attrs = {}) {
  const inp = el("input", { class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm disabled:bg-charcoal-50", value: value ?? "", ...attrs });
  return { node: wrap(label, inp), value: () => inp.value };
}
function selectField(label, opts, selected) {
  const sel = el("select", { class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm bg-white" });
  for (const [v, l] of opts) { const o = el("option", { value: v }, l); if (v === selected) o.selected = true; sel.append(o); }
  return { node: wrap(label, sel), value: () => sel.value };
}
function toggle(label, checked) {
  const inp = el("input", { type: "checkbox", class: "w-5 h-5 accent-brand-600" });
  inp.checked = !!checked;
  return { node: el("label", { class: "flex items-center justify-between py-1" }, [el("span", { class: "text-sm text-charcoal-700" }, label), inp]), value: () => inp.checked };
}
function wrap(label, control) {
  return el("label", { class: "block" }, [el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" }, label), control]);
}
function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("pt-BR");
}
function toDateInput(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().slice(0, 10);
}
