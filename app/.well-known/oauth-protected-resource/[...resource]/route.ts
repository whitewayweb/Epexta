import { oauthEndpoints } from "@/lib/oauth/endpoints";

// One document per MCP route: /.well-known/oauth-protected-resource/<mcpPath>.
export async function GET(_request: Request, { params }: { params: Promise<{ resource: string[] }> }): Promise<Response> {
  const { resource } = await params;
  return oauthEndpoints.protectedResourceMetadata(`/${resource.join("/")}`);
}

export const OPTIONS = oauthEndpoints.preflight;
