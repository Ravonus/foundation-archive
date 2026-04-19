import Script from "next/script";

const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
const explicitScriptUrl =
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim() || undefined;
const fallbackScriptUrl = "/api/umami/script";
const umamiSrc = explicitScriptUrl ?? fallbackScriptUrl;
const umamiHostUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined;

export function UmamiScript() {
  if (!umamiWebsiteId) return null;

  return (
    <Script
      id="umami-script"
      src={umamiSrc}
      strategy="afterInteractive"
      data-website-id={umamiWebsiteId}
      data-host-url={umamiHostUrl}
    />
  );
}
