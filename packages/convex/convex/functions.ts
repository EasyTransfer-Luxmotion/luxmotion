import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { triggers } from "./lib/triggers";

/*
 * The only `mutation` and `internalMutation` to use in this project: the same
 * as the generated ones, plus the triggers of lib/triggers.ts on every write.
 * A mutation built from _generated/server writes without them and leaves the
 * order counts and sums wrong (tests/facts.test.ts checks every file).
 */
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
