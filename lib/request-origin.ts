// Next.js builds request.url from the server's bind hostname (0.0.0.0 by
// default), not the host the browser actually used, so absolute URLs derived
// from it — OAuth redirect URIs, media URLs — can point at an origin the
// browser or provider rejects. Rebuild the origin from the Host header,
// honoring proxy forwarding headers for self-hosted deployments.
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host");

  if (!host) {
    return url.origin;
  }

  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    url.protocol.replace(":", "");

  return `${protocol}://${host}`;
}
