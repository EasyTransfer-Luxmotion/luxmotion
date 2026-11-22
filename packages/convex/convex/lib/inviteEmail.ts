/*
 * The team invitation email (equipa.enviarConvite). A pure function so it can
 * be rendered outside Convex to look at it.
 *
 * Email clients are not browsers: tables for layout, inline styles, solid
 * colours with bgcolor (Outlook ignores gradients), the logo as a JPG from the
 * CDN (Gmail and Outlook drop SVG), and a serif fallback for the title face
 * (only Apple Mail loads web fonts). The brand is the back-office's: the gold
 * band of the sidebar, the LM monogram, "Olá" in italic serif.
 */

export type InviteEmailInput = {
  firstName: string;
  inviter: string;
  role: string | null;
  email: string;
  message: string | null;
  link: string;
  expiresAt: number;
  lang: "pt" | "en";
  // The environment's CDN (BUNNY_CDN_URL): public/ is mirrored there.
  cdnUrl: string | null;
  // The day-5 reminder: other subject and a line saying it is about to expire.
  reminder?: boolean;
};

const GOLD = "#8a6a2c";
const GOLD_DARK = "#6e5322";
const INK = "#1c1b18";
const MUTED = "#5a5852";
const FAINT = "#8a8780";
const PAGE = "#f5f3ef";
const LOGO_PATH = "/shared/logos/luxmotion-logo-square.jpg";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESC[c]!);

export function inviteEmail(d: InviteEmailInput): { subject: string; html: string; text: string } {
  const en = d.lang === "en";
  const until = new Intl.DateTimeFormat(en ? "en-GB" : "pt-PT", { day: "numeric", month: "long", timeZone: "Europe/Lisbon" }).format(d.expiresAt);
  const first = esc(d.firstName);
  const inviter = esc(d.inviter);
  const role = d.role ? esc(d.role) : null;
  const email = esc(d.email);

  const t = en
    ? {
        subject: d.reminder ? "Reminder: your invitation to the LuxMotion back-office" : "Your invitation to the LuxMotion back-office",
        reminderLine: `Your invitation expires on ${until}. Accept it before then, or ask for a new one.`,
        preheader: `${d.inviter} added you to the LuxMotion team.`,
        hello: "Hello",
        who: `${inviter} invited you to the LuxMotion team${role ? ` as <strong style="color:${INK}">${role}</strong>` : ""}.`,
        how: `Sign in with <strong style="color:${INK}">${email}</strong>, with Google or with a code sent to this address. If you don't have an account yet, you'll create it in the same step.`,
        button: "See the invitation",
        valid: `Valid until ${until}. On the next page you can accept or decline it.`,
        ignore: "If you weren't expecting this email, you can ignore it: nothing happens unless you sign in with this address.",
      }
    : {
        subject: d.reminder ? "Lembrete: o seu convite para o back-office da LuxMotion" : "Convite para o back-office da LuxMotion",
        reminderLine: `O seu convite expira a ${until}. Aceite-o até lá, ou peça um novo.`,
        // Same words as the invitation page, which avoid "acrescentou-o" (wrong for half the team).
        preheader: `${d.inviter} quer contar consigo na equipa LuxMotion.`,
        hello: "Olá",
        who: `${inviter} quer contar consigo na equipa LuxMotion${role ? ` como <strong style="color:${INK}">${role}</strong>` : ""}.`,
        how: `Entre com <strong style="color:${INK}">${email}</strong>, com o Google ou com um código enviado para este email. Se ainda não tem conta, cria-a no mesmo passo.`,
        button: "Ver o convite",
        valid: `Válido até ${until}. Na página seguinte pode aceitá-lo ou recusá-lo.`,
        ignore: "Se não esperava este email, pode ignorá-lo: sem entrar com este endereço, nada acontece.",
      };

  const logo = d.cdnUrl
    ? `<img src="${esc(d.cdnUrl.replace(/\/$/, "") + LOGO_PATH)}" width="40" height="40" alt="LM" style="display:block;width:40px;height:40px;border-radius:8px;border:0">`
    : `<span style="display:inline-block;width:38px;height:38px;line-height:38px;text-align:center;border:1px solid #ffffff;border-radius:8px;font-family:Georgia,serif;font-size:16px;color:#ffffff">LM</span>`;

  const quote = d.message
    ? `<tr><td style="padding:0 32px 22px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-left:3px solid ${GOLD};background:#faf7f1;padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3a3833">
            ${esc(d.message).replace(/\n/g, "<br>")}<br><span style="font-size:13px;color:${FAINT}">— ${inviter}</span>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="${en ? "en" : "pt"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td bgcolor="${GOLD}" style="background:${GOLD};padding:22px 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:12px">${logo}</td>
          <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff">
            <div style="font-size:16px;font-weight:bold;line-height:1.1">LuxMotion</div>
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#f1e6cf;padding-top:3px">Back-office</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px 32px 8px">
        <div style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-style:italic;font-size:40px;line-height:1.1;color:${GOLD_DARK}">${t.hello}, <span style="font-style:normal;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:300;color:${INK}">${first}</span></div>
      </td></tr>
      ${d.reminder ? `<tr><td style="padding:14px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#fbf3e2" style="background:#fbf3e2;border-radius:10px;padding:10px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#7a5512">${esc(t.reminderLine)}</td></tr></table></td></tr>` : ""}
      <tr><td style="padding:12px 32px 18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${MUTED}">${t.who}</td></tr>
      ${quote}
      <tr><td style="padding:0 32px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${MUTED}">${t.how}</td></tr>
      <tr><td style="padding:0 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="${GOLD}" style="background:${GOLD};border-radius:999px">
            <a href="${esc(d.link)}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px">${t.button} &rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${MUTED}">${t.valid}</td></tr>
    </table>
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
      <tr><td style="padding:18px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${FAINT};text-align:center">${t.ignore}<br><span style="color:${GOLD}">LuxMotion · EasyTransfer Portugal</span></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  // Plain text too: some clients show only this, and spam filters like having both.
  const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const text = [
    `${t.hello}, ${d.firstName}`,
    "",
    d.reminder ? `${t.reminderLine}\n` : null,
    plain(t.who),
    d.message ? `\n"${d.message}"\n— ${d.inviter}` : null,
    "",
    plain(t.how),
    "",
    `${t.button}: ${d.link}`,
    plain(t.valid),
    "",
    t.ignore,
  ]
    .filter((x) => x !== null)
    .join("\n");

  return { subject: t.subject, html, text };
}
