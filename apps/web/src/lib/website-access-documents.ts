import type { WebsiteSiteMember, WebsiteSiteRole } from '@ai-workflow-studio/website-schema';

const RESPONSE_HEADERS = {
  'cache-control': 'private, no-store, max-age=0',
  'content-type': 'text/html; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive',
} as const;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "font-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shell(locale: 'en' | 'zh-Hant', title: string, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta content="width=device-width,initial-scale=1" name="viewport"><meta content="noindex,nofollow,noarchive" name="robots"><title>${escapeHtml(
    title,
  )}</title><style>:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#0f172a;background:linear-gradient(145deg,#f8fafc,#eef2ff)}*{box-sizing:border-box}body{display:grid;min-height:100vh;margin:0;place-items:center;padding:24px}.card{width:min(620px,100%);border:1px solid #dbe3ee;border-radius:30px;background:#fff;padding:clamp(28px,6vw,48px);box-shadow:0 28px 75px #0f172a16}.brand{color:#4f46e5;font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}h1{font-size:clamp(30px,7vw,44px);letter-spacing:-.04em;margin:14px 0}p{color:#5b6b82;line-height:1.75}.notice{border:1px solid #c7d2fe;border-radius:16px;background:#eef2ff;color:#3730a3;padding:12px 14px}.fields{display:grid;gap:14px;margin-top:24px}.field{color:#334155;display:grid;font-size:13px;font-weight:750;gap:7px}.field input{border:1px solid #cbd5e1;border-radius:13px;font:inherit;padding:12px 14px}.actions{align-items:center;display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.button{border:1px solid #0f172a;border-radius:999px;background:#0f172a;color:#fff;cursor:pointer;font:inherit;font-size:14px;font-weight:850;padding:12px 20px;text-decoration:none}.button.secondary{background:#fff;color:#0f172a}.split{display:grid;gap:28px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:26px}.split section{border-top:1px solid #e2e8f0;padding-top:20px}.split h2{font-size:20px;margin:0}.honeypot{clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}.role{display:inline-block;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:800;padding:6px 10px}@media(max-width:640px){.split{grid-template-columns:1fr}}</style></head><body><main class="card">${body}</main></body></html>`;
}

export function websiteAccessHeaders(formActionOrigin?: string): Readonly<Record<string, string>> {
  let formAction = "'self'";
  if (formActionOrigin !== undefined) {
    const parsed = new URL(formActionOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Website authentication origin must use HTTP or HTTPS.');
    }
    formAction = parsed.origin;
  }
  return {
    ...RESPONSE_HEADERS,
    'content-security-policy': [
      ...CONTENT_SECURITY_POLICY,
      `form-action 'self' ${formAction}`,
    ].join('; '),
  };
}

export function renderWebsiteAccessDeniedDocument(input: {
  readonly authHref: string;
  readonly backHref: string;
  readonly hasIdentity: boolean;
  readonly locale: 'en' | 'zh-Hant';
  readonly requiredRole: WebsiteSiteRole;
}): string {
  const zh = input.locale === 'zh-Hant';
  const role = {
    manager: zh ? '管理者' : 'Manager',
    member: zh ? '會員' : 'Member',
    staff: zh ? '工作人員' : 'Staff',
  }[input.requiredRole];
  const title = input.hasIdentity
    ? zh
      ? '權限不足'
      : 'Access denied'
    : zh
      ? '此頁面需要登入'
      : 'Sign in required';
  const message = input.hasIdentity
    ? zh
      ? `你的網站會員角色不足，此頁面最低需要「${role}」權限。`
      : `Your site role cannot open this page. The minimum required role is ${role}.`
    : zh
      ? `這是受保護頁面，最低需要「${role}」權限。`
      : `This protected page requires the ${role} role or higher.`;
  return shell(
    input.locale,
    title,
    `<div class="brand">Protected page</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(
      message,
    )}</p><div class="actions"><a class="button" href="${escapeHtml(input.authHref)}">${
      zh ? '前往會員登入' : 'Open member sign in'
    }</a><a class="button secondary" href="${escapeHtml(input.backHref)}">${
      zh ? '返回網站' : 'Back to site'
    }</a></div>`,
  );
}

