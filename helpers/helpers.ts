import { main, pageRoutes } from "./routes";
import { MailSlurp } from "mailslurp-client";

/**
 * Utilities for classifying network links and provisioning a working MailSlurp client for tests.
 */

/**
 * Matches common audio/video asset URLs.
 */
const videoPattern: RegExp =
  /https?:\/\/.*\.(mp4|webm|ogg|mp3|wav|m4a|flac|aac)(\?.*)?$/;
const gaPatterns: RegExp[] = [
  /^(https?:\/\/)?(www\.)?(analytics\.google\.com|www\.google-analytics\.com)(\/.*)?$/i,
  /https:\/\/googleads\.g\.doubleclick\.net\/pagead\/id/,
];
const youtubePatterns: RegExp[] = [
  /https:\/\/(www\.)?youtube\.com\/(watch\?v=|embed\/|api\/stats\/(playback|atr|qoe|ptracking|watchtime)\?|ptracking\?|v\/|c\/|user\/|channel\/|playlist\?list=|shorts\/|results\?search_query=)[\w-]+(&[\w=]*)*/,
  /https:\/\/www\.youtube\.com\/generate_204\?.*/,
];
const recaptchaPatterns: RegExp[] = [
  /https:\/\/www\.google\.com\/recaptcha\/.*/,
  /https:\/\/www\.google\.com\/recaptcha\/api2\/.*/,
  /https:\/\/www\.google\.com\/recaptcha\/enterprise\/.*/,
];
const exceptPattern: RegExp =
  /https:\/\/stats\.g\.doubleclick\.net\/g\/collect\?v=\d+&tid=G-[\w\d]+&cid=\d+\.\d+&gtm=[\w\d]+&aip=\d+&dma=\d+&gcd=[\w\d]+&npa=\d+&frm=\d+&tag_exp=\d+/;

const exceptUrls: string[] = [
  "https://consentcdn.cookiebot.com/consentconfig/7f599eef-471b-4c16-a0c6-40061801485c/localhost/configuration.js",
  main + "api/subscribe",
  "https://www.carlyle.com/cdn-cgi/challenge-platform/scripts/jsd/main.js",
];
const exceptPages: string[] = [main + pageRoutes.financial_results];
export const LinkType = (url: string, page: string) => {
  if (videoPattern.test(url)) {
    return "Video";
  }
  if (gaPatterns.some((pattern) => pattern.test(url))) {
    return "GA";
  }
  if (youtubePatterns.some((pattern) => pattern.test(url))) {
    return "YT";
  }
  if (recaptchaPatterns.some((pattern) => pattern.test(url))) {
    return "Ignore";
  }
  if (exceptPattern.test(url)) {
    return "Exception";
  }
  if (
    exceptUrls.some((except) => except === url) ||
    exceptPages.some((exceptPage) => exceptPage == page)
  ) {
    return "Ignore";
  }
  return "NONE";
};

/**
 * API keys tested in order to acquire a working MailSlurp client for e2e tests.
 * Note: Prefer using env var `MAILSLURP_API_KEYS` (comma-separated) in CI and leave this list empty.
 */
export const apiKeys = [
  "245ff1a2a6a9acd297536ae0a460066a4cc50c976e91e87106ed5e4c622f4986",
  "5456176b80b0104e07852c94105f9bcb07c7dd4d6e487af2f168ed525ca03c5f",
  "f0c0fcff92414a656495248e13feeca006e9b0396c24c4a1d344b20ad670567c",
];

/**
 * Resolve a working MailSlurp client and a newly created inbox by trying keys in order.
 * Keys are sourced from `process.env.MAILSLURP_API_KEYS` (comma-separated) when available,
 * otherwise it falls back to `apiKeys`.
 */
export const getWorkingMailSlurp = async () => {
  const envKeys = (process.env.MAILSLURP_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const keysToTry = envKeys.length > 0 ? envKeys : apiKeys;
  for (const key of keysToTry) {
    const mailslurp = new MailSlurp({ apiKey: key });
    try {
      // Create an inbox to validate the key and return it for test usage
      const inbox = await mailslurp.inboxController.createInbox({});
      return { mailslurp, inbox };
    } catch (error) {
      console.warn(`MailSlurp API key failed: ${key.slice(0, 8)}...`);
    }
  }
  throw new Error("No hay ninguna apiKey válida para MailSlurp");
};
