export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Mercado Livre developer credentials (optional until user provides them).
  // When both are present, the official OAuth-based data provider can be used.
  mlAppId: process.env.ML_APP_ID ?? "",
  mlClientSecret: process.env.ML_CLIENT_SECRET ?? "",
  // Canonical public origin used to build the ML OAuth redirect_uri. This MUST
  // match exactly the redirect URI registered in the ML DevCenter, regardless
  // of whether the flow is started from the preview or the published domain.
  mlPublicOrigin: process.env.ML_PUBLIC_ORIGIN ?? "https://mlmarketanl-kcmkt5tl.manus.space",
  // Unwrangle third-party intelligence API key. Used ONLY by the
  // server/competitors module. It is completely isolated from the ML seller
  // account: no ML OAuth token, CNPJ, cookies or user identity ever reach this
  // provider. Empty string until the user provides it via project secrets.
  unwrangleApiKey: process.env.UNWRANGLE_API_KEY ?? "",
};
