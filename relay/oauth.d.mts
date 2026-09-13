/** Types for the relay's OAuth module (`relay/oauth.mjs`). */

export declare const CODE_TTL_MS: number;
export declare const ACCESS_TOKEN_TTL_MS: number;

export interface OAuthOptions {
  now?: () => number;
  wallets?: Map<string, unknown>;
}

export interface OAuth {
  registerClient(body: { redirect_uris?: unknown } | undefined): {
    client_id: string;
    redirect_uris: string[];
    token_endpoint_auth_method: string;
    grant_types: string[];
    response_types: string[];
  };
  authorize(params: Record<string, string | undefined>): {
    ok: boolean;
    error?: string;
    redirectTo?: string;
  };
  token(body: Record<string, unknown> | undefined): {
    ok: boolean;
    error?: string;
    body?: {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    };
  };
  resolveToken(header: unknown): string | null;
  revokeWallet(walletId: string): void;
  walletFromAuthorize(params: Record<string, string | undefined>): string | null;
  clientCount: number;
}

export declare function safeEqual(a: unknown, b: unknown): boolean;
export declare function verifyPkce(verifier: unknown, challenge: unknown): boolean;
export declare function authorizationServerMetadata(baseUrl: string): Record<string, unknown>;
export declare function protectedResourceMetadata(baseUrl: string): Record<string, unknown>;
export declare function createOAuth(options?: OAuthOptions): OAuth;
