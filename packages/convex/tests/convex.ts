import { convexTest } from "convex-test";
import schema from "../convex/schema";
import aggregateSchema from "../node_modules/@convex-dev/aggregate/src/component/schema";

/*
 * A test backend with the app's functions and the components they use
 * (convex/convex.config.ts). Without the aggregate component, any write to
 * an order fails in the trigger (lib/triggers.ts).
 */
const modules = import.meta.glob("../convex/**/*.*s");
const aggregateModules = import.meta.glob("../node_modules/@convex-dev/aggregate/src/component/**/*.ts");

export function makeTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("orderFacts", aggregateSchema, aggregateModules);
  return t;
}
