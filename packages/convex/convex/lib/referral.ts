import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { parceriaPorSlug } from "./parceriaPorSlug";

/**
 * Resolve an affiliate/partnership referral from a URL slug.
 *
 * Given the `slug` of a partnership (an affiliate), returns the partnership's
 * `_id` and `name` so a lead/booking row can record where it came from.
 * Returns an empty object when no slug is passed or the slug matches nothing,
 * so callers can safely spread the result onto an insert.
 */
export async function resolveReferral(
  ctx: QueryCtx | MutationCtx,
  slug?: string | null,
): Promise<{ partnershipId?: Id<"partnerships">; partnershipName?: string }> {
  if (!slug) return {};
  /* Também pelos endereços antigos: o cookie de atribuição de quem visitou
     antes de a parceria mudar de endereço ainda tem o antigo. */
  const p = await parceriaPorSlug(ctx, slug);
  if (!p) return {};
  return { partnershipId: p._id, partnershipName: p.name };
}
