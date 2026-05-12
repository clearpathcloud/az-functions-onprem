import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time HMAC verification for inbound webhooks.
 *
 * Usage:
 *     const ok = verifyHmac(secret, rawBody, req.get("x-signature") ?? "");
 *
 * For real webhook providers (Stripe, GitHub, etc.) you typically need the
 * **raw** request body (pre-JSON-parse) - express.json discards it by default.
 * Capture it with: `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })`.
 */
export function verifyHmac(
    secret: string,
    payload: string | Buffer,
    signature: string,
    algorithm: "sha256" | "sha1" = "sha256",
): boolean {
    if (!secret || !signature) return false;
    const computed = createHmac(algorithm, secret).update(payload).digest("hex");
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    try {
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}
