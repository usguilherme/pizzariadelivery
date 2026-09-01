// ============================================================================
// whatsapp.js — monta a mensagem formatada e a URL wa.me do pedido
// ============================================================================

import { formatBRL } from "./ui.js";
import { SIZE_LABELS } from "./store.js";

/**
 * @param {object} order  documento do pedido (mesma forma gravada no Firestore)
 * @param {object} settings
 * @returns {string}
 */
export function buildOrderMessage(order, settings) {
  const L = [];
  L.push(`*${settings.name || "Pedido"}* — Novo pedido ${order.code ? "#" + order.code : ""}`.trim());
  L.push("");
  L.push(`*Cliente:* ${order.customer.name}`);
  L.push(`*Telefone:* ${order.customer.phone}`);
  L.push("");

  L.push("*Itens*");
  for (const it of order.items) {
    const title = it.type === "pizza"
      ? `Pizza ${it.size} (${SIZE_LABELS[it.size] || it.size}) — ${it.flavors.map((f) => f.name).join(" / ")}`
      : it.name;
    L.push(`• ${it.qty}x ${title}`);
    if (it.border) L.push(`   ↳ Borda: ${it.border.name}`);
    if (it.extras?.length) L.push(`   ↳ Adicionais: ${it.extras.map((e) => e.name).join(", ")}`);
    if (it.notes) L.push(`   ↳ Obs: ${it.notes}`);
    L.push(`   ${formatBRL(it.lineTotal)}`);
  }
  L.push("");

  L.push(`*Subtotal:* ${formatBRL(order.subtotal)}`);
  if (order.discount > 0) {
    L.push(`*Desconto${order.couponCode ? " (" + order.couponCode + ")" : ""}:* -${formatBRL(order.discount)}`);
  }
  if (order.fulfillment === "delivery") {
    L.push(`*Taxa de entrega:* ${order.deliveryFee > 0 ? formatBRL(order.deliveryFee) : "a combinar"}`);
  }
  L.push(`*TOTAL:* ${formatBRL(order.total)}`);
  L.push("");

  if (order.fulfillment === "delivery") {
    const a = order.address || {};
    L.push("*Entrega*");
    L.push(`${a.street || ""}, ${a.number || "s/n"}${a.complement ? " — " + a.complement : ""}`);
    L.push(`Bairro: ${a.district || "-"}`);
    if (a.reference) L.push(`Referência: ${a.reference}`);
    if (settings.deliveryEstimate) L.push(`Tempo estimado: ${settings.deliveryEstimate}`);
  } else {
    L.push("*Retirada no balcão*");
    if (settings.address) L.push(settings.address);
  }
  L.push("");

  const methods = { pix: "PIX", card: "Cartão (maquininha)", cash: "Dinheiro" };
  L.push(`*Pagamento:* ${methods[order.payment.method] || order.payment.method}`);
  if (order.payment.method === "cash" && order.payment.changeFor) {
    L.push(`Troco para: ${formatBRL(order.payment.changeFor)} (levar ${formatBRL(Math.max(0, order.payment.changeFor - order.total))})`);
  }
  if (order.payment.method === "pix" && settings.pixKey) {
    L.push(`Chave PIX: ${settings.pixKey}${settings.pixName ? " (" + settings.pixName + ")" : ""}`);
  }
  if (order.notes) {
    L.push("");
    L.push(`*Observações gerais:* ${order.notes}`);
  }
  return L.join("\n");
}

/** Só dígitos; garante DDI 55 quando parecer número BR sem código. */
export function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 11) d = "55" + d;
  return d;
}

export function whatsappUrl(phone, text) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
