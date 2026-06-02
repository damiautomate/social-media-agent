import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-helpers.js";
import { getProvider, providerCredentials, redirectUriFor } from "@/lib/oauth-providers.js";
import { signState } from "@/lib/oauth-state.js";

// Returns { url } — the frontend then does window.location.href = url
export async function GET(request, { params }) {
  const auth = await verifyAuth(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { platform } = await params;
  const provider = getProvider(platform);
  if (!provider) return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });

  let clientId;
  try { ({ clientId } = providerCredentials(platform)); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  const redirectUri = redirectUriFor(platform);
  const state = await signState({ userId: auth.userId, platform });
  const url = provider.authorizeUrl({ clientId, redirectUri, state, scope: provider.scopes.join(" ") });
  return NextResponse.json({ url });
}
