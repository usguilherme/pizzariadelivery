# 🍕 Pizzaria Delivery — Cardápio Digital + Painel Admin

Aplicação web **mobile-first**, rápida e 100% *serverless* sobre **Firebase**
(Hosting + Cloud Firestore). Dois apps num só projeto estático:

| Página        | Para quem            | O que faz |
|---------------|----------------------|-----------|
| `index.html`  | Cliente              | Cardápio digital, montagem de pizza (tamanho, meia a meia, borda, adicionais), carrinho, checkout (entrega/retirada, pagamento, cupom) e envio do pedido pelo **WhatsApp**. Grava o pedido no Firestore. |
| `admin.html`  | Equipe da pizzaria   | Login (Firebase Auth), **pedidos em tempo real** (`onSnapshot`), troca de status, **impressão térmica 58mm** (Web Bluetooth / ESC-POS), CRUD de cardápio, configuração da loja e cupons. |

## Identidade visual

Tema **light premium** inspirado no repositório de referência `imperioPizzaria`:
paleta vermelho `#e8291c` + laranja `#ff7a1a` com gradiente promo a 135°, tipografia
**Poppins** (títulos/preços) + **Inter** (corpo), sombras suaves e “glow”, vitrine
**mobile-first em grid de 2 colunas com imagem 4:3** (fallback gradiente + inicial quando
sem foto). O design-system fica em `css/styles.css` (tokens em `:root` + classes de
componente `.btn`, `.card`, `.field`, `.chip`, `.segmented`, `.badge-promo`, bottom-sheet…),
complementando as escalas `brand`/`accent`/`charcoal` retunadas no `tailwind.config`.

## Stack

- **HTML5 + Tailwind CSS (CDN)** + **JavaScript ES6+** (módulos nativos, sem bundler).
- Fontes via Google Fonts (`Poppins` + `Inter`) com `preconnect`.
- Firebase SDK 11 carregado via `https://www.gstatic.com/firebasejs/` com **import map**
  (por isso `js/firebase-config.js` usa `from "firebase/app"` sem build step).
- **Cloud Firestore** para cardápio, configuração, cupons e sincronização de pedidos.
- **Firebase Authentication** (e-mail/senha) protege o painel; regras em `firestore.rules`.
- Integrações: **`wa.me`** (mensagem formatada) e **Web Bluetooth API** (impressora térmica),
  com *fallback* para `window.print()`.

## Estrutura

```
index.html / admin.html / 404.html
firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
css/styles.css
js/
  firebase-config.js   # config central (db, auth)
  ui.js store.js cart.js coupon.js menu.js pizza-modal.js checkout.js whatsapp.js order.js
  admin/
    auth.js dashboard.js orders.js products.js settings.js coupons.js printer.js seed.js
assets/  (favicon, manifest)
```

## Modelo de dados (Firestore)

- `categories/{id}` — `{ name, order, active, description? }`
- `products/{id}` — `{ name, description, serves?, categoryId, type:'pizza'|'simple', imageUrl,
  active, order, featured, tags:[], prices:{P,M,G,GG} | price, halfEligible,
  promoActive?, promoPrices:{P,M,G,GG}? | promoPrice? }`
  Quando `promoActive` e há preço promocional válido (< preço de tabela), a vitrine mostra o
  valor riscado, o selo `-X%` e destaca o item em **“Promoções da Casa”** + no banner do topo.
- `addons/{id}` — `{ name, price, group:'borda'|'extra', active, order }`
- `settings/store` — doc único: identidade, `whatsapp`, PIX, `isOpenManual`, `hours`,
  `minOrder`, `deliveryFees:[{neighborhood,fee}]`, `defaultDeliveryFee`, `pickupEnabled`,
  `deliveryEstimate`, `halfPriceRule:'max'|'avg'`
- `coupons/{CODIGO}` — `{ code, type:'percent'|'fixed', value, minOrder, active,
  expiresAt, usageLimit, used }`
