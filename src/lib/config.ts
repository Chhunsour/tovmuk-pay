import "server-only";

export type PayWayConfig = {
  merchantId: string;
  apiKey: string;
  /** PayWay host: production by default, the sandbox or a local mock when overridden. */
  baseUrl: string;
  /** Our public origin, used to build the callback / return / cancel URLs we sign. */
  appBaseUrl: string;
};

/** PayWay settings from the environment, or null when payments are not configured. */
export function paywayConfig(): PayWayConfig | null {
  const merchantId = env("PAYWAY_MERCHANT_ID");
  const apiKey = env("PAYWAY_API_KEY");
  const appBaseUrl = env("APP_BASE_URL");
  if (!merchantId || !apiKey || !appBaseUrl) return null;
  return {
    merchantId,
    apiKey,
    baseUrl: trimSlash(env("PAYWAY_BASE_URL") ?? "https://checkout.payway.com.kh"),
    appBaseUrl: trimSlash(appBaseUrl),
  };
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
