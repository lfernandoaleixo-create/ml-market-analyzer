import { describe, it, expect } from "vitest";

/**
 * Valida que as credenciais do Google configuradas no ambiente têm o formato
 * esperado e são aceitas pelo endpoint oficial de token do Google.
 *
 * Usamos grant_type=refresh_token com um refresh_token claramente inválido:
 * - Se o client for INVÁLIDO, o Google responde "invalid_client".
 * - Se o client for VÁLIDO, o Google responde "invalid_grant" (rejeita o
 *   refresh_token, mas reconhece o client).
 */
describe("Credenciais do Google Drive", () => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  it("têm o formato esperado (client_id .apps.googleusercontent.com e secret GOCSPX-)", () => {
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(clientSecret).toMatch(/^GOCSPX-/);
  });

  it("são aceitas pelo endpoint de token do Google (client reconhecido)", async () => {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: "1//invalid-refresh-token-for-validation-only",
        grant_type: "refresh_token",
      }),
    });
    const json = (await res.json()) as { error?: string };
    // O client válido reconhece a requisição e rejeita apenas o grant.
    expect(json.error).not.toBe("invalid_client");
    expect(json.error).toBe("invalid_grant");
  }, 20000);
});
