// ============================================================================
// admin/auth.js — login (e-mail/senha) e guarda de rota do painel
// ============================================================================
// `auth`, `onAuthStateChanged`, `signInWithEmailAndPassword` e `signOut` vêm
// todos de firebase-config.js, onde o Firebase App + Auth já são inicializados
// (getAuth(app)). Nada de SDK é importado diretamente aqui.
// ----------------------------------------------------------------------------

import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "../firebase-config.js";
import { $, toast } from "../ui.js";

/**
 * Aguarda o estado de auth. Chama onIn(user) quando autenticado e
 * onOut() quando não. Cuida da tela de login e da troca login ⇄ painel.
 */
export function guard({ onIn, onOut } = {}) {
  const loginView = $("#loginView");
  const appView = $("#appView");
  const form = $("#loginForm");
  const errBox = $("#loginError");
  const btn = form?.querySelector("button[type=submit]");

  // ---- Submit do formulário de login -------------------------------------
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errBox) errBox.textContent = "";

    const email = form.email.value.trim();
    const pass = form.password.value;
    if (!email || !pass) {
      toast("Preencha e-mail e senha.", "warn");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // Sucesso: o onAuthStateChanged abaixo troca para o painel.
    } catch (err) {
      console.warn("[auth] falha no login:", err?.code || err);
      const msg = mapAuthError(err?.code);
      if (errBox) errBox.textContent = msg;
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    if (!btn) return;
    btn.disabled = on;
    btn.setAttribute("aria-busy", String(on));
    btn.textContent = on ? "Entrando…" : "Entrar";
  }

  // ---- Guarda de rota ----------------------------------------------------
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Autenticado → esconde o modal de login, mostra o painel.
      if (loginView) loginView.hidden = true;
      if (appView) appView.hidden = false;
      const emailEl = $("#adminEmail");
      if (emailEl) emailEl.textContent = user.email || "";
      form?.reset();
      if (errBox) errBox.textContent = "";
      onIn?.(user);
    } else {
      // Sem sessão → volta para a tela de login.
      if (appView) appView.hidden = true;
      if (loginView) loginView.hidden = false;
      setLoading(false);
      onOut?.();
    }
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      toast("Sessão encerrada.", "info");
    } catch (err) {
      console.warn("[auth] falha ao sair:", err);
      toast("Não foi possível encerrar a sessão.", "error");
    }
  });
}

/** Traduz o código de erro do Firebase Auth para uma mensagem amigável. */
function mapAuthError(code) {
  const m = {
    "auth/invalid-email": "E-mail ou senha incorretos.",
    "auth/user-disabled": "Usuário desativado. Fale com o administrador.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/missing-password": "Informe a senha.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente de novo.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
  };
  return m[code] || "Não foi possível entrar. Verifique os dados e tente novamente.";
}
