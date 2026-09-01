// ============================================================================
// admin/seed.js — importa um cardápio de exemplo (executa com admin autenticado)
// ============================================================================

import { db, doc, setDoc } from "../firebase-config.js";
import { DEFAULT_SETTINGS } from "../store.js";
import { toast, confirmSheet } from "../ui.js";

const CATEGORIES = [
  { id: "pizzas-salgadas", name: "Pizzas Salgadas", order: 1, active: true },
  { id: "pizzas-doces", name: "Pizzas Doces", order: 2, active: true },
  { id: "bebidas", name: "Bebidas", order: 3, active: true },
  { id: "bordas", name: "Bordas & Adicionais", order: 4, active: true, description: "Personalize sua pizza" },
];

const P = (base) => ({ P: base, M: base + 12, G: base + 24, GG: base + 36 });

const PRODUCTS = [
  { id: "mussarela", name: "Mussarela", categoryId: "pizzas-salgadas", type: "pizza", halfEligible: true, featured: true, order: 1, description: "Molho, mussarela e orégano.", prices: P(35) },
  { id: "calabresa", name: "Calabresa", categoryId: "pizzas-salgadas", type: "pizza", halfEligible: true, featured: true, order: 2, description: "Calabresa fatiada, cebola e mussarela.", prices: P(38) },
  { id: "portuguesa", name: "Portuguesa", categoryId: "pizzas-salgadas", type: "pizza", halfEligible: true, order: 3, description: "Presunto, ovo, cebola, ervilha e mussarela.", prices: P(42) },
  { id: "frango-catupiry", name: "Frango c/ Catupiry", categoryId: "pizzas-salgadas", type: "pizza", halfEligible: true, order: 4, description: "Frango desfiado e catupiry.", prices: P(44), tags: ["promo"] },
  { id: "quatro-queijos", name: "Quatro Queijos", categoryId: "pizzas-salgadas", type: "pizza", halfEligible: true, order: 5, description: "Mussarela, provolone, parmesão e catupiry.", prices: P(46) },
  { id: "chocolate", name: "Chocolate", categoryId: "pizzas-doces", type: "pizza", halfEligible: true, order: 1, description: "Chocolate ao leite derretido.", prices: P(38) },
  { id: "romeu-julieta", name: "Romeu e Julieta", categoryId: "pizzas-doces", type: "pizza", halfEligible: true, order: 2, description: "Goiabada com mussarela.", prices: P(40) },
  { id: "coca-2l", name: "Coca-Cola 2L", categoryId: "bebidas", type: "simple", order: 1, price: 14 },
  { id: "guarana-2l", name: "Guaraná 2L", categoryId: "bebidas", type: "simple", order: 2, price: 12 },
  { id: "agua-500", name: "Água 500ml", categoryId: "bebidas", type: "simple", order: 3, price: 4 },
];

const ADDONS = [
  { id: "borda-catupiry", name: "Catupiry", group: "borda", price: 8, order: 1, active: true },
  { id: "borda-cheddar", name: "Cheddar", group: "borda", price: 8, order: 2, active: true },
  { id: "borda-chocolate", name: "Chocolate", group: "borda", price: 9, order: 3, active: true },
  { id: "extra-bacon", name: "Bacon extra", group: "extra", price: 7, order: 1, active: true },
  { id: "extra-catupiry", name: "Catupiry extra", group: "extra", price: 6, order: 2, active: true },
  { id: "extra-borda-dupla", name: "Mais mussarela", group: "extra", price: 5, order: 3, active: true },
];

const COUPONS = [
  { id: "PIZZA10", code: "PIZZA10", type: "percent", value: 10, minOrder: 50, active: true, used: 0, usageLimit: null, expiresAt: null },
  { id: "BEMVINDO", code: "BEMVINDO", type: "fixed", value: 8, minOrder: 40, active: true, used: 0, usageLimit: 100, expiresAt: null },
];

export async function seedSampleMenu() {
  const ok = await confirmSheet(
    "Isso vai criar/sobrescrever categorias, produtos, adicionais e cupons de exemplo. Continuar?",
    { okText: "Importar exemplo" },
  );
  if (!ok) return;

  try {
    await Promise.all([
      ...CATEGORIES.map((c) => setDoc(doc(db, "categories", c.id), stripId(c))),
      ...PRODUCTS.map((p) => setDoc(doc(db, "products", p.id), { active: true, ...stripId(p) })),
      ...ADDONS.map((a) => setDoc(doc(db, "addons", a.id), stripId(a))),
      ...COUPONS.map((c) => setDoc(doc(db, "coupons", c.id), stripId(c))),
    ]);
    // settings/store só é criado se ainda não existir escolha do lojista
    await setDoc(doc(db, "settings", "store"), {
      ...DEFAULT_SETTINGS,
      name: "Pizzaria Delivery",
      whatsapp: "5583999999999",
      address: "Rua das Pizzas, 100 - Centro",
      pixKey: "pizzaria@exemplo.com",
      pixName: "Pizzaria Delivery LTDA",
      minOrder: 30,
      defaultDeliveryFee: 7,
      deliveryFees: [
        { neighborhood: "Centro", fee: 5 },
        { neighborhood: "Bodocongó", fee: 8 },
        { neighborhood: "Catolé", fee: 9 },
      ],
    }, { merge: true });

    toast("Cardápio de exemplo importado!", "success");
  } catch (e) {
    console.error(e);
    toast("Falha ao importar. Verifique se você está autenticado.", "error");
  }
}

const stripId = ({ id, ...rest }) => rest;
