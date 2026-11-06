import { getLoginUrl } from "@/const";

// A calculadora usa a mesma sessão do Mercato, sem carregar o scaffold Alpha.
export function startLogin() {
  window.location.assign(getLoginUrl());
}
