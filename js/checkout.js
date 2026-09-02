// ============================================================================
// checkout.js — barra de carrinho flutuante, revisão do carrinho e checkout
// ============================================================================

import { $, el, openSheet, toast, formatBRL, confirmSheet, segmented, mediaFallback, icon } from "./ui.js";
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
  const iconBtn = $("#cartIconBtn");
  const iconCount = $("#cartIconCount");
  if (!bar) return;

  cart.onCartChange(() => {
    const n = cart.count();
    if (iconCount) {
      iconCount.textContent = String(n);
      iconCount.classList.toggle("hidden", n === 0);
    }
    if (n === 0) {
      bar.classList.add("translate-y-24");
      return;
    }
    bar.classList.remove("translate-y-24");
    $("#cartBarCount").textContent = String(n);
    $("#cartBarTotal").textContent = formatBRL(cart.subtotal());
  });

  bar.querySelector("button").addEventListener("click", openCart);
  iconBtn?.addEventListener("click", () => { if (!cart.isEmpty()) openCart(); });
}

// ---- Revisão do carrinho ------------------------------------------
export function openCart() {
  if (cart.isEmpty()) return toast("Seu carrinho está vazio.", "warn");
  const wrap = el("div", { class: "space-y-4" });
  const list = el("div", { class: "space-y-2.5" });
  const totalRow = el("div", { class: "flex justify-between items-baseline pt-3 border-t border-charcoal-200" });

  function render() {
    list.innerHTML = "";
    for (const it of cart.getItems()) {
      list.append(el("div", { class: "card p-2.5 flex gap-2.5 items-center" }, [
        el("div", { class: "w-14 h-14 rounded-xl overflow-hidden shrink-0 relative bg-charcoal-100" }, [
          mediaFallback(it.type === "pizza" ? "🍕" : it.name),
        ]),
        el("div", { class: "flex-1 min-w-0" }, [
          el("p", { class: "font-semibold text-charcoal-900 text-sm line-clamp-1" }, it.name),
          it.border ? el("p", { class: "text-[11px] text-charcoal-500" }, `Borda: ${it.border.name}`) : null,
          it.extras?.length ? el("p", { class: "text-[11px] text-charcoal-500 line-clamp-1" }, `+ ${it.extras.map((e) => e.name).join(", ")}`) : null,
          it.notes ? el("p", { class: "text-[11px] text-charcoal-400 italic line-clamp-1" }, it.notes) : null,
          el("p", { class: "text-sm font-extrabold text-brand-700 mt-0.5" }, formatBRL(it.lineTotal)),
        ]),
        el("div", { class: "qty" }, [
          el("button", { type: "button", onclick: () => { cart.dec(it.uid); render(); } }, "−"),
          el("span", {}, String(it.qty)),
          el("button", { type: "button", onclick: () => { cart.inc(it.uid); render(); } }, "+"),
        ]),
      ]));
    }
    totalRow.innerHTML = "";
    totalRow.append(
      el("span", { class: "text-sm text-charcoal-500 font-semibold" }, "Subtotal"),
      el("span", { class: "font-display text-xl font-extrabold" }, formatBRL(cart.subtotal())),
    );
    if (cart.isEmpty()) sheet.close();
  }

  render();
  wrap.append(
    list,
    totalRow,
    el("button", {
      type: "button",
      class: "btn btn-primary btn-block btn-lg",
      onclick: () => { sheet.close(); openCheckout(); },
    }, "Continuar para entrega"),
    el("button", {
      type: "button",
      class: "btn btn-ghost btn-block btn-sm",
      onclick: async () => { if (await confirmSheet("Esvaziar o carrinho?", { danger: true, okText: "Esvaziar" })) { cart.clear(); sheet.close(); } },
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

  if (!st.open) {
    form.append(el("div", { class: "text-sm font-semibold rounded-xl p-3 bg-red-50 text-red-700" },
      `A loja está fechada (${st.reason}). Não é possível finalizar pedidos agora.`));
  }

  // -- Dados do cliente --
  const name = field("Nome", "text", { required: true, value: saved.name, placeholder: "Seu nome" });
  const phone = field("WhatsApp", "tel", { required: true, value: saved.phone, placeholder: "(00) 00000-0000", inputmode: "tel" });
  form.append(group("Seus dados", [name.node, phone.node]));

  // -- Entrega x Retirada --
  let fulfillment = s.pickupEnabled ? (saved.fulfillment || "delivery") : "delivery";
  const addrBox = el("div", { class: "space-y-3" });

  const street = field("Rua / Av.", "text", { required: true, value: saved.address?.street });
  const number = field("Número", "text", { required: true, value: saved.address?.number });
  const district = districtField(saved.address?.district);
  const complement = field("Complemento", "text", { value: saved.address?.complement, placeholder: "Apto, bloco…" });
  const reference = field("Referência", "text", { value: saved.address?.reference, placeholder: "Perto de…" });
  addrBox.append(street.node, el("div", { class: "grid grid-cols-2 gap-2" }, [number.node, district.node]), complement.node, reference.node);

  const fulOpts = [["delivery", "Entrega", "🛵"]];
  if (s.pickupEnabled) fulOpts.push(["pickup", "Retirada", "🏪"]);
  const fulCtl = segmented(fulOpts, fulfillment, (val) => {
    fulfillment = val;
    addrBox.hidden = val !== "delivery";
    recalc();
  });
  addrBox.hidden = fulfillment !== "delivery";
  form.append(group("Como você quer receber?", [fulCtl.node, addrBox]));

  // -- Pagamento --
  let payMethod = saved.payMethod || "pix";
  const changeField = field("Troco para", "text", { placeholder: "R$", inputmode: "decimal" });
  changeField.node.hidden = true;
  const payCtl = segmented(
    [["pix", "PIX", "⚡"], ["card", "Cartão", "💳"], ["cash", "Dinheiro", "💵"]],
    payMethod,
    (val) => { payMethod = val; changeField.node.hidden = val !== "cash"; },
  );
  const pixHint = s.pixKey ? el("p", { class: "text-xs text-charcoal-500" }, `Chave PIX: ${s.pixKey}${s.pixName ? " (" + s.pixName + ")" : ""}`) : null;
  form.append(group("Pagamento", [payCtl.node, changeField.node, pixHint].filter(Boolean)));

  // -- Cupom --
  const couponInput = field("Cupom de desconto", "text", { placeholder: "Opcional", autocapitalize: "characters" });
  const couponMsg = el("p", { class: "text-xs font-semibold" });
  const couponBtn = el("button", {
    type: "button", class: "btn btn-outline btn-sm shrink-0 px-4",
    onclick: async () => {
      const r = await validateCoupon(couponInput.input.value, cart.subtotal());
      applied = r.ok ? { ...r, code: r.coupon.code } : null;
      couponMsg.textContent = r.message || "";
      couponMsg.className = `text-xs font-semibold ${r.ok ? "text-emerald-600" : "text-red-600"}`;
      recalc();
    },
  }, "Aplicar");
  form.append(group("Cupom", [
    el("div", { class: "flex gap-2 items-end" }, [couponInput.node, couponBtn]),
    couponMsg,
  ]));

  // -- Observações --
  const notes = el("textarea", {
    class: "field", rows: "2",
    placeholder: "Alguma observação para a cozinha ou entrega?",
  });
  form.append(group("Observações", [notes]));

  // -- Resumo --
  const sumSub = sumLine("Subtotal");
  const sumFee = sumLine("Taxa de entrega");
  const sumDisc = sumLine("Desconto");
  const sumTotal = sumLine("Total", true);
  const minWarn = el("p", { class: "text-xs text-amber-600 font-semibold" });
  form.append(el("div", { class: "card card-pop p-4 space-y-1.5" }, [
    el("p", { class: "field-label mb-1" }, "Resumo"),
    sumSub.node, sumFee.node, sumDisc.node,
    el("hr", { class: "divider my-1" }),
    sumTotal.node, minWarn,
  ]));

  // -- Botão enviar --
  const submitBtn = el("button", {
    type: "submit",
    class: "btn btn-primary btn-block btn-lg",
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
  const wrap = el("div", { class: "text-center space-y-4 py-3" });
  wrap.append(
    el("div", { class: "mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center", html: icon("check", "w-8 h-8") }),
    el("h3", { class: "font-display text-xl font-extrabold text-charcoal-900" }, `Pedido #${code} registrado!`),
    el("p", { class: "text-sm text-charcoal-500" }, "Toque abaixo para abrir o WhatsApp e confirmar com a pizzaria."),
    el("a", {
      href: waUrl, target: "_blank", rel: "noopener",
      class: "btn btn-success btn-block btn-lg",
    }, "Abrir WhatsApp"),
  );
  openSheet(wrap, { title: "Tudo certo! 🎉" });
  window.open(waUrl, "_blank", "noopener");
}

// ---- helpers de formulário ---------------------------------------
function field(label, type, attrs = {}) {
  const input = el("input", {
    type, class: "field",
    ...attrs, value: attrs.value || "",
  });
  const node = el("label", { class: "block flex-1" }, [
    el("span", { class: "field-label" }, label + (attrs.required ? " *" : "")),
    input,
  ]);
  return { node, input };
}

function districtField(value) {
  const hoods = neighborhoods();
  if (hoods.length) {
    const input = el("select", { class: "field", required: true });
    input.append(el("option", { value: "" }, "Selecione o bairro"));
    for (const h of hoods) {
      const fee = deliveryFeeFor(h, state.settings);
      const o = el("option", { value: h }, `${h}${fee > 0 ? ` · ${formatBRL(fee)}` : ""}`);
      if (h === value) o.selected = true;
      input.append(o);
    }
    const node = el("label", { class: "block" }, [
      el("span", { class: "field-label" }, "Bairro *"),
      input,
    ]);
    return { node, input };
  }
  return field("Bairro", "text", { required: true, value });
}

function group(title, children) {
  return el("div", { class: "space-y-2" }, [
    el("span", { class: "font-display text-sm font-bold text-charcoal-800 block" }, title),
    ...children,
  ]);
}

function sumLine(label, strong = false) {
  const val = el("span", { class: strong ? "font-display font-extrabold text-lg" : "text-sm font-semibold" }, "");
  const node = el("div", { class: `flex justify-between items-baseline ${strong ? "text-charcoal-900" : "text-charcoal-600"}` }, [
    el("span", { class: strong ? "font-display font-extrabold text-lg" : "text-sm" }, label),
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
