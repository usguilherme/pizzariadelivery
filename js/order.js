// ============================================================================
// order.js — cria o pedido no Firestore e incrementa o uso do cupom
// ============================================================================

import {
  db, collection, addDoc, doc, updateDoc, serverTimestamp,
} from "./firebase-config.js";
import { shortCode } from "./ui.js";

/**
 * Grava o pedido. Retorna { id, code, order }.
 * @param {object} draft  { customer, fulfillment, address, items, subtotal,
 *                           deliveryFee, discount, couponCode, total, payment, notes }
 */
export async function createOrder(draft) {
  const code = shortCode();
  const order = {
    code,
    status: "pending",
    source: "web",
    createdAt: serverTimestamp(),
    customer: draft.customer,
    fulfillment: draft.fulfillment,
    address: draft.fulfillment === "delivery" ? draft.address : null,
    items: draft.items.map(stripItem),
    subtotal: round(draft.subtotal),
    deliveryFee: round(draft.deliveryFee || 0),
    discount: round(draft.discount || 0),
    couponCode: draft.couponCode || null,
    total: round(draft.total),
    payment: {
      method: draft.payment.method,
      changeFor: draft.payment.method === "cash" ? (draft.payment.changeFor || null) : null,
    },
    notes: draft.notes || "",
  };

  const ref = await addDoc(collection(db, "orders"), order);

  if (draft.couponCode && draft._couponUsed != null) {
    // Best-effort: as regras permitem +1 no campo "used".
    updateDoc(doc(db, "coupons", draft.couponCode), { used: Number(draft._couponUsed) + 1 })
      .catch((e) => console.warn("[order] falha ao incrementar cupom:", e));
  }

  return { id: ref.id, code, order };
}

function stripItem(it) {
  return {
    productId: it.productId,
    name: it.name,
    type: it.type,
    size: it.size ?? null,
    flavors: (it.flavors || []).map((f) => ({ name: f.name, price: round(f.price) })),
    border: it.border ? { name: it.border.name, price: round(it.border.price) } : null,
    extras: (it.extras || []).map((e) => ({ name: e.name, price: round(e.price) })),
    qty: it.qty,
    notes: it.notes || "",
    unitPrice: round(it.unitPrice),
    lineTotal: round(it.lineTotal),
  };
}

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
