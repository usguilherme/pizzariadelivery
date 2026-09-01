// ============================================================================
// checkout.js — barra de carrinho flutuante, revisão do carrinho e checkout
// ============================================================================

import { $, el, openSheet, toast, formatBRL, confirmSheet, escapeHtml } from "./ui.js";
import {
  state, storeStatus, deliveryFeeFor, neighborhoods,
} from "./store.js";
import * as cart from "./cart.js";
import { validateCoupon } from "./coupon.js";
import { createOrder } from "./order.js";
import { buildOrderMessage, whatsappUrl } from "./whatsapp.js";

const CUST_KEY = "pd_customer_v1";

let applied = null; // { coupon, discount, code }

// ---- Barra flutuante ------------------------------------------------
export function initCartBar() {
  const bar = $("#cartBar");
  if (!bar) return;
  cart.onCartChange(() => {
    const n = cart.count();
    if (n === 0) {
      bar.classList.add("translate-y-24");
      return;
    }
    bar.classList.remove("translate-y-24");
    $("#cartBarCount").textContent = `${n} ${n === 1 ? "item" : "itens"}`;
    $("#cartBarTotal").textContent = formatBRL(cart.subtotal());
  });
  bar.querySelector("button").addEventListener("click", openCart);
}

// ---- Revisão do carrinho ------------------------------------------
export function openCart() {
  if (cart.isEmpty()) return toast("Seu carrinho está vazio.", "warn");
  const wrap = el("div", { class: "space-y-4" });
  const list = el("div", { class: "space-y-3" });
  const totalRow = el("div", { class: "flex justify-between font-bold text-lg pt-2 border-t border-charcoal-100" });

  function render() {
    list.innerHTML = "";
    for (const it of cart.getItems()) {
      list.append(el("div", { class: "flex gap-3 items-start" }, [
        el("div", { class: "flex-1" }, [
          el("p", { class: "font-semibold text-charcoal-900 text-sm" }, it.name),
          it.border ? el("p", { class: "text-xs text-charcoal-500" }, `Borda: ${it.border.name}`) : null,
          it.extras?.length ? el("p", { class: "text-xs text-charcoal-500" }, `Adicionais: ${it.extras.map((e) => e.name).join(", ")}`) : null,
          it.notes ? el("p", { class: "text-xs text-charcoal-400 italic" }, it.notes) : null,
          el("p", { class: "text-sm font-bold text-brand-700 mt-0.5" }, formatBRL(it.lineTotal)),
        ]),
        el("div", { class: "flex items-center gap-1 border border-charcoal-200 rounded-lg" }, [
          el("button", { class: "w-8 h-8 font-bold text-charcoal-500", onclick: () => { cart.dec(it.uid); render(); } }, "−"),
          el("span", { class: "w-6 text-center text-sm font-bold" }, String(it.qty)),
          el("button", { class: "w-8 h-8 font-bold text-charcoal-500", onclick: () => { cart.inc(it.uid); render(); } }, "+"),
        ]),
      ]));
    }
    totalRow.innerHTML = "";
    totalRow.append(el("span", {}, "Subtotal"), el("span", {}, formatBRL(cart.subtotal())));
    if (cart.isEmpty()) sheet.close();
  }

  render();
  wrap.append(
    list,
    totalRow,
    el("button", {
      class: "w-full h-12 rounded-xl bg-brand-600 text-white font-bold",
      onclick: () => { sheet.close(); openCheckout(); },
    }, "Continuar para entrega"),
    el("button", {
      class: "w-full h-10 text-sm text-charcoal-500 font-medium",
      onclick: async () => { if (await confirmSheet("Esvaziar o carrinho?")) { cart.clear(); sheet.close(); } },
    }, "Esvaziar carrinho"),
  );
  const sheet = openSheet(wrap, { title: "Seu pedido" });
}

