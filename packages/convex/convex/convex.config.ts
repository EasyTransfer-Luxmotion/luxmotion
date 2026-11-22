import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
/* The counts, sums and sorted positions of the orders (lib/orderFacts.ts):
   what the lists and the numbers read instead of the whole table. */
app.use(aggregate, { name: "orderFacts" });
export default app;
