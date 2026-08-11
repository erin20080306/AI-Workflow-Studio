import {
  WebsiteSpecSchema,
  type WebsiteAction,
  type WebsiteContentEntry,
  type WebsiteDataCollection,
  type WebsiteDataForm,
  type WebsiteDataField,
  type WebsiteSection,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';

import { WEBSITE_CART_SCRIPT } from './website-cart';

const PREVIEW_STYLES = `
:root{color-scheme:light;--bg:#f6f4ef;--surface:#fffdf9;--surface-2:#eceadf;--text:#161513;--muted:#6a675f;--line:#e0dccf;--accent:#4f46e5;--accent-2:#10b981;--on-accent:#fff;--radius:20px;--space:104px;--maxw:1200px;--font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--display:var(--font);--tracking:-.02em}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}button{font:inherit}img{max-width:100%}
.theme-graphite-amber{--bg:#f4f1ea;--surface:#fffefb;--surface-2:#efe9d8;--text:#141311;--muted:#5f5c54;--line:#e0d9c9;--accent:#161513;--accent-2:#c2820a;--on-accent:#fff}
.theme-navy-cyan{--bg:#05101f;--surface:#0c1c30;--surface-2:#122a45;--text:#f4f8fc;--muted:#9db2c8;--line:#213c58;--accent:#2dd4bf;--accent-2:#38bdf8;--on-accent:#04121f}
.theme-forest-sand{--bg:#f3f1e6;--surface:#fffdf4;--surface-2:#e3ecdb;--text:#14251d;--muted:#556a5e;--line:#d3dbca;--accent:#15603b;--accent-2:#b8860b;--on-accent:#fff}
.theme-violet-rose{--bg:#faf6ff;--surface:#fffdff;--surface-2:#f2e7fb;--text:#1d1330;--muted:#665579;--line:#e6d9f0;--accent:#7c3aed;--accent-2:#e11d48;--on-accent:#fff}
.appearance-dark{--bg:#0b0b0d;--surface:#141417;--surface-2:#1d1d21;--text:#f5f4f1;--muted:#a5a29b;--line:#2b2b30;--on-accent:#fff}
.appearance-dark.theme-navy-cyan{--bg:#05101f;--surface:#0c1c30;--surface-2:#122a45;--line:#213c58}
.radius-soft{--radius:10px}.radius-pill{--radius:34px}.density-compact{--space:72px}.density-balanced{--space:88px}
.font-editorial{--font:"Iowan Old Style","Palatino Linotype","Songti TC","Songti SC","Noto Serif CJK TC",Georgia,"Times New Roman",serif;--display:var(--font);--tracking:-.015em}
.font-technical{--font:"SFMono-Regular",ui-monospace,Consolas,"Liberation Mono",monospace;--tracking:-.01em}
.font-friendly{--font:ui-rounded,"SF Pro Rounded",system-ui,sans-serif;--tracking:-.01em}
.shell{min-height:100vh}
.topbar{align-items:center;background:var(--text);color:var(--bg);display:flex;font-size:11px;font-weight:750;justify-content:center;letter-spacing:.22em;padding:9px 16px;text-transform:uppercase}
.site-header{align-items:center;background:color-mix(in srgb,var(--bg) 82%,transparent);border-bottom:1px solid var(--line);display:flex;gap:28px;justify-content:space-between;padding:22px clamp(24px,5vw,80px);position:sticky;top:0;z-index:5;backdrop-filter:blur(16px)}.brand{font-family:var(--display);font-size:21px;font-weight:800;letter-spacing:.02em}.nav{display:flex;flex-wrap:wrap;gap:4px}.nav-item,.footer-link{color:var(--muted);font-size:13px;font-weight:650;letter-spacing:.01em;padding:8px 14px;text-decoration:none;transition:color .2s}.nav-item:hover{color:var(--text)}
.nav-account{border:1px solid var(--line);border-radius:999px;color:var(--text)}
main{overflow:hidden}.section{padding:var(--space) clamp(24px,7vw,110px)}.section-inner{margin:0 auto;max-width:var(--maxw)}.eyebrow{align-items:center;color:var(--accent-2);display:inline-flex;font-size:12px;font-weight:800;gap:12px;letter-spacing:.24em;text-transform:uppercase}.eyebrow:before{background:currentColor;content:"";display:inline-block;height:1px;width:34px}.section-title{font-family:var(--display);font-size:clamp(30px,5vw,56px);font-weight:750;letter-spacing:var(--tracking);line-height:1.05;margin:18px 0}.section-body{color:var(--muted);font-size:18px;line-height:1.75;max-width:60ch;white-space:pre-line}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}.action{align-items:center;background:var(--accent);border:1px solid var(--accent);border-radius:var(--radius);color:var(--on-accent);display:inline-flex;font-size:14px;font-weight:750;gap:10px;justify-content:center;letter-spacing:.01em;padding:14px 26px;text-decoration:none;transition:transform .15s,box-shadow .15s}.action:after{content:"→";font-size:15px;transition:transform .2s}.action:hover{transform:translateY(-2px);box-shadow:0 14px 30px color-mix(in srgb,var(--accent) 24%,transparent)}.action:hover:after{transform:translateX(4px)}.action.secondary{background:transparent;color:var(--text);border-color:var(--line)}.action.secondary:after{content:none}
.hero{align-items:center;display:grid;min-height:clamp(520px,72vh,760px);position:relative}.hero-grid{align-items:center;display:grid;gap:clamp(36px,5vw,72px);grid-template-columns:minmax(0,1.02fr) minmax(300px,.98fr)}.hero .section-title{font-size:clamp(42px,7.4vw,96px);line-height:1.02;margin:22px 0}.hero .section-body{font-size:19px;margin-top:26px}.hero.centered{text-align:center}.hero.centered .eyebrow,.hero.centered .section-body,.hero.centered .actions{justify-content:center;margin-left:auto;margin-right:auto}
.asset{align-items:flex-end;aspect-ratio:4/5;background:linear-gradient(150deg,var(--surface-2),color-mix(in srgb,var(--accent) 20%,var(--surface)));border:1px solid var(--line);border-radius:var(--radius);display:flex;margin:0;min-height:280px;overflow:hidden;padding:24px;position:relative}.asset:before,.asset:after{border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);border-radius:50%;content:"";height:220px;position:absolute;right:-45px;top:-40px;width:220px}.asset:after{height:120px;left:35px;right:auto;top:55px;width:120px}.asset.generated{padding:0}.asset.generated:before,.asset.generated:after{display:none}.asset-image{height:100%;inset:0;object-fit:cover;position:absolute;width:100%}.asset-caption{clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}.asset-label{background:color-mix(in srgb,var(--surface) 88%,transparent);border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12px;font-weight:700;padding:8px 12px;position:relative;z-index:1}
.feature-head{max-width:64ch}.grid{display:grid;gap:20px;margin-top:44px}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.columns-4{grid-template-columns:repeat(4,minmax(0,1fr))}.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:30px;transition:transform .18s,box-shadow .18s,border-color .18s}.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px color-mix(in srgb,var(--text) 8%,transparent);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}.card h3{font-family:var(--display);font-size:20px;font-weight:750;letter-spacing:var(--tracking);margin:18px 0 8px}.card p{color:var(--muted);margin:0}.icon{align-items:center;background:var(--surface-2);border-radius:12px;color:var(--accent);display:flex;font-size:13px;font-weight:850;height:44px;justify-content:center;text-transform:uppercase;width:44px}
.stats{background:var(--text);color:var(--bg)}.stat-grid{display:grid;gap:28px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.stat-value{font-family:var(--display);font-size:clamp(38px,5vw,52px);font-weight:800;letter-spacing:-.03em}.stat-label{color:color-mix(in srgb,var(--bg) 66%,transparent);font-size:13px;font-weight:650;letter-spacing:.04em;margin-top:6px}.testimonial-grid{align-items:center;display:grid;gap:36px;grid-template-columns:minmax(220px,.42fr) minmax(0,1fr)}.testimonial-grid .asset{aspect-ratio:1;min-height:240px}.quote{background:var(--surface-2);border-radius:var(--radius);font-family:var(--display);font-size:clamp(24px,3vw,38px);font-weight:600;letter-spacing:-.02em;line-height:1.3;padding:clamp(30px,6vw,72px)}.attribution{color:var(--muted);font-size:14px;font-weight:600;margin-top:26px}.price{font-family:var(--display);font-size:34px;font-weight:800;letter-spacing:-.03em}.card.highlighted{border-color:var(--accent);box-shadow:0 24px 56px color-mix(in srgb,var(--accent) 15%,transparent)}.features{color:var(--muted);list-style:none;margin:16px 0 0;padding:0}.features li{padding:7px 0 7px 26px;position:relative}.features li:before{color:var(--accent-2);content:"✓";font-weight:800;left:0;position:absolute}.faq-item{border-bottom:1px solid var(--line);padding:26px 0}.faq-item h3{font-family:var(--display);font-size:19px;font-weight:700;margin:0 0 10px}.faq-item p{color:var(--muted);margin:0}.cta{background:var(--text);border-radius:var(--radius);color:var(--bg);overflow:hidden;padding:clamp(40px,7vw,84px);position:relative;text-align:center}.cta .section-title{color:var(--bg)}.cta .section-body{color:color-mix(in srgb,var(--bg) 68%,transparent);margin-left:auto;margin-right:auto}.cta .actions{justify-content:center}.cta .action{background:var(--bg);border-color:var(--bg);color:var(--text)}.cta .action.secondary{background:transparent;color:var(--bg);border-color:color-mix(in srgb,var(--bg) 30%,transparent)}
.content-grid{align-items:center;display:grid;gap:clamp(32px,5vw,64px);grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid.image-right .asset{order:2}.content-grid.text{display:block;max-width:72ch}.site-footer{background:var(--surface);border-top:1px solid var(--line);padding:44px clamp(24px,7vw,110px)}.footer-inner{align-items:center;display:flex;gap:24px;justify-content:space-between;margin:0 auto;max-width:var(--maxw)}.copyright{color:var(--muted);font-size:13px}.footer-links{display:flex;flex-wrap:wrap;gap:4px}
.managed-content{background:var(--surface)}.managed-list{display:grid;gap:18px;margin-top:28px}.managed-entry{border-left:3px solid var(--accent);padding:8px 0 8px 24px}.managed-entry h3{font-family:var(--display);font-size:25px;font-weight:700;letter-spacing:var(--tracking);margin:0 0 8px}.managed-entry p{color:var(--muted);margin:0;white-space:pre-line}.contact-panel,.data-panel{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);display:grid;gap:18px;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:28px;padding:clamp(24px,5vw,48px)}.contact-panel label,.data-panel label{color:var(--muted);display:grid;font-size:13px;font-weight:700;gap:7px}.contact-panel .wide,.data-panel .wide{grid-column:1/-1}.contact-panel input,.contact-panel textarea,.data-panel input,.data-panel textarea,.data-panel select{background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--text);font:inherit;padding:12px 14px}.contact-panel textarea,.data-panel textarea{min-height:150px;resize:vertical}.contact-panel button,.data-panel button{background:var(--accent);border:0;border-radius:var(--radius);color:var(--on-accent);cursor:pointer;font-weight:750;justify-self:start;padding:14px 26px}.contact-honeypot{clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}.data-role{background:color-mix(in srgb,var(--accent) 12%,var(--surface));border-radius:999px;color:var(--accent);display:inline-block;font-size:11px;font-weight:800;margin-top:8px;padding:5px 10px}.checkbox-field{align-items:center!important;display:flex!important;flex-direction:row-reverse;justify-content:flex-end}.checkbox-field input{width:auto}
.product-grid{gap:24px}.product-card{display:flex;flex-direction:column;overflow:hidden;padding:0}.product-media{aspect-ratio:4/5;background:linear-gradient(150deg,var(--surface-2),color-mix(in srgb,var(--accent) 16%,var(--surface)));position:relative}.product-media .asset{aspect-ratio:4/5;border:0;border-radius:0;height:100%;margin:0;min-height:0;width:100%}.product-badge{background:var(--text);border-radius:999px;color:var(--bg);font-size:11px;font-weight:750;left:14px;letter-spacing:.08em;padding:5px 11px;position:absolute;top:14px;z-index:2}.product-info{display:flex;flex-direction:column;gap:4px;padding:20px 22px 24px}.product-sku{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.product-card h3{font-family:var(--display);font-size:18px;font-weight:700;letter-spacing:var(--tracking);margin:6px 0 0}.product-meta{color:var(--muted);font-size:13px;margin:0}.product-price{font-family:var(--display);font-size:21px;font-weight:800;letter-spacing:-.02em;margin-top:10px}.product-stock{font-size:12px;font-weight:750;letter-spacing:.02em;margin:4px 0 0;color:var(--muted)}.product-stock.stock-low{color:var(--accent-2)}.product-stock.stock-out{color:#b91c1c}.appearance-dark .product-stock.stock-out{color:#f87171}.product-add.product-soldout{background:var(--surface-2);border:1px solid var(--line);color:var(--muted);cursor:not-allowed}.product-add.product-soldout:hover{transform:none;box-shadow:none}
.gallery{display:grid;gap:16px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:44px}.gallery-wide{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery-item{margin:0}.gallery-item .asset{aspect-ratio:1;min-height:0;width:100%}.gallery-wide .gallery-item .asset{aspect-ratio:4/3}.gallery-caption{color:var(--muted);font-size:12px;font-weight:600;margin-top:10px}
.cart-toggle{align-items:center;background:var(--text);border:0;border-radius:999px;color:var(--bg);cursor:pointer;display:inline-flex;font-size:13px;font-weight:750;gap:8px;padding:9px 16px}.cart-count{align-items:center;background:var(--bg);border-radius:999px;color:var(--text);display:inline-flex;font-size:11px;font-weight:800;height:20px;justify-content:center;min-width:20px;padding:0 6px}.cart-count[data-empty="true"]{opacity:.55}.product-add{background:var(--accent);border:0;border-radius:var(--radius);color:var(--on-accent);cursor:pointer;font-size:13px;font-weight:750;margin-top:16px;padding:11px 16px;transition:transform .15s,box-shadow .15s}.product-add:hover{transform:translateY(-2px);box-shadow:0 12px 24px color-mix(in srgb,var(--accent) 24%,transparent)}
.cart-drawer{inset:0;position:fixed;visibility:hidden;z-index:20}.cart-drawer[data-cart-open]{visibility:visible}.cart-backdrop{background:color-mix(in srgb,#000 46%,transparent);inset:0;opacity:0;position:absolute;transition:opacity .25s}.cart-drawer[data-cart-open] .cart-backdrop{opacity:1}.cart-panel{background:var(--surface);border-left:1px solid var(--line);bottom:0;box-shadow:-24px 0 60px color-mix(in srgb,#000 24%,transparent);display:flex;flex-direction:column;padding:24px;position:absolute;right:0;top:0;transform:translateX(100%);transition:transform .28s;width:min(420px,92vw)}.cart-drawer[data-cart-open] .cart-panel{transform:none}.cart-head{align-items:center;display:flex;justify-content:space-between;margin-bottom:12px}.cart-head h2{font-family:var(--display);font-size:22px;margin:0}.cart-x{background:none;border:0;color:var(--muted);cursor:pointer;font-size:26px;line-height:1}.cart-empty{color:var(--muted);font-size:14px}.cart-empty[hidden]{display:none}.cart-items{display:flex;flex:1;flex-direction:column;gap:14px;margin:8px 0;overflow:auto}.cart-line{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:12px;padding-bottom:14px}.cart-line-info{flex:1}.cart-line-name{font-weight:700}.cart-line-variant,.cart-line-price{color:var(--muted);font-size:13px}.cart-qty{align-items:center;display:flex;gap:8px}.cart-qty-btn{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;color:var(--text);cursor:pointer;height:28px;width:28px}.cart-qty-num{min-width:18px;text-align:center}.cart-remove{background:none;border:0;color:var(--muted);cursor:pointer;font-size:12px;text-decoration:underline}.cart-foot{align-items:center;display:flex;font-family:var(--display);font-size:18px;font-weight:800;justify-content:space-between;margin:14px 0}.cart-checkout{justify-content:center;width:100%}.cart-checkout-form{display:flex;flex-direction:column;gap:10px}.cart-buyer{display:grid;gap:8px;grid-template-columns:1fr 1fr}.cart-buyer input{background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--text);font:inherit;padding:11px 13px;width:100%}@media(max-width:520px){.cart-buyer{grid-template-columns:1fr}}
@media(max-width:800px){.gallery{grid-template-columns:repeat(2,minmax(0,1fr))}.site-header{align-items:flex-start;flex-direction:column;gap:10px;padding:16px 22px}.nav{max-width:100%;overflow:hidden}.nav-item{padding:6px 8px}.section{padding:64px 22px}.hero{min-height:auto}.hero-grid,.content-grid,.testimonial-grid{grid-template-columns:1fr}.columns-3,.columns-4{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-inner{align-items:flex-start;flex-direction:column}}@media(max-width:520px){.columns-2,.columns-3,.columns-4,.gallery,.gallery-wide{grid-template-columns:1fr}.hero .section-title{font-size:clamp(38px,12vw,52px)}.section-title{font-size:34px}.section-body{font-size:16px}.card{padding:24px}.asset{min-height:220px}.site-header{position:relative}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto}}
`;

const themeClass = {
  appearance: {
    dark: 'appearance-dark',
    light: '',
    system: '',
  },
  density: {
    airy: '',
    balanced: 'density-balanced',
    compact: 'density-compact',
  },
  palette: {
    'forest-sand': 'theme-forest-sand',
    'graphite-amber': 'theme-graphite-amber',
    'indigo-mint': '',
    'navy-cyan': 'theme-navy-cyan',
    'violet-rose': 'theme-violet-rose',
  },
  radius: {
    pill: 'radius-pill',
    rounded: '',
    soft: 'radius-soft',
  },
  typography: {
    editorial: 'font-editorial',
    friendly: 'font-friendly',
    'modern-sans': '',
    technical: 'font-technical',
  },
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface PublishedRenderOptions {
  readonly account?: {
    readonly href: string;
    readonly label: string;
  };
  readonly checkoutAction?: string;
  readonly contactAction?: string;
  readonly pageHref: (pageSlug: string) => string;
  readonly siteSlug?: string;
}

function publishedPageHref(published: PublishedRenderOptions, pageSlug: string): string {
  return published.pageHref(pageSlug);
}

function actionHref(action: WebsiteAction, published: PublishedRenderOptions): string {
  switch (action.target.kind) {
    case 'contact':
      return '#contact';
    case 'page':
      return publishedPageHref(published, action.target.pageSlug);
    case 'section':
      return `#${action.target.sectionId}`;
  }
}

function sectionHasContact(section: WebsiteSection): boolean {
  const isContact = (action: WebsiteAction | undefined) => action?.target.kind === 'contact';
  switch (section.type) {
    case 'hero':
      return isContact(section.primaryAction) || isContact(section.secondaryAction);
    case 'pricing':
      return section.plans.some((plan) => isContact(plan.action));
    case 'cta':
      return isContact(section.action) || isContact(section.secondaryAction);
    case 'footer':
      return section.links.some(isContact);
    case 'content':
    case 'faq':
    case 'feature-grid':
    case 'gallery':
    case 'product-grid':
    case 'stats':
    case 'testimonial':
      return false;
  }
}

function managedContentMarkup(entries: readonly WebsiteContentEntry[]): string {
  if (entries.length === 0) return '';
  return `<section class="managed-content section" id="managed-content"><div class="section-inner"><div class="eyebrow">CMS</div><h2 class="section-title">最新內容</h2><div class="managed-list">${entries
    .map(
      (entry) =>
        `<article class="managed-entry" id="${escapeHtml(entry.contentKey)}"><h3>${escapeHtml(
          entry.title,
        )}</h3><p>${escapeHtml(entry.body)}</p></article>`,
    )
    .join('')}</div></div></section>`;
}

function contactFormMarkup(
  spec: WebsiteSpec,
  pageSlug: string,
  action: string | undefined,
): string {
  if (action === undefined) return '';
  const zh = spec.locale === 'zh-Hant';
  return `<section class="section" id="contact"><div class="section-inner"><div class="eyebrow">${
    zh ? '聯絡我們' : 'Contact'
  }</div><h2 class="section-title">${
    zh ? '留下訊息' : 'Send a message'
  }</h2><p class="section-body">${
    zh
      ? '填寫以下資料，網站管理者會在後台收到訊息。'
      : 'Complete the form and the site owner will receive it in the admin dashboard.'
  }</p><form action="${escapeHtml(
    action,
  )}" class="contact-panel" method="post"><input name="pageSlug" type="hidden" value="${escapeHtml(
    pageSlug,
  )}"><label>${zh ? '姓名' : 'Name'}<input autocomplete="name" maxlength="120" name="name" required></label><label>${
    zh ? '電子郵件' : 'Email'
  }<input autocomplete="email" maxlength="254" name="email" required type="email"></label><label class="wide">${
    zh ? '主旨' : 'Subject'
  }<input maxlength="160" name="subject"></label><label class="wide">${
    zh ? '訊息' : 'Message'
  }<textarea maxlength="2000" minlength="10" name="message" required></textarea></label><label class="contact-honeypot">Website<input autocomplete="off" name="website" tabindex="-1"></label><button type="submit">${
    zh ? '送出訊息' : 'Send message'
  }</button></form></div></section>`;
}

interface PublishedDataForm {
  readonly collection: WebsiteDataCollection;
  readonly form: WebsiteDataForm;
}

function dataFieldMarkup(field: WebsiteDataField, zh: boolean): string {
  const required = field.required ? ' required' : '';
  const name = `field-${field.key}`;
  if (field.type === 'long-text') {
    return `<label class="wide">${escapeHtml(field.label)}<textarea maxlength="8000" name="${escapeHtml(
      name,
    )}"${required}></textarea></label>`;
  }
  if (field.type === 'boolean') {
    return `<label class="checkbox-field">${escapeHtml(
      field.label,
    )}<input name="${escapeHtml(name)}" type="checkbox" value="true"${required}></label>`;
  }
  if (field.type === 'select') {
    return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(
      name,
    )}"${required}><option value="">${zh ? '請選擇' : 'Select'}</option>${field.options
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join('')}</select></label>`;
  }
  if (field.type === 'reference') return '';
  const type = {
    date: 'date',
    email: 'email',
    number: 'number',
    text: 'text',
  }[field.type];
  if (type === undefined) return '';
  const maxLength =
    field.type === 'text' ? ' maxlength="500"' : field.type === 'email' ? ' maxlength="254"' : '';
  return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(name)}" type="${type}"${maxLength}${required}></label>`;
}

function dataFormsMarkup(
  spec: WebsiteSpec,
  pageSlug: string,
  siteSlug: string,
  forms: readonly PublishedDataForm[],
): string {
  if (forms.length === 0) return '';
  const zh = spec.locale === 'zh-Hant';
  return forms
    .map(({ collection, form }) => {
      const fields = form.fieldKeys
        .map((fieldKey) => collection.fields.find((field) => field.key === fieldKey))
        .filter((field): field is WebsiteDataField => field !== undefined);
      if (fields.length !== form.fieldKeys.length) return '';
      return `<section class="section" id="${escapeHtml(
        form.formKey,
      )}"><div class="section-inner"><div class="eyebrow">${
        zh ? '安全表單' : 'Secure form'
      }</div><h2 class="section-title">${escapeHtml(form.title)}</h2>${
        form.requiredRole === null
          ? ''
          : `<span class="data-role">${zh ? '需要角色' : 'Required role'} · ${escapeHtml(
              form.requiredRole,
            )}</span>`
      }<form action="/api/public-sites/${escapeHtml(siteSlug)}/data/${escapeHtml(
        form.formKey,
      )}" class="data-panel" method="post"><input name="idempotencyKey" type="hidden" value="${crypto.randomUUID()}"><input name="pageSlug" type="hidden" value="${escapeHtml(
        pageSlug,
      )}">${fields.map((field) => dataFieldMarkup(field, zh)).join('')}<label class="contact-honeypot">Website<input autocomplete="off" name="website" tabindex="-1"></label><button type="submit">${escapeHtml(
        form.submitLabel,
      )}</button></form></div></section>`;
    })
    .join('');
}

function actionMarkup(
  action: WebsiteAction,
  secondary = false,
  published?: PublishedRenderOptions,
): string {
  const className = `action${secondary ? ' secondary' : ''}`;
  return published === undefined
    ? `<span class="${className}" role="button">${escapeHtml(action.label)}</span>`
    : `<a class="${className}" href="${escapeHtml(actionHref(action, published))}">${escapeHtml(
        action.label,
      )}</a>`;
}

function safeAssetUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith('data:image/png;base64,')) return value;
  if (/^assets\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.png$/u.test(value)) return value;
  if (/^\/api\/public-sites\/[a-z0-9-]+\/assets\/[a-z][a-z0-9-]*$/u.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function assetMarkup(
  assetId: string | undefined,
  spec: WebsiteSpec,
  assetUrls: ReadonlyMap<string, string>,
): string {
  const asset = spec.assets.find((item) => item.id === assetId);
  const label = escapeHtml(asset?.alt ?? spec.name);
  const url = asset?.kind === 'project-asset' ? safeAssetUrl(assetUrls.get(asset.id)) : undefined;
  if (url !== undefined) {
    return `<figure class="asset generated"><img alt="${label}" class="asset-image" decoding="async" src="${escapeHtml(
      url,
    )}"><figcaption class="asset-caption">${label}</figcaption></figure>`;
  }
  return `<div aria-label="${label}" class="asset" role="img"><span class="asset-label">${label}</span></div>`;
}

/** Turn a numeric stock count into a display label and severity level. */
function stockStatus(
  stock: number | undefined,
  zh: boolean,
): { readonly label: string; readonly level: 'in' | 'low' | 'out' } | undefined {
  if (stock === undefined) return undefined;
  if (stock === 0) return { label: zh ? '售完' : 'Sold out', level: 'out' };
  if (stock <= 5) {
    return { label: zh ? `僅剩 ${stock} 件` : `Only ${stock} left`, level: 'low' };
  }
  return { label: zh ? `現貨 ${stock} 件` : `${stock} in stock`, level: 'in' };
}

function sectionMarkup(
  section: WebsiteSection,
  spec: WebsiteSpec,
  assetUrls: ReadonlyMap<string, string>,
  published?: PublishedRenderOptions,
  cartEnabled = false,
): string {
  const id = escapeHtml(section.id);
  const zh = spec.locale === 'zh-Hant';
  switch (section.type) {
    case 'hero': {
      const withImage = section.layout === 'split' || section.layout === 'editorial';
      return `<section class="hero section ${section.layout}" id="${id}"><div class="section-inner ${
        withImage ? 'hero-grid' : ''
      }"><div>${
        section.eyebrow === undefined
          ? ''
          : `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>`
      }<h1 class="section-title">${escapeHtml(section.title)}</h1><p class="section-body">${escapeHtml(
        section.body,
      )}</p><div class="actions">${actionMarkup(section.primaryAction, false, published)}${
        section.secondaryAction === undefined
          ? ''
          : actionMarkup(section.secondaryAction, true, published)
      }</div></div>${withImage ? assetMarkup(section.assetId, spec, assetUrls) : ''}</div></section>`;
    }
    case 'feature-grid':
      return `<section class="section" id="${id}"><div class="section-inner"><div class="feature-head"><h2 class="section-title">${escapeHtml(
        section.title,
      )}</h2>${
        section.body === undefined ? '' : `<p class="section-body">${escapeHtml(section.body)}</p>`
      }</div><div class="grid columns-${section.columns}">${section.items
        .map(
          (item) =>
            `<article class="card"><span class="icon">${escapeHtml(
              item.icon.slice(0, 2),
            )}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`,
        )
        .join('')}</div></div></section>`;
    case 'stats':
      return `<section class="section stats" id="${id}"><div class="section-inner stat-grid">${section.items
        .map(
          (item) =>
            `<div><div class="stat-value">${escapeHtml(item.value)}</div><div class="stat-label">${escapeHtml(
              item.label,
            )}</div></div>`,
        )
        .join('')}</div></section>`;
    case 'testimonial':
      return `<section class="section" id="${id}"><div class="section-inner ${
        section.assetId === undefined ? '' : 'testimonial-grid'
      }">${section.assetId === undefined ? '' : assetMarkup(section.assetId, spec, assetUrls)}<div class="quote">“${escapeHtml(
        section.quote,
      )}”<div class="attribution">${escapeHtml(section.attribution)}${
        section.role === undefined ? '' : ` · ${escapeHtml(section.role)}`
      }</div></div></div></section>`;
    case 'pricing':
      return `<section class="section" id="${id}"><div class="section-inner"><div class="feature-head"><h2 class="section-title">${escapeHtml(
        section.title,
      )}</h2>${
        section.body === undefined ? '' : `<p class="section-body">${escapeHtml(section.body)}</p>`
      }</div><div class="grid columns-${Math.min(section.plans.length, 4)}">${section.plans
        .map(
          (plan) =>
            `<article class="card${plan.highlighted ? ' highlighted' : ''}"><h3>${escapeHtml(
              plan.name,
            )}</h3><div class="price">${escapeHtml(plan.priceLabel)}</div><p>${escapeHtml(
              plan.description,
            )}</p><ul class="features">${plan.features
              .map((feature) => `<li>${escapeHtml(feature)}</li>`)
              .join('')}</ul><div class="actions">${actionMarkup(
              plan.action,
              false,
              published,
            )}</div></article>`,
        )
        .join('')}</div></div></section>`;
    case 'faq':
      return `<section class="section" id="${id}"><div class="section-inner"><h2 class="section-title">${escapeHtml(
        section.title,
      )}</h2>${section.items
        .map(
          (item) =>
            `<article class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(
              item.answer,
            )}</p></article>`,
        )
        .join('')}</div></section>`;
    case 'cta':
      return `<section class="section" id="${id}"><div class="section-inner cta"><h2 class="section-title">${escapeHtml(
        section.title,
      )}</h2><p class="section-body">${escapeHtml(
        section.body,
      )}</p><div class="actions">${actionMarkup(section.action, false, published)}${
        section.secondaryAction === undefined
          ? ''
          : actionMarkup(section.secondaryAction, true, published)
      }</div></div></section>`;
    case 'content':
      return `<section class="section" id="${id}"><div class="section-inner content-grid ${
        section.layout
      }">${
        section.layout === 'text' ? '' : assetMarkup(section.assetId, spec, assetUrls)
      }<div><h2 class="section-title">${escapeHtml(
        section.title,
      )}</h2><p class="section-body">${escapeHtml(section.body)}</p></div></div></section>`;
    case 'product-grid':
      return `<section class="section" id="${id}"><div class="section-inner"><div class="feature-head">${
        section.eyebrow === undefined
          ? ''
          : `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>`
      }<h2 class="section-title">${escapeHtml(section.title)}</h2>${
        section.body === undefined ? '' : `<p class="section-body">${escapeHtml(section.body)}</p>`
      }</div><div class="grid product-grid columns-${section.columns}">${section.items
        .map((item, itemIndex) => {
          const media =
            item.assetId === undefined ? '' : assetMarkup(item.assetId, spec, assetUrls);
          const badge =
            item.badge === undefined
              ? ''
              : `<span class="product-badge">${escapeHtml(item.badge)}</span>`;
          const stock = stockStatus(item.stock, zh);
          const meta =
            item.variant === undefined
              ? ''
              : `<p class="product-meta">${escapeHtml(item.variant)}</p>`;
          const stockLabelText = stock?.label ?? item.availabilityLabel;
          const stockMarkup =
            stockLabelText === undefined
              ? ''
              : `<p class="product-stock${stock === undefined ? '' : ` stock-${stock.level}`}">${escapeHtml(
                  stockLabelText,
                )}</p>`;
          const sku =
            item.sku === undefined
              ? ''
              : `<span class="product-sku">${escapeHtml(item.sku)}</span>`;
          const soldOut = item.stock === 0;
          const addButton = !cartEnabled
            ? ''
            : soldOut
              ? `<span class="product-add product-soldout" aria-disabled="true">${
                  zh ? '售完' : 'Sold out'
                }</span>`
              : `<button class="product-add" data-add-cart data-id="${escapeHtml(
                  item.sku ?? `${section.id}-${itemIndex}`,
                )}" data-name="${escapeHtml(item.name)}" data-price="${
                  item.price ?? ''
                }" data-currency="${escapeHtml(item.currency ?? '')}" data-variant="${escapeHtml(
                  item.variant ?? '',
                )}"${
                  item.stock === undefined ? '' : ` data-stock="${item.stock}"`
                } type="button">${zh ? '加入購物袋' : 'Add to bag'}</button>`;
          return `<article class="card product-card"><div class="product-media">${media}${badge}</div><div class="product-info">${sku}<h3>${escapeHtml(
            item.name,
          )}</h3>${meta}${stockMarkup}<div class="product-price">${escapeHtml(
            item.priceLabel,
          )}</div>${addButton}</div></article>`;
        })
        .join('')}</div></div></section>`;
    case 'gallery':
      return `<section class="section" id="${id}"><div class="section-inner"><div class="feature-head">${
        section.eyebrow === undefined
          ? ''
          : `<div class="eyebrow">${escapeHtml(section.eyebrow)}</div>`
      }<h2 class="section-title">${escapeHtml(section.title)}</h2>${
        section.body === undefined ? '' : `<p class="section-body">${escapeHtml(section.body)}</p>`
      }</div><div class="gallery gallery-${section.layout}">${section.items
        .map(
          (item) =>
            `<figure class="gallery-item">${assetMarkup(item.assetId, spec, assetUrls)}${
              item.caption === undefined
                ? ''
                : `<figcaption class="gallery-caption">${escapeHtml(item.caption)}</figcaption>`
            }</figure>`,
        )
        .join('')}</div></div></section>`;
    case 'footer':
      return `<footer class="site-footer" id="${id}"><div class="footer-inner"><div class="copyright">${escapeHtml(
        section.copyright,
      )}</div><div class="footer-links">${section.links
        .map((link) =>
          published === undefined
            ? `<span class="footer-link">${escapeHtml(link.label)}</span>`
            : `<a class="footer-link" href="${escapeHtml(
                actionHref(link, published),
              )}">${escapeHtml(link.label)}</a>`,
        )
        .join('')}</div></div></footer>`;
  }
}

/** Derive a single currency symbol for the cart from the page's products. */
function cartCurrency(page: WebsiteSpec['pages'][number]): string {
  for (const section of page.sections) {
    if (section.type !== 'product-grid') continue;
    for (const item of section.items) {
      if (item.currency !== undefined) return item.currency;
      const symbol = item.priceLabel.replace(/[\d.,\s].*$/u, '').trim();
      if (symbol.length > 0) return symbol;
    }
  }
  return '';
}

function cartToggleMarkup(zh: boolean): string {
  return `<button class="cart-toggle" data-cart-toggle type="button">${
    zh ? '購物袋' : 'Bag'
  } <span class="cart-count" data-cart-count data-empty="true">0</span></button>`;
}

function cartCheckoutMarkup(
  zh: boolean,
  checkout: { readonly action: string; readonly pageSlug: string } | undefined,
): string {
  if (checkout === undefined) {
    return `<a class="action cart-checkout" href="#contact">${zh ? '前往結帳' : 'Checkout'}</a>`;
  }
  return `<form class="cart-checkout-form" data-cart-checkout-form method="post" action="${escapeHtml(
    checkout.action,
  )}"><input name="pageSlug" type="hidden" value="${escapeHtml(
    checkout.pageSlug,
  )}"><input data-cart-items-json name="items" type="hidden" value=""><label class="contact-honeypot">Website<input autocomplete="off" name="website" tabindex="-1"></label><div class="cart-buyer"><input autocomplete="name" maxlength="120" name="name" placeholder="${
    zh ? '姓名' : 'Name'
  }" required><input autocomplete="email" maxlength="254" name="email" placeholder="Email" required type="email"></div><button class="action cart-checkout" type="submit">${
    zh ? '送出訂單' : 'Place order'
  }</button></form>`;
}

function cartDrawerMarkup(
  spec: WebsiteSpec,
  page: WebsiteSpec['pages'][number],
  checkout?: { readonly action: string; readonly pageSlug: string },
): string {
  const zh = spec.locale === 'zh-Hant';
  return `<div class="cart-drawer" data-cart-root data-cart-key="${escapeHtml(
    spec.name,
  )}" data-cart-currency="${escapeHtml(cartCurrency(page))}" data-cart-remove="${
    zh ? '移除' : 'Remove'
  }" data-cart-order-title="${zh ? '訂單明細' : 'Order'}" data-cart-subtotal-label="${
    zh ? '小計' : 'Subtotal'
  }"><div class="cart-backdrop" data-cart-close></div><aside class="cart-panel" aria-label="${
    zh ? '購物袋' : 'Shopping bag'
  }"><div class="cart-head"><h2>${
    zh ? '購物袋' : 'Your bag'
  }</h2><button class="cart-x" data-cart-close type="button" aria-label="${
    zh ? '關閉' : 'Close'
  }">×</button></div><p class="cart-empty" data-cart-empty>${
    zh ? '購物袋是空的' : 'Your bag is empty.'
  }</p><div class="cart-items" data-cart-items></div><div class="cart-foot"><span>${
    zh ? '小計' : 'Subtotal'
  }</span><span class="cart-subtotal" data-cart-subtotal></span></div>${cartCheckoutMarkup(
    zh,
    checkout,
  )}</aside></div><script>${WEBSITE_CART_SCRIPT}</script>`;
}

function renderWebsiteDocument(
  specValue: WebsiteSpec,
  pageSlug: string,
  assetUrls: ReadonlyMap<string, string>,
  published?: PublishedRenderOptions,
  managedContent: readonly WebsiteContentEntry[] = [],
  dataForms: readonly PublishedDataForm[] = [],
): string {
  const spec = WebsiteSpecSchema.parse(specValue);
  const page = spec.pages.find((item) => item.slug === pageSlug);
  if (page === undefined) throw new Error('Website preview page not found.');
  const hasCart = page.sections.some((section) => section.type === 'product-grid');
  const theme = spec.theme;
  const classes = [
    themeClass.appearance[theme.appearance],
    themeClass.density[theme.density],
    themeClass.palette[theme.palette],
    themeClass.radius[theme.radius],
    themeClass.typography[theme.typography],
  ]
    .filter(Boolean)
    .join(' ');
  return `<!doctype html><html class="${escapeHtml(classes)}" lang="${escapeHtml(
    spec.locale,
  )}"><head><meta charset="utf-8"><meta content="${escapeHtml(
    page.metaDescription,
  )}" name="description"><meta content="${
    published === undefined ? 'noindex,nofollow,noarchive' : 'index,follow'
  }" name="robots"><meta content="width=device-width,initial-scale=1" name="viewport"><title>${escapeHtml(
    page.title,
  )} · ${escapeHtml(spec.name)}</title><style>${PREVIEW_STYLES}</style></head><body><div class="shell"><div class="topbar">${escapeHtml(
    spec.name,
  )}</div><header class="site-header"><div class="brand">${escapeHtml(
    spec.navigation.brandLabel,
  )}</div><nav aria-label="Website preview navigation" class="nav">${spec.navigation.items
    .map((item) =>
      published === undefined
        ? `<span class="nav-item">${escapeHtml(item.label)}</span>`
        : `<a class="nav-item" href="${escapeHtml(
            publishedPageHref(published, item.pageSlug),
          )}">${escapeHtml(item.label)}</a>`,
    )
    .join('')}${
    published?.account === undefined
      ? ''
      : `<a class="nav-item nav-account" href="${escapeHtml(
          published.account.href,
        )}">${escapeHtml(published.account.label)}</a>`
  }${hasCart ? cartToggleMarkup(spec.locale === 'zh-Hant') : ''}</nav></header><main>${page.sections
    .map((section) => sectionMarkup(section, spec, assetUrls, published, hasCart))
    .join('')}${published === undefined ? '' : managedContentMarkup(managedContent)}${
    published?.siteSlug === undefined
      ? ''
      : dataFormsMarkup(spec, pageSlug, published.siteSlug, dataForms)
  }${
    published === undefined || !page.sections.some(sectionHasContact)
      ? ''
      : contactFormMarkup(spec, pageSlug, published.contactAction)
  }</main>${
    hasCart
      ? cartDrawerMarkup(
          spec,
          page,
          published?.checkoutAction === undefined
            ? undefined
            : { action: published.checkoutAction, pageSlug },
        )
      : ''
  }</div></body></html>`;
}

/**
 * Return a spec whose tracked product stock reflects live sales
 * (remaining = published stock − sold). Used only at public render time.
 */
export function applyInventorySold(
  specValue: WebsiteSpec,
  soldBySku: ReadonlyMap<string, number>,
): WebsiteSpec {
  if (soldBySku.size === 0) return specValue;
  const spec = WebsiteSpecSchema.parse(structuredClone(specValue));
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.type !== 'product-grid') continue;
      for (const item of section.items) {
        if (item.sku === undefined || item.stock === undefined) continue;
        item.stock = Math.max(0, item.stock - (soldBySku.get(item.sku) ?? 0));
      }
    }
  }
  return spec;
}

export function renderWebsitePreviewDocument(
  specValue: WebsiteSpec,
  pageSlug: string,
  assetUrls: ReadonlyMap<string, string> = new Map(),
): string {
  return renderWebsiteDocument(specValue, pageSlug, assetUrls);
}

export function renderWebsitePublishedDocument(
  specValue: WebsiteSpec,
  pageSlug: string,
  siteSlug: string,
  assetUrls: ReadonlyMap<string, string> = new Map(),
  routeMode: 'platform-path' | 'site-host' = 'platform-path',
  managedContent: readonly WebsiteContentEntry[] = [],
  account?: { readonly href: string; readonly label: string },
  dataForms: readonly PublishedDataForm[] = [],
): string {
  const published = zSiteSlug(siteSlug);
  return renderWebsiteDocument(
    specValue,
    pageSlug,
    assetUrls,
    {
      ...(account === undefined ? {} : { account }),
      checkoutAction: `/api/public-sites/${published}/checkout`,
      contactAction: `/api/public-sites/${published}/contact`,
      pageHref: (targetPageSlug) =>
        routeMode === 'site-host' ? `/${targetPageSlug}` : `/s/${published}/${targetPageSlug}`,
      siteSlug: published,
    },
    managedContent,
    dataForms,
  );
}

export function websiteStaticPagePath(specValue: WebsiteSpec, pageSlug: string): string {
  const spec = WebsiteSpecSchema.parse(specValue);
  const pageIndex = spec.pages.findIndex((page) => page.slug === pageSlug);
  if (pageIndex < 0) throw new Error('Website export page not found.');
  return pageIndex === 0 ? 'index.html' : `page-${pageSlug}.html`;
}

export function renderWebsiteStaticDocument(
  specValue: WebsiteSpec,
  pageSlug: string,
  assetUrls: ReadonlyMap<string, string> = new Map(),
): string {
  const spec = WebsiteSpecSchema.parse(specValue);
  return renderWebsiteDocument(spec, pageSlug, assetUrls, {
    pageHref: (targetPageSlug) => websiteStaticPagePath(spec, targetPageSlug),
  });
}

function zSiteSlug(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) || value.length > 96) {
    throw new Error('Published website slug is invalid.');
  }
  return value;
}
