import Script from "next/script";

const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();

export function UmamiScript() {
  if (!umamiScriptUrl || !umamiWebsiteId) return null;

  return (
    <Script
      id="umami-script"
      src={umamiScriptUrl}
      strategy="afterInteractive"
      data-website-id={umamiWebsiteId}
    />
  );
}
