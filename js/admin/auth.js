// ============================================================================
// admin/auth.js — login (e-mail/senha) e guarda de rota do painel
// ============================================================================

import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "../firebase-config.js";
import { $, toast } from "../ui.js";

/**
 * Aguarda o estado de auth. Chama onIn(user) quando autenticado e
 * onOut() quando não. Renderiza a tela de login automaticamente.
 */
export function guard({ onIn, onOut }) {
  const loginView = $("#loginView");
  const appView = $("#appView");
  const form = $("#loginForm");
  const errBox = $("#loginError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    const email = form.email.value.trim();
    const pass = form.password.value;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Entrando…";
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      errBox.textContent = mapAuthError(err.code);
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginView.hidden = true;
      appView.hidden = false;
      $("#adminEmail").textContent = user.email || "";
      onIn?.(user);
    } else {
      appView.hidden = true;
      loginView.hidden = false;
      onOut?.();
    }
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    toast("Sessão encerrada.", "info");
  });
}

function mapAuthError(code) {
  const m = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Usuário desativado.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento.",
    "auth/network-request-failed": "Falha de rede.",
  };
  return m[code] || "Não foi possível entrar. Verifique os dados.";
}