// ---- Checkout ------------------------------------------------------
export function openCheckout() {
  const st = storeStatus();
  const s = state.settings;
  const saved = loadCustomer();

  const form = el("form", { class: "space-y-5", novalidate: true });

  // Aviso de loja fechada
  if (!st.open) {
    form.append(el("div", { class: "bg-red-50 text-red-700 text-sm font-medium rounded-xl p-3" },
      `A loja está fechada (${st.reason}). Não é possível finalizar pedidos agora.`));
  }

  // -- Dados do cliente --
  const name = field("Nome", "text", { required: true, value: saved.name, placeholder: "Seu nome" });
  const phone = field("WhatsApp", "tel", { required: true, value: saved.phone, placeholder: "(00) 00000-0000", inputmode: "tel" });
  form.append(group("Seus dados", [name.node, phone.node]));

  // -- Entrega x Retirada --
  let fulfillment = s.pickupEnabled ? (saved.fulfillment || "delivery") : "delivery";
  const fulRow = el("div", { class: "grid grid-cols-2 gap-2" });
  const addrBox = el("div", { class: "space-y-3" });

  const street = field("Rua / Av.", "text", { required: true, value: saved.address?.street });
  const number = field("Número", "text", { required: true, value: saved.address?.number });
  const district = districtField(saved.address?.district);
  const complement = field("Complemento", "text", { value: saved.address?.complement, placeholder: "Apto, bloco…" });
  const reference = field("Referência", "text", { value: saved.address?.reference, placeholder: "Perto de…" });
  addrBox.append(street.node, el("div", { class: "grid grid-cols-2 gap-2" }, [number.node, district.node]), complement.node, reference.node);

  const renderFul = () => {
    fulRow.innerHTML = "";
    const opts = [["delivery", "🛵 Entrega"]];
    if (s.pickupEnabled) opts.push(["pickup", "🏪 Retirada"]);
    for (const [val, label] of opts) {
      const active = fulfillment === val;
      fulRow.append(el("button", {
        type: "button",
        class: `py-2.5 rounded-xl border text-sm font-semibold ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-charcoal-200 text-charcoal-600"}`,
        onclick: () => { fulfillment = val; renderFul(); addrBox.hidden = val !== "delivery"; recalc(); },
      }, label));
    }
    addrBox.hidden = fulfillment !== "delivery";
  };
  renderFul();
  form.append(group("Como você quer receber?", [fulRow, addrBox]));

  // -- Pagamento --
  let payMethod = saved.payMethod || "pix";
  const payRow = el("div", { class: "grid grid-cols-3 gap-2" });
  const changeField = field("Troco para", "text", { placeholder: "R$", inputmode: "decimal" });
  changeField.node.hidden = true;
  const renderPay = () => {
    payRow.innerHTML = "";
    for (const [val, label] of [["pix", "PIX"], ["card", "Cartão"], ["cash", "Dinheiro"]]) {
      const active = payMethod === val;
      payRow.append(el("button", {
        type: "button",
        class: `py-2.5 rounded-xl border text-sm font-semibold ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-charcoal-200 text-charcoal-600"}`,
        onclick: () => { payMethod = val; renderPay(); changeField.node.hidden = val !== "cash"; },
      }, label));
    }
  };
  renderPay();
  const pixHint = s.pixKey ? el("p", { class: "text-xs text-charcoal-500" }, `Chave PIX: ${s.pixKey}${s.pixName ? " (" + s.pixName + ")" : ""}`) : null;
  form.append(group("Pagamento", [payRow, changeField.node, pixHint].filter(Boolean)));

  // -- Cupom --
  const couponInput = field("Cupom de desconto", "text", { placeholder: "Opcional", autocapitalize: "characters" });
  const couponMsg = el("p", { class: "text-xs font-medium" });
  const couponBtn = el("button", {
    type: "button", class: "px-4 rounded-xl bg-charcoal-100 font-semibold text-sm shrink-0",
    onclick: async () => {
      const r = await validateCoupon(couponInput.input.value, cart.subtotal());
      applied = r.ok ? { ...r, code: r.coupon.code } : null;
      couponMsg.textContent = r.message || "";
      couponMsg.className = `text-xs font-medium ${r.ok ? "text-emerald-600" : "text-red-600"}`;
      recalc();
    },
  }, "Aplicar");
  form.append(group("Cupom", [
    el("div", { class: "flex gap-2" }, [couponInput.node, couponBtn]),
    couponMsg,
  ]));

  // -- Observações --
  const notes = el("textarea", {
    class: "w-full rounded-xl border border-charcoal-200 py-2 px-3 text-sm resize-none", rows: "2",
    placeholder: "Alguma observação para a cozinha ou entrega?",
  });
  form.append(group("Observações", [notes]));

  // -- Resumo --
  const sumSub = sumLine("Subtotal");
  const sumFee = sumLine("Taxa de entrega");
  const sumDisc = sumLine("Desconto");
  const sumTotal = sumLine("Total", true);
  const minWarn = el("p", { class: "text-xs text-amber-600 font-medium" });
  form.append(el("div", { class: "space-y-1 pt-3 border-t border-charcoal-100" }, [sumSub.node, sumFee.node, sumDisc.node, sumTotal.node, minWarn]));

  // -- Botão enviar --
  const submitBtn = el("button", {
    type: "submit",
    class: "w-full h-13 py-3.5 rounded-xl bg-brand-600 text-white font-bold text-base disabled:opacity-50",
  }, "Enviar pedido pelo WhatsApp");
  form.append(submitBtn);
  form.append(el("p", { class: "text-[11px] text-center text-charcoal-400" },
    "Ao enviar, o pedido é registrado e o WhatsApp abre com o resumo para confirmação."));

  // -- Cálculo --
  let totals = {};
  function recalc() {
    const subtotal = cart.subtotal();
    const fee = fulfillment === "delivery" ? deliveryFeeFor(district.input?.value, s) : 0;
    let discount = 0;
    if (applied && subtotal >= (applied.coupon.minOrder || 0)) {
      discount = applied.coupon.type === "percent"
        ? Math.round(subtotal * (applied.coupon.value / 100) * 100) / 100
        : Math.min(applied.coupon.value, subtotal);
    }
    const total = Math.max(0, subtotal + fee - discount);
    totals = { subtotal, fee, discount, total };

    sumSub.set(formatBRL(subtotal));
    sumFee.node.hidden = fulfillment !== "delivery";
    sumFee.set(fee > 0 ? formatBRL(fee) : "a combinar");
    sumDisc.node.hidden = discount <= 0;
    sumDisc.set("-" + formatBRL(discount));
    sumTotal.set(formatBRL(total));

    const belowMin = s.minOrder && subtotal < s.minOrder;
    minWarn.textContent = belowMin ? `Pedido mínimo de ${formatBRL(s.minOrder)}. Faltam ${formatBRL(s.minOrder - subtotal)}.` : "";
    submitBtn.disabled = !st.open || belowMin || cart.isEmpty();
  }
  district.input.addEventListener("change", recalc);
  district.input.addEventListener("input", recalc);
  recalc();

  // -- Submit --
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (submitBtn.disabled) return;

    const reqs = [name, phone];
    if (fulfillment === "delivery") reqs.push(street, number, district);
    for (const f of reqs) {
      if (!f.input.value.trim()) {
        f.input.focus();
        return toast("Preencha os campos obrigatórios.", "warn");
      }
    }
    let changeFor = null;
    if (payMethod === "cash" && changeField.input.value.trim()) {
      changeFor = Number(changeField.input.value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || null;
      if (changeFor && changeFor < totals.total) return toast("O troco informado é menor que o total.", "warn");
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";

    const draft = {
      customer: { name: name.input.value.trim(), phone: phone.input.value.trim() },
      fulfillment,
      address: fulfillment === "delivery" ? {
        street: street.input.value.trim(),
        number: number.input.value.trim(),
        district: district.input.value.trim(),
        complement: complement.input.value.trim(),
        reference: reference.input.value.trim(),
      } : null,
      items: cart.getItems(),
      subtotal: totals.subtotal,
      deliveryFee: totals.fee,
      discount: totals.discount,
      couponCode: applied?.code || null,
      total: totals.total,
      payment: { method: payMethod, changeFor },
      notes: notes.value.trim(),
      _couponUsed: applied?.coupon?.used ?? 0,
    };

    try {
      const { order } = await createOrder(draft);
      saveCustomer({
        name: draft.customer.name, phone: draft.customer.phone,
        fulfillment, payMethod, address: draft.address,
      });
      const msg = buildOrderMessage({ ...order, code: order.code }, s);
      const url = whatsappUrl(s.whatsapp, msg);
      cart.clear();
      applied = null;
      sheet.close();
      openSuccess(order.code, url);
    } catch (e) {
      console.error(e);
      toast("Erro ao registrar o pedido. Tente novamente.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Enviar pedido pelo WhatsApp";
    }
  });

  const sheet = openSheet(form, { title: "Finalizar pedido" });
}

function openSuccess(code, waUrl) {
  const wrap = el("div", { class: "text-center space-y-4 py-2" });
  wrap.append(
    el("div", { class: "text-5xl" }, "✅"),
    el("h3", { class: "text-xl font-extrabold text-charcoal-900" }, `Pedido #${code} registrado!`),
    el("p", { class: "text-sm text-charcoal-500" }, "Toque abaixo para abrir o WhatsApp e confirmar com a pizzaria."),
    el("a", {
      href: waUrl, target: "_blank", rel: "noopener",
      class: "block w-full h-12 leading-[3rem] rounded-xl bg-emerald-600 text-white font-bold",
    }, "Abrir WhatsApp"),
  );
  const sheet = openSheet(wrap, { title: "Tudo certo!" });
  // tenta abrir automaticamente
  window.open(waUrl, "_blank", "noopener");
}

// ---- helpers de formulário ---------------------------------------
function field(label, type, attrs = {}) {
  const input = el("input", {
    type, class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm focus:border-brand-500 outline-none",
    ...attrs, value: attrs.value || "",
  });
  const node = el("label", { class: "block flex-1" }, [
    el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" }, label + (attrs.required ? " *" : "")),
    input,
  ]);
  return { node, input };
}

function districtField(value) {
  const hoods = neighborhoods();
  if (hoods.length) {
    const input = el("select", {
      class: "w-full rounded-xl border border-charcoal-200 py-2.5 px-3 text-sm bg-white", required: true,
    });
    input.append(el("option", { value: "" }, "Selecione o bairro"));
    for (const h of hoods) {
      const o = el("option", { value: h }, h);
      if (h === value) o.selected = true;
      input.append(o);
    }
    const node = el("label", { class: "block" }, [
      el("span", { class: "text-xs font-semibold text-charcoal-500 mb-1 block" }, "Bairro *"),
      input,
    ]);
    return { node, input };
  }
  return field("Bairro", "text", { required: true, value });
}

function group(title, children) {
  return el("div", { class: "space-y-2" }, [
    el("span", { class: "text-sm font-bold text-charcoal-800 block" }, title),
    ...children,
  ]);
}

function sumLine(label, strong = false) {
  const val = el("span", { class: strong ? "font-extrabold text-lg" : "" }, "");
  const node = el("div", { class: `flex justify-between text-sm ${strong ? "text-charcoal-900 pt-1" : "text-charcoal-600"}` }, [
    el("span", { class: strong ? "font-extrabold text-lg" : "" }, label),
    val,
  ]);
  return { node, set: (t) => (val.textContent = t) };
}

function loadCustomer() {
  try { return JSON.parse(localStorage.getItem(CUST_KEY) || "{}"); } catch { return {}; }
}
function saveCustomer(data) {
  try { localStorage.setItem(CUST_KEY, JSON.stringify(data)); } catch { /* */ }
}
