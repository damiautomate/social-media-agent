// Per-platform OAuth config + token exchange + identity fetch.
// Server-only (uses client secrets). Specs current as of 2026-05.
//
// Each provider exposes:
//   scopes               — array of OAuth scopes to request
//   clientIdEnv/secretEnv — env var names holding YOUR app credentials
//   authorizeUrl(...)    — builds the redirect-to-platform URL
//   exchange(...)        — swaps the code for tokens
//   finalize(...)        — fetches the connected account identity → connection row fields
//
// Redirect URI for every platform is: {APP_URL}/api/connect/{platform}/callback

function env(name) {
  const v = (typeof process !== "undefined" && process.env && process.env[name]) || "";
  return v;
}
function appUrl() {
  const u = env("APP_URL");
  if (!u) throw new Error("APP_URL is not set (e.g. https://your-app.vercel.app)");
  return u.replace(/\/+$/, "");
}
export function redirectUriFor(platform) {
  return `${appUrl()}/api/connect/${platform}/callback`;
}

const GRAPH = "https://graph.facebook.com/v23.0";

export const PROVIDERS = {
  // ---------------------------------------------------------
  linkedin: {
    label: "LinkedIn",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    // openid+profile to identify the member; w_member_social to post on their behalf
    scopes: ["openid", "profile", "w_member_social"],
    authorizeUrl({ clientId, redirectUri, state, scope }) {
      const p = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope });
      return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
    },
    async exchange({ code, redirectUri, clientId, clientSecret }) {
      const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      });
      if (!res.ok) throw new Error(`LinkedIn token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json(); // { access_token, expires_in, refresh_token?, refresh_token_expires_in?, scope }
    },
    async finalize({ tokens }) {
      // OpenID userinfo → member identity. Posting uses URN urn:li:person:{sub}
      const res = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (!res.ok) throw new Error(`LinkedIn userinfo HTTP ${res.status}`);
      const u = await res.json();
      return {
        accountId: u.sub,
        accountName: u.name || [u.given_name, u.family_name].filter(Boolean).join(" ") || "LinkedIn member",
        accountUsername: null,
        refreshToken: tokens.refresh_token || null,
        expiresInSec: tokens.expires_in || null,
        scope: tokens.scope || null,
        meta: { memberUrn: `urn:li:person:${u.sub}`, tokenType: "member" },
      };
    },
  },

  // ---------------------------------------------------------
  facebook: {
    label: "Facebook Page",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    // Page posting + the page/business reads needed to find the target Page
    scopes: ["public_profile", "pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"],
    authorizeUrl({ clientId, redirectUri, state, scope }) {
      const p = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: scope.replace(/ /g, ",") });
      return `https://www.facebook.com/v23.0/dialog/oauth?${p}`;
    },
    async exchange({ code, redirectUri, clientId, clientSecret }) {
      const p = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
      const res = await fetch(`${GRAPH}/oauth/access_token?${p}`);
      if (!res.ok) throw new Error(`Meta token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const short = await res.json(); // { access_token, expires_in }
      // Upgrade to a long-lived user token (~60 days)
      const lp = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: clientSecret, fb_exchange_token: short.access_token });
      const lres = await fetch(`${GRAPH}/oauth/access_token?${lp}`);
      return lres.ok ? lres.json() : short;
    },
    async finalize({ tokens }) {
      // List the user's Pages; take the first (UI can later let them choose). Page token is what we post with.
      const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,username&access_token=${encodeURIComponent(tokens.access_token)}`);
      if (!res.ok) throw new Error(`Meta /me/accounts HTTP ${res.status}`);
      const data = await res.json();
      const page = (data.data || [])[0];
      if (!page) throw new Error("No Facebook Page found on this account. Create or manage a Page first.");
      return {
        accountId: page.id,
        accountName: page.name,
        accountUsername: page.username || null,
        // Store the PAGE access token as the working token (long-lived, doesn't expire if user token was long-lived)
        overrideAccessToken: page.access_token,
        refreshToken: null,
        expiresInSec: null,
        scope: null,
        meta: { pageId: page.id, tokenType: "page" },
      };
    },
  },

  // ---------------------------------------------------------
  instagram: {
    label: "Instagram",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    // IG publishing goes through the linked Facebook Page + IG Business account
    scopes: ["public_profile", "pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish", "business_management"],
    authorizeUrl({ clientId, redirectUri, state, scope }) {
      const p = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state, scope: scope.replace(/ /g, ",") });
      return `https://www.facebook.com/v23.0/dialog/oauth?${p}`;
    },
    async exchange(args) { return PROVIDERS.facebook.exchange(args); },
    async finalize({ tokens }) {
      // Find a Page that has an instagram_business_account linked.
      const res = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(tokens.access_token)}`);
      if (!res.ok) throw new Error(`Meta /me/accounts HTTP ${res.status}`);
      const data = await res.json();
      const page = (data.data || []).find((p) => p.instagram_business_account);
      if (!page) throw new Error("No Instagram Business account linked to your Facebook Pages. Link one in IG settings first.");
      const ig = page.instagram_business_account;
      return {
        accountId: ig.id,
        accountName: ig.name || ig.username || "Instagram",
        accountUsername: ig.username || null,
        overrideAccessToken: page.access_token, // publish with the Page token
        refreshToken: null,
        expiresInSec: null,
        scope: null,
        meta: { igBusinessId: ig.id, pageId: page.id, tokenType: "page" },
      };
    },
  },

  // ---------------------------------------------------------
  tiktok: {
    label: "TikTok",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    scopes: ["user.info.basic", "video.publish"],
    authorizeUrl({ clientId, redirectUri, state, scope }) {
      const p = new URLSearchParams({ client_key: clientId, response_type: "code", scope: scope.replace(/ /g, ","), redirect_uri: redirectUri, state });
      return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
    },
    async exchange({ code, redirectUri, clientId, clientSecret }) {
      const body = new URLSearchParams({ client_key: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      });
      if (!res.ok) throw new Error(`TikTok token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json(); // { access_token, expires_in, refresh_token, refresh_token_expires_in, open_id, scope, token_type }
    },
    async finalize({ tokens }) {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      let name = "TikTok", username = null;
      if (res.ok) { const d = await res.json(); name = d?.data?.user?.display_name || name; username = d?.data?.user?.username || null; }
      return {
        accountId: tokens.open_id,
        accountName: name,
        accountUsername: username,
        refreshToken: tokens.refresh_token || null,
        expiresInSec: tokens.expires_in || null,
        scope: tokens.scope || null,
        meta: { openId: tokens.open_id, tokenType: "user" },
      };
    },
  },
};

export function getProvider(platform) {
  const p = PROVIDERS[platform];
  if (!p) return null;
  return p;
}

export function providerCredentials(platform) {
  const p = PROVIDERS[platform];
  if (!p) throw new Error(`Unknown platform: ${platform}`);
  const clientId = env(p.clientIdEnv);
  const clientSecret = env(p.clientSecretEnv);
  if (!clientId || !clientSecret) throw new Error(`Missing ${p.clientIdEnv} / ${p.clientSecretEnv} env vars`);
  return { clientId, clientSecret };
}