- `orders/{id}` — `{ code, status, source:'web', createdAt, customer, fulfillment,
  address, items[], subtotal, deliveryFee, discount, couponCode, total, payment, notes }`
  Status: `pending → accepted → preparing → delivering → done` (+ `canceled`).

## Pré-requisitos

- Node 18+ e a CLI do Firebase: `npm i -g firebase-tools` (ou use `npm install` neste repo).
- Uma conta com acesso ao projeto **`pizzariadelivery-ad758`**.

## Configuração inicial (uma vez)

1. **Login na CLI**
   ```bash
   firebase login
   ```
2. **Ative o Authentication** no [console](https://console.firebase.google.com/project/pizzariadelivery-ad758/authentication/providers) → *Sign-in method* → **E-mail/senha** → Ativar.
3. **Crie o usuário administrador** (Authentication → *Users* → *Add user*), com e-mail e senha da equipe. Qualquer usuário autenticado tem acesso total ao painel.
4. **Publique as regras e índices do Firestore**
   ```bash
   npm run deploy:rules
   ```
5. **Popule o cardápio**: abra o painel, faça login e clique em **Configurações → “Importar cardápio de exemplo”**. Depois edite tudo pela própria interface.

## Desenvolvimento local (emuladores)

```bash
npm install
npm run dev          # Auth + Firestore + Hosting em http://localhost:5000
```

- O `firebase-config.js` detecta a porta `5000` (ou `?emu=1`) e conecta automaticamente aos emuladores.
- Crie um usuário de teste no Emulator UI (http://localhost:4000 → Authentication).
- Rode a importação de exemplo pelo painel para ter dados.

## Deploy

```bash
npm run deploy            # hosting + firestore (rules + indexes)
# ou individualmente:
npm run deploy:hosting
npm run deploy:rules
```

A URL pública fica em `https://pizzariadelivery-ad758.web.app` (e `/admin`).

## Impressão térmica (Web Bluetooth)

- Funciona no **Chrome/Edge** (Android e desktop) sobre **HTTPS** (ou `localhost`).
- No painel de **Pedidos**, toque em **“🖨️ Conectar”** e escolha a impressora BLE (58 mm, ESC/POS).
- Depois, o botão **“Imprimir”** de cada pedido envia o cupom direto.
- Sem suporte a Web Bluetooth, o sistema usa a **impressão do navegador** (`window.print()`)
  com um layout de recibo de 58 mm.
- UUIDs de serviço testados: `000018f0-…`, `0000ff00-…`, `e7810a71-…`. Ajuste em
  `js/admin/printer.js` (`SERVICE_UUIDS`) se a sua impressora usar outro.

## WhatsApp

O número de destino vem de **Configurações → WhatsApp** (`settings.store.whatsapp`),
apenas dígitos com DDI + DDD, ex.: `5583999999999`. Ao finalizar, o pedido é gravado
no Firestore e o WhatsApp abre com o resumo formatado.

## Segurança

- Leitura pública: `categories`, `products`, `addons`, `settings`, `coupons`.
- Escrita nesses documentos: **somente autenticado**.
- `orders`: qualquer visitante pode **criar** (checkout), com validação de formato nas regras;
  **ler/alterar** apenas autenticado.
- Cliente pode incrementar `coupons/{c}.used` em **+1** e nada mais.
- Restrinja o acesso do painel a UIDs específicos editando `isAdmin()` em `firestore.rules`
  (ex.: `request.auth.uid in ['UID1','UID2']`).

## Git

```bash
git add -A
git commit -m "feat: cardápio digital + painel admin (Firebase)"
git branch -M main
git remote add origin https://github.com/usguilherme/pizzariadelivery.git
git push -u origin main
```

---
🤖 Base construída do zero seguindo a arquitetura especificada. A **identidade visual** foi
depois refinada a partir do repositório de referência `imperioPizzaria` (Next.js/Vercel —
apenas o design foi aproveitado; a arquitetura permanece 100% Firebase serverless).
