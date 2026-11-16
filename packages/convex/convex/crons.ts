import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Refresh the cached Google reviews once a day (04:00 UTC).
crons.daily(
  "refresh google reviews",
  { hourUTC: 4, minuteUTC: 0 },
  internal.googleReviews.fetchGoogleReviews,
);

// Um artigo de blog às terças e outro às quintas. Os crons do Convex são em
// UTC: 10:00 UTC é 10:00 em Lisboa no inverno e 11:00 no verão. Não há forma de
// fixar a hora local num cron UTC, e para um blog a diferença é irrelevante.
// A geração só corre com BLOG_AUTOMATION_ENABLED="true".
crons.weekly(
  "generate blog tuesday",
  { dayOfWeek: "tuesday", hourUTC: 10, minuteUTC: 0 },
  internal.blogAutomation.generateArticle,
  { trigger: "cron" as const },
);
crons.weekly(
  "generate blog thursday",
  { dayOfWeek: "thursday", hourUTC: 10, minuteUTC: 0 },
  internal.blogAutomation.generateArticle,
  { trigger: "cron" as const },
);

// O feed do Instagram, uma vez por dia (05:00 UTC). O site lê a cache: se a
// sincronização falhar, fica o último feed bom no lugar e o erro registado.
crons.daily(
  "sync instagram feed",
  { hourUTC: 5, minuteUTC: 0 },
  internal.instagram.syncInstagram,
  {},
);

// As parcerias publicadas: o checkout tem carros e o endereço é válido.
// 07:00 UTC, antes de a equipa começar. Manda email só se houver problemas.
crons.daily(
  "verificar parcerias",
  { hourUTC: 7, minuteUTC: 0 },
  internal.vigilancia.verificarParceiros,
  {},
);

export default crons;
