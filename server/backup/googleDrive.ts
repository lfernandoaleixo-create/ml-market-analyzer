import { ENV } from "../_core/env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** Escopo mínimo: o app só enxerga/gerencia arquivos que ele mesmo cria. */
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function getRedirectUri(): string {
  return `${ENV.publicOrigin}/api/oauth/gdrive/callback`;
}

/** Monta a URL de consentimento do Google (offline + consent => refresh_token). */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GDRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Troca o authorization code por tokens (inclui refresh_token). */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

/** Usa o refresh_token salvo para obter um access_token novo. */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) {
    throw new Error(
      `Falha ao renovar token do Google: ${json.error ?? "desconhecido"} ${json.error_description ?? ""}`.trim(),
    );
  }
  return json.access_token;
}

/** Lê o e-mail da conta conectada (apenas para exibição). */
export async function getAccountEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { email?: string };
    return json.email ?? "";
  } catch {
    return "";
  }
}

/** Garante que a pasta de destino exista; retorna o folderId. */
export async function ensureFolder(
  accessToken: string,
  folderName: string,
  existingId?: string,
): Promise<string> {
  if (existingId) {
    const check = await fetch(`${DRIVE_FILES}/${existingId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.ok) {
      const data = (await check.json()) as { id?: string; trashed?: boolean };
      if (data.id && !data.trashed) return data.id;
    }
  }
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`,
  );
  const search = await fetch(`${DRIVE_FILES}?q=${q}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (search.ok) {
    const data = (await search.json()) as { files?: Array<{ id: string }> };
    if (data.files && data.files.length > 0) return data.files[0].id;
  }
  const create = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const created = (await create.json()) as { id?: string };
  if (!created.id) throw new Error("Não foi possível criar a pasta no Google Drive");
  return created.id;
}

/** Faz upload multipart do XLSX para a pasta indicada. */
export async function uploadXlsx(
  accessToken: string,
  folderId: string,
  fileName: string,
  buffer: Buffer,
): Promise<{ id: string; name: string }> {
  const boundary = "manus-backup-boundary-" + Math.random().toString(36).slice(2);
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}\r\n--${boundary}\r\nContent-Type: ${metadata.mimeType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(pre, "utf8"), buffer, Buffer.from(post, "utf8")]);

  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const json = (await res.json()) as { id?: string; name?: string; error?: { message?: string } };
  if (!json.id) {
    throw new Error(`Falha no upload para o Drive: ${json.error?.message ?? "desconhecido"}`);
  }
  return { id: json.id, name: json.name ?? fileName };
}