export function renderWebsiteAuthDocument(input: {
  readonly authAction: string;
  readonly backHref: string;
  readonly locale: 'en' | 'zh-Hant';
  readonly member?: WebsiteSiteMember;
  readonly message?: string;
  readonly pageSlug: string;
  readonly registrationEnabled: boolean;
  readonly siteName: string;
}): string {
  const zh = input.locale === 'zh-Hant';
  const role =
    input.member === undefined
      ? ''
      : {
          manager: zh ? '管理者' : 'Manager',
          member: zh ? '會員' : 'Member',
          staff: zh ? '工作人員' : 'Staff',
        }[input.member.role];
  const notice =
    input.message === undefined
      ? ''
      : `<p aria-live="polite" class="notice">${escapeHtml(input.message)}</p>`;
  if (input.member !== undefined) {
    return shell(
      input.locale,
      zh ? '網站會員帳戶' : 'Site member account',
      `<div class="brand">${escapeHtml(input.siteName)}</div><h1>${
        zh ? '會員帳戶' : 'Member account'
      }</h1>${notice}<p><strong>${escapeHtml(
        input.member.displayName,
      )}</strong><br>${escapeHtml(input.member.email)}</p><span class="role">${escapeHtml(
        role,
      )}</span><form action="${escapeHtml(
        input.authAction,
      )}" method="post"><input name="action" type="hidden" value="logout"><input name="pageSlug" type="hidden" value="${escapeHtml(
        input.pageSlug,
      )}"><div class="actions"><a class="button" href="${escapeHtml(input.backHref)}">${
        zh ? '返回網站' : 'Back to site'
      }</a><button class="button secondary" type="submit">${
        zh ? '登出' : 'Sign out'
      }</button></div></form>`,
    );
  }
  const registration = input.registrationEnabled
    ? `<section><h2>${zh ? '建立網站會員' : 'Create a site account'}</h2><form action="${escapeHtml(
        input.authAction,
      )}" method="post"><input name="action" type="hidden" value="register"><input name="pageSlug" type="hidden" value="${escapeHtml(
        input.pageSlug,
      )}"><div class="fields"><label class="field">${zh ? '顯示名稱' : 'Display name'}<input autocomplete="name" maxlength="120" name="displayName" required></label><label class="field">${
        zh ? '電子郵件' : 'Email'
      }<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label class="field">${
        zh ? '密碼' : 'Password'
      }<input autocomplete="new-password" maxlength="128" minlength="10" name="password" required type="password"></label><label class="field">${
        zh ? '確認密碼' : 'Confirm password'
      }<input autocomplete="new-password" maxlength="128" minlength="10" name="confirmPassword" required type="password"></label><label class="honeypot">Website<input autocomplete="off" name="website" tabindex="-1"></label></div><div class="actions"><button class="button" type="submit">${
        zh ? '註冊' : 'Register'
      }</button></div></form></section>`
    : `<section><h2>${zh ? '尚未開放註冊' : 'Registration is closed'}</h2><p>${
        zh
          ? '目前只允許已由網站管理者建立的會員登入。'
          : 'Only members already added by the site owner can sign in.'
      }</p></section>`;
  return shell(
    input.locale,
    zh ? '網站會員登入' : 'Site member sign in',
    `<div class="brand">${escapeHtml(input.siteName)}</div><h1>${
      zh ? '會員登入' : 'Member sign in'
    }</h1>${notice}<p>${
      zh
        ? '此帳戶只用於這個自製網站，不會取得 AI Workflow Studio 工作區權限。'
        : 'This account only belongs to this site and does not grant AI Workflow Studio workspace access.'
    }</p><div class="split"><section><h2>${zh ? '登入' : 'Sign in'}</h2><form action="${escapeHtml(
      input.authAction,
    )}" method="post"><input name="action" type="hidden" value="login"><input name="pageSlug" type="hidden" value="${escapeHtml(
      input.pageSlug,
    )}"><div class="fields"><label class="field">${
      zh ? '電子郵件' : 'Email'
    }<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label class="field">${
      zh ? '密碼' : 'Password'
    }<input autocomplete="current-password" maxlength="128" name="password" required type="password"></label></div><div class="actions"><button class="button" type="submit">${
      zh ? '安全登入' : 'Sign in securely'
    }</button></div></form></section>${registration}</div><div class="actions"><a class="button secondary" href="${escapeHtml(
      input.backHref,
    )}">${zh ? '返回網站' : 'Back to site'}</a></div>`,
  );
}
