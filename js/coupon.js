// ============================================================================
// coupon.js — validação de cupom de desconto contra o Firestore
// ============================================================================

import { db, doc, getDoc } from "./firebase-config.js";

/**
 * @param {string} rawCode
 * @param {number} orderSubtotal
 * @returns {Promise<{ ok:boolean, message?:string, coupon?:object, discount?:number }>}
 */
export async function validateCoupon(rawCode, orderSubtotal) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, message: "Informe um código." };

  let snap;
  try {
    snap = await getDoc(doc(db, "coupons", code));
  } catch {
    return { ok: false, message: "Não foi possível validar o cupom." };
  }
  if (!snap.exists()) return { ok: false, message: "Cupom inválido." };

  const c = { id: snap.id, ...snap.data() };
  if (c.active === false) return { ok: false, message: "Cupom desativado." };

  if (c.expiresAt) {
    const exp = c.expiresAt.toDate ? c.expiresAt.toDate() : new Date(c.expiresAt);
    if (exp.getTime() < Date.now()) return { ok: false, message: "Cupom expirado." };
  }
  if (c.usageLimit != null && Number(c.used || 0) >= Number(c.usageLimit)) {
    return { ok: false, message: "Cupom esgotado." };
  }
  if (c.minOrder && orderSubtotal < Number(c.minOrder)) {
    return { ok: false, message: `Pedido mínimo de R$ ${Number(c.minOrder).toFixed(2)} para este cupom.` };
  }

  const discount = c.type === "percent"
    ? Math.round(orderSubtotal * (Number(c.value) / 100) * 100) / 100
    : Math.min(Number(c.value), orderSubtotal);

  return { ok: true, coupon: c, discount, message: "Cupom aplicado!" };
}
