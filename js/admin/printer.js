// ============================================================================
// admin/printer.js — impressão térmica 58mm via Web Bluetooth (ESC/POS)
// Fallback: window.print() com recibo em #print-receipt.
// ============================================================================

import { toast, formatBRL } from "../ui.js";
import { SIZE_LABELS } from "../store.js";

const SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb", // genérico impressoras BLE
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];
const COLS = 32;

let device = null;
let characteristic = null;

export const bluetoothSupported = () => !!navigator.bluetooth;

/** Conecta (ou reconecta) a impressora. */
export async function connectPrinter() {
  if (!bluetoothSupported()) {
    toast("Este navegador não suporta Web Bluetooth. Use o Chrome (Android/desktop).", "warn");
    return false;
  }
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SERVICE_UUIDS,
    });
    device.addEventListener("gattserverdisconnected", () => { characteristic = null; });
    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      const w = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (w) { characteristic = w; break; }
    }
    if (!characteristic) throw new Error("Característica de escrita não encontrada.");
    toast(`Impressora "${device.name || "conectada"}"`, "success");
    return true;
  } catch (e) {
    if (e.name !== "NotFoundError") {
      console.error(e);
      toast("Falha ao conectar à impressora.", "error");
    }
    return false;
  }
}

export function isPrinterConnected() {
  return !!(device?.gatt?.connected && characteristic);
}

/** Imprime um pedido. Usa Bluetooth se conectado; senão cai no window.print(). */
export async function printOrder(order, settings) {
  if (isPrinterConnected()) {
    try {
      await writeBytes(buildEscPos(order, settings));
      toast(`Pedido #${order.code} enviado à impressora.`, "success");
      return;
    } catch (e) {
      console.error(e);
      toast("Erro na impressão Bluetooth. Usando impressão do navegador.", "warn");
    }
  }
  fallbackPrint(order, settings);
}

// ---- ESC/POS ------------------------------------------------------
const enc = new TextEncoder();

/** Remove acentos (impressoras 58mm costumam usar code page limitada). */
const deburr = (str) => String(str).normalize("NFD").replace(/[̀-ͯ]/g, "");

