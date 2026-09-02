// ============================================================================
// admin/settings.js — configuração da loja (horários, taxas, PIX, mínimo…)
// ============================================================================

import { db, doc, onSnapshot, setDoc } from "../firebase-config.js";
import { $, el, toast, parseMoney, formatBRL } from "../ui.js";
import { DEFAULT_SETTINGS } from "../store.js";

const DAYS = [
  ["mon", "Segunda"], ["tue", "Terça"], ["wed", "Quarta"], ["thu", "Quinta"],
  ["fri", "Sexta"], ["sat", "Sábado"], ["sun", "Domingo"],
];

let current = { ...DEFAULT_SETTINGS };
let unsub = null;

export function initSettings() {
  unsub = onSnapshot(doc(db, "settings", "store"), (snap) => {
    current = snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS };
    render();
  });
}
export function stopSettings() { unsub?.(); unsub = null; }

function render() {
  const root = $("#settingsForm");
  root.innerHTML = "";
  const s = current;

  const name = field("Nome da pizzaria", s.name);
  const whats = field("WhatsApp (só números, com DDI/DDD)", s.whatsapp, { placeholder: "5583999999999", inputmode: "tel" });
  const addr = field("Endereço (para retirada)", s.address);
  const pixKey = field("Chave PIX", s.pixKey);
  const pixName = field("Nome no PIX", s.pixName);
  const eta = field("Tempo estimado de entrega", s.deliveryEstimate, { placeholder: "40–60 min" });
  const minOrder = field("Pedido mínimo (R$)", s.minOrder || "", { inputmode: "decimal" });
  const defFee = field("Taxa de entrega padrão (R$)", s.defaultDeliveryFee || "", { inputmode: "decimal" });

  const openManual = toggle("Loja aberta (chave geral)", s.isOpenManual !== false);
  const pickup = toggle("Permitir retirada no balcão", s.pickupEnabled !== false);
  const halfRule = selectField("Regra meia a meia", [["max", "Preço do sabor mais caro"], ["avg", "Média dos dois sabores"]], s.halfPriceRule || "max");

  // Horários
  const hoursBox = el("div", { class: "space-y-2" });
  const hourInputs = {};
  for (const [key, label] of DAYS) {
    const h = s.hours?.[key] || { enabled: false, open: "18:00", close: "23:00" };
    const en = el("input", { type: "checkbox", class: "w-4 h-4 accent-brand-600" });
    en.checked = h.enabled !== false;
    const open = el("input", { type: "time", value: h.open || "18:00", class: "field-inline" });
    const close = el("input", { type: "time", value: h.close || "23:00", class: "field-inline" });
    hourInputs[key] = { en, open, close };
    hoursBox.append(el("div", { class: "flex items-center gap-2" }, [
      el("label", { class: "flex items-center gap-1.5 w-24 text-sm" }, [en, label]),
      open, el("span", { class: "text-charcoal-400" }, "às"), close,
    ]));
  }

  // Taxas por bairro
  const feesBox = el("div", { class: "space-y-2" });
  let fees = (s.deliveryFees || []).map((f) => ({ ...f }));
  const renderFees = () => {
    feesBox.innerHTML = "";
    fees.forEach((f, i) => {
      const nb = el("input", { value: f.neighborhood || "", placeholder: "Bairro", class: "field-inline flex-1" });
      const fee = el("input", { value: f.fee ?? "", placeholder: "R$", inputmode: "decimal", class: "field-inline w-20 shrink-0" });
      nb.oninput = () => (fees[i].neighborhood = nb.value);
      fee.oninput = () => (fees[i].fee = parseMoney(fee.value));
      feesBox.append(el("div", { class: "flex gap-2" }, [
        nb, fee,
        el("button", { type: "button", class: "text-red-500 text-sm px-1", onclick: () => { fees.splice(i, 1); renderFees(); } }, "✕"),
      ]));
    });
    feesBox.append(el("button", {
      type: "button", class: "text-sm font-semibold text-brand-600",
      onclick: () => { fees.push({ neighborhood: "", fee: 0 }); renderFees(); },
    }, "+ Adicionar bairro"));
  };
  renderFees();

  const form = el("form", { class: "space-y-5" }, [
    grp("Identidade", [name.node, whats.node, addr.node]),
    grp("Pagamento PIX", [pixKey.node, pixName.node]),
    grp("Operação", [openManual.node, pickup.node, eta.node, minOrder.node, halfRule.node]),
    grp("Horário de funcionamento", [hoursBox]),
    grp("Taxas de entrega", [defFee.node, el("p", { class: "text-xs text-charcoal-400" }, "Taxas específicas por bairro (sobrepõem a padrão):"), feesBox]),
    el("button", { type: "submit", class: "btn btn-primary btn-block" }, "Salvar configurações"),
  ]);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const hours = {};
    for (const [key] of DAYS) {
      hours[key] = { enabled: hourInputs[key].en.checked, open: hourInputs[key].open.value, close: hourInputs[key].close.value };
    }
    const data = {
      name: name.value(), whatsapp: String(whats.value()).replace(/\D/g, ""), address: addr.value(),
      pixKey: pixKey.value(), pixName: pixName.value(),
      deliveryEstimate: eta.value(),
      minOrder: parseMoney(minOrder.value()),
      defaultDeliveryFee: parseMoney(defFee.value()),
      isOpenManual: openManual.value(), pickupEnabled: pickup.value(),
      halfPriceRule: halfRule.value(),
      hours,
      deliveryFees: fees.filter((f) => f.neighborhood).map((f) => ({ neighborhood: f.neighborhood.trim(), fee: Number(f.fee) || 0 })),
    };
    try {
      await setDoc(doc(db, "settings", "store"), data, { merge: true });
      toast("Configurações salvas!", "success");
    } catch (err) {
      console.error(err);
      toast("Falha ao salvar configurações.", "error");
    }
  };

  root.append(form);
}

// ---- widgets -----------------------------------------------
function field(label, value, attrs = {}) {
  const inp = el("input", { class: "field", value: value ?? "", ...attrs });
  return { node: wrap(label, inp), value: () => inp.value };
}
function selectField(label, opts, selected) {
  const sel = el("select", { class: "field" });
  for (const [v, l] of opts) { const o = el("option", { value: v }, l); if (v === selected) o.selected = true; sel.append(o); }
  return { node: wrap(label, sel), value: () => sel.value };
}
function toggle(label, checked) {
  const inp = el("input", { type: "checkbox", class: "switch" });
  inp.checked = !!checked;
  return { node: el("label", { class: "toggle-row cursor-pointer" }, [el("span", {}, label), inp]), value: () => inp.checked };
}
function wrap(label, control) {
  return el("label", { class: "block" }, [el("span", { class: "field-label" }, label), control]);
}
function grp(title, children) {
  return el("fieldset", { class: "fieldset space-y-2" }, [
    el("legend", {}, title),
    ...children,
  ]);
}
