import Script from "next/script";

const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
const fallbackScriptUrl = "/api/umami/script";

export function UmamiScript() {
  if (!umamiWebsiteId) return null;

  return (
    <Script
      id="umami-script"
      src={umamiScriptUrl ?? fallbackScriptUrl}
      strategy="afterInteractive"
      data-website-id={umamiWebsiteId}
    />
  );
}
