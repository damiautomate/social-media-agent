import { NextResponse } from "next/server";
import { getProvider, providerCredentials, redirectUriFor } from "@/lib/oauth-providers.js";
import { verifyState } from "@/lib/oauth-state.js";
import { saveSocialConnection } from "@/lib/content-bank.js";

function appBase() { return (process.env.APP_URL || "").replace(/\/+$/, ""); }

// Platform redirects the browser here with ?code & ?state (or ?error).
export async function GET(request, { params }) {
  const { platform } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error_description") || url.searchParams.get("error");

  const back = (qs) => NextResponse.redirect(`${appBase()}/settings?${qs}`);

  if (oauthErr) return back(`channel_error=${encodeURIComponent(oauthErr)}`);
  if (!code || !state) return back("channel_error=missing_code_or_state");

  const verified = await verifyState(state);
  if (!verified || verified.platform !== platform) return back("channel_error=bad_state");

  const provider = getProvider(platform);
  if (!provider) return back("channel_error=unknown_platform");

  try {
    const { clientId, clientSecret } = providerCredentials(platform);
    const redirectUri = redirectUriFor(platform);
    const tokens = await provider.exchange({ code, redirectUri, clientId, clientSecret });
    const fin = await provider.finalize({ tokens });

    const expiresAt = fin.expiresInSec ? new Date(Date.now() + fin.expiresInSec * 1000).toISOString() : null;
    await saveSocialConnection(verified.userId, {
      platform,
      accountId: fin.accountId,
      accountName: fin.accountName,
      accountUsername: fin.accountUsername,
      accessToken: fin.overrideAccessToken || tokens.access_token,
      refreshToken: fin.refreshToken,
      tokenExpiresAt: expiresAt,
      scope: fin.scope || provider.scopes.join(" "),
      meta: fin.meta || {},
    });
    return back(`connected=${platform}`);
  } catch (e) {
    return back(`channel_error=${encodeURIComponent(String(e.message).slice(0, 160))}`);
  }
}