function buildEscPos(o, s) {
  const chunks = [];
  const raw = (arr) => chunks.push(Uint8Array.from(arr));
  const text = (str) => chunks.push(enc.encode(deburr(str)));

  raw([0x1b, 0x40]);            // ESC @ reset
  raw([0x1b, 0x61, 0x01]);      // center
  raw([0x1b, 0x21, 0x30]);      // double width/height
  text((s.name || "PIZZARIA") + "\n");
  raw([0x1b, 0x21, 0x00]);      // normal
  text(`Pedido #${o.code}\n`);
  text(fmtDate(o.createdAt) + "\n");
  raw([0x1b, 0x61, 0x00]);      // left
  text(line());

  text(`Cliente: ${o.customer.name}\n`);
  text(`Fone: ${o.customer.phone}\n`);
  if (o.fulfillment === "delivery") {
    const a = o.address || {};
    text("ENTREGA\n");
    text(wrap(`${a.street}, ${a.number}${a.complement ? " - " + a.complement : ""}`));
    text(`Bairro: ${a.district || "-"}\n`);
    if (a.reference) text(wrap(`Ref: ${a.reference}`));
  } else {
    text("RETIRADA NO BALCAO\n");
  }
  text(line());

  raw([0x1b, 0x21, 0x08]); // emphasized
  text("ITENS\n");
  raw([0x1b, 0x21, 0x00]);
  for (const it of o.items) {
    const title = it.type === "pizza"
      ? `Pizza ${it.size} ${it.flavors.map((f) => f.name).join("/")}`
      : it.name;
    text(row(`${it.qty}x ${title}`, formatBRL(it.lineTotal)));
    if (it.border) text(`  + Borda ${it.border.name}\n`);
    if (it.extras?.length) text(wrap(`  + ${it.extras.map((e) => e.name).join(", ")}`));
    if (it.notes) text(wrap(`  * ${it.notes}`));
  }
  text(line());

  text(row("Subtotal", formatBRL(o.subtotal)));
  if (o.discount > 0) text(row(`Desconto${o.couponCode ? " " + o.couponCode : ""}`, "-" + formatBRL(o.discount)));
  if (o.fulfillment === "delivery") text(row("Entrega", o.deliveryFee > 0 ? formatBRL(o.deliveryFee) : "a combinar"));
  raw([0x1b, 0x21, 0x30]);
  text(row("TOTAL", formatBRL(o.total), COLS / 2));
  raw([0x1b, 0x21, 0x00]);
  text(line());

  const pm = { pix: "PIX", card: "Cartao", cash: "Dinheiro" };
  text(`Pagamento: ${pm[o.payment.method] || o.payment.method}\n`);
  if (o.payment.method === "cash" && o.payment.changeFor) {
    text(`Troco para: ${formatBRL(o.payment.changeFor)}\n`);
  }
  if (o.notes) { text(line()); text(wrap(`Obs: ${o.notes}`)); }

  raw([0x0a, 0x0a, 0x0a]);
  raw([0x1d, 0x56, 0x42, 0x00]); // GS V corte parcial

  // concatena
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function writeBytes(bytes, size = 180) {
  for (let i = 0; i < bytes.length; i += size) {
    const slice = bytes.slice(i, i + size);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(slice);
    } else {
      await characteristic.writeValue(slice);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

// ---- Formatação de texto 32 col ---------------------------------
const line = (ch = "-") => ch.repeat(COLS) + "\n";
function row(left, right, width = COLS) {
  left = String(left);
  right = String(right);
  const space = Math.max(1, width - left.length - right.length);
  if (left.length + right.length + 1 > width) {
    return left + "\n" + " ".repeat(Math.max(0, width - right.length)) + right + "\n";
  }
  return left + " ".repeat(space) + right + "\n";
}
function wrap(str, width = COLS) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.join("\n") + "\n";
}
function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---- Fallback window.print -------------------------------------
function fallbackPrint(o, s) {
  const host = document.getElementById("print-receipt");
  if (!host) return toast("Sem suporte a impressão.", "error");
  const a = o.address || {};
  const items = o.items.map((it) => {
    const title = it.type === "pizza"
      ? `Pizza ${it.size} — ${it.flavors.map((f) => f.name).join(" / ")}`
      : it.name;
    return `<div>${it.qty}x ${title} <span style="float:right">${formatBRL(it.lineTotal)}</span></div>` +
      (it.border ? `<div>&nbsp;+ Borda ${it.border.name}</div>` : "") +
      (it.extras?.length ? `<div>&nbsp;+ ${it.extras.map((e) => e.name).join(", ")}</div>` : "") +
      (it.notes ? `<div>&nbsp;* ${it.notes}</div>` : "");
  }).join("");
  host.innerHTML = `
    <div style="text-align:center;font-weight:bold;font-size:14px">${s.name || "PIZZARIA"}</div>
    <div style="text-align:center">Pedido #${o.code} — ${fmtDate(o.createdAt)}</div>
    <hr>
    <div>Cliente: ${o.customer.name}</div>
    <div>Fone: ${o.customer.phone}</div>
    <div>${o.fulfillment === "delivery"
      ? `ENTREGA<br>${a.street}, ${a.number}${a.complement ? " - " + a.complement : ""}<br>Bairro: ${a.district || "-"}${a.reference ? "<br>Ref: " + a.reference : ""}`
      : "RETIRADA NO BALCÃO"}</div>
    <hr>
    ${items}
    <hr>
    <div>Subtotal <span style="float:right">${formatBRL(o.subtotal)}</span></div>
    ${o.discount > 0 ? `<div>Desconto <span style="float:right">-${formatBRL(o.discount)}</span></div>` : ""}
    ${o.fulfillment === "delivery" ? `<div>Entrega <span style="float:right">${o.deliveryFee > 0 ? formatBRL(o.deliveryFee) : "a combinar"}</span></div>` : ""}
    <div style="font-weight:bold;font-size:13px">TOTAL <span style="float:right">${formatBRL(o.total)}</span></div>
    <hr>
    <div>Pagamento: ${({ pix: "PIX", card: "Cartão", cash: "Dinheiro" })[o.payment.method]}</div>
    ${o.payment.method === "cash" && o.payment.changeFor ? `<div>Troco para: ${formatBRL(o.payment.changeFor)}</div>` : ""}
    ${o.notes ? `<hr><div>Obs: ${o.notes}</div>` : ""}
  `;
  window.print();
}
