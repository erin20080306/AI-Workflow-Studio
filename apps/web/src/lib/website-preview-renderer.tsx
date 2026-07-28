import {
  WebsiteSpecSchema,
  type WebsiteAction,
  type WebsiteSection,
  type WebsiteSpec,
} from '@ai-workflow-studio/website-schema';

const PREVIEW_STYLES = `
:root{color-scheme:light;--bg:#f8fafc;--surface:#fff;--surface-2:#eef2ff;--text:#0f172a;--muted:#5b6b82;--line:#dbe3ee;--accent:#4f46e5;--accent-2:#10b981;--radius:24px;--space:88px;--font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:16px;line-height:1.65}button{font:inherit}
.theme-graphite-amber{--bg:#f7f5f0;--surface:#fff;--surface-2:#fff4cf;--text:#171717;--muted:#625f58;--line:#ded8cc;--accent:#18181b;--accent-2:#d97706}
.theme-navy-cyan{--bg:#061425;--surface:#0d2037;--surface-2:#102d48;--text:#f8fafc;--muted:#a9bdd0;--line:#23405d;--accent:#22d3ee;--accent-2:#38bdf8}
.theme-forest-sand{--bg:#f5f3ea;--surface:#fffcf2;--surface-2:#e4eedc;--text:#173027;--muted:#587064;--line:#ced9ca;--accent:#166534;--accent-2:#ca8a04}
.theme-violet-rose{--bg:#fbf7ff;--surface:#fff;--surface-2:#f4e8ff;--text:#211533;--muted:#6a5879;--line:#e5d8ee;--accent:#7c3aed;--accent-2:#e11d48}
.appearance-dark{--bg:#07101f;--surface:#101c2e;--surface-2:#17253a;--text:#f8fafc;--muted:#a9b6c8;--line:#2a3a50}
.radius-soft{--radius:12px}.radius-pill{--radius:40px}.density-compact{--space:56px}.density-balanced{--space:72px}.font-editorial{--font:Georgia,"Times New Roman",serif}.font-technical{--font:"SFMono-Regular",Consolas,"Liberation Mono",monospace}.font-friendly{--font:ui-rounded,"SF Pro Rounded",system-ui,sans-serif}
.shell{min-height:100vh}.site-header{align-items:center;background:color-mix(in srgb,var(--bg) 88%,transparent);border-bottom:1px solid var(--line);display:flex;gap:28px;justify-content:space-between;padding:20px clamp(24px,5vw,76px);position:sticky;top:0;z-index:5;backdrop-filter:blur(14px)}.brand{font-size:18px;font-weight:850;letter-spacing:-.02em}.nav{display:flex;flex-wrap:wrap;gap:8px}.nav-item,.footer-link{color:var(--muted);font-size:13px;font-weight:700;padding:8px 12px;text-decoration:none}
main{overflow:hidden}.section{padding:var(--space) clamp(24px,7vw,110px)}.section-inner{margin:0 auto;max-width:1180px}.eyebrow{color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.section-title{font-size:clamp(30px,5vw,58px);letter-spacing:-.045em;line-height:1.04;margin:14px 0}.section-body{color:var(--muted);font-size:18px;max-width:720px;white-space:pre-line}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.action{align-items:center;background:var(--accent);border:1px solid var(--accent);border-radius:999px;color:#fff;display:inline-flex;font-size:14px;font-weight:850;justify-content:center;padding:12px 20px}.action.secondary{background:transparent;color:var(--text)}
	.hero{min-height:560px;display:grid;align-items:center}.hero-grid{align-items:center;display:grid;gap:52px;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr)}.hero.centered{text-align:center}.hero.centered .section-body,.hero.centered .actions{justify-content:center;margin-left:auto;margin-right:auto}.asset{align-items:flex-end;aspect-ratio:4/3;background:linear-gradient(145deg,var(--surface-2),color-mix(in srgb,var(--accent) 24%,var(--surface)));border:1px solid var(--line);border-radius:var(--radius);display:flex;margin:0;min-height:260px;overflow:hidden;padding:24px;position:relative}.asset:before,.asset:after{border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:50%;content:"";height:220px;position:absolute;right:-45px;top:-40px;width:220px}.asset:after{height:120px;left:35px;right:auto;top:55px;width:120px}.asset.generated{padding:0}.asset.generated:before,.asset.generated:after{display:none}.asset-image{height:100%;inset:0;object-fit:cover;position:absolute;width:100%}.asset-caption{clip:rect(0 0 0 0);clip-path:inset(50%);height:1px;overflow:hidden;position:absolute;white-space:nowrap;width:1px}.asset-label{background:color-mix(in srgb,var(--surface) 88%,transparent);border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12px;font-weight:750;padding:8px 12px;position:relative;z-index:1}
.feature-head{text-align:center}.feature-head .section-body{margin-left:auto;margin-right:auto}.grid{display:grid;gap:18px;margin-top:38px}.columns-2{grid-template-columns:repeat(2,minmax(0,1fr))}.columns-3{grid-template-columns:repeat(3,minmax(0,1fr))}.columns-4{grid-template-columns:repeat(4,minmax(0,1fr))}.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px}.card h3{font-size:19px;letter-spacing:-.02em;margin:18px 0 8px}.card p{color:var(--muted);margin:0}.icon{align-items:center;background:var(--surface-2);border-radius:14px;color:var(--accent);display:flex;font-size:13px;font-weight:900;height:42px;justify-content:center;text-transform:uppercase;width:42px}
	.stats{background:var(--text);color:var(--bg)}.stat-grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}.stat-value{font-size:42px;font-weight:900;letter-spacing:-.04em}.stat-label{color:color-mix(in srgb,var(--bg) 70%,transparent);font-size:13px;font-weight:700}.testimonial-grid{align-items:center;display:grid;gap:28px;grid-template-columns:minmax(220px,.4fr) minmax(0,1fr)}.testimonial-grid .asset{aspect-ratio:1;min-height:220px}.quote{background:var(--surface-2);border-radius:var(--radius);font-size:clamp(24px,3vw,40px);font-weight:750;letter-spacing:-.03em;padding:clamp(28px,6vw,72px)}.attribution{color:var(--muted);font-size:14px;margin-top:24px}.price{font-size:32px;font-weight:900;letter-spacing:-.04em}.card.highlighted{border-color:var(--accent);box-shadow:0 20px 50px color-mix(in srgb,var(--accent) 13%,transparent);transform:translateY(-8px)}.features{color:var(--muted);padding-left:20px}.faq-item{border-bottom:1px solid var(--line);padding:22px 0}.faq-item h3{font-size:18px;margin:0 0 8px}.faq-item p{color:var(--muted);margin:0}.cta{background:var(--text);border-radius:var(--radius);color:var(--bg);padding:clamp(32px,6vw,70px);text-align:center}.cta .section-body{color:color-mix(in srgb,var(--bg) 70%,transparent);margin-left:auto;margin-right:auto}.cta .actions{justify-content:center}.cta .action{background:var(--bg);border-color:var(--bg);color:var(--text)}.cta .action.secondary{background:transparent;color:var(--bg)}
.content-grid{align-items:center;display:grid;gap:44px;grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid.image-right .asset{order:2}.content-grid.text{display:block}.site-footer{background:var(--surface);border-top:1px solid var(--line);padding:34px clamp(24px,7vw,110px)}.footer-inner{align-items:center;display:flex;gap:24px;justify-content:space-between;margin:0 auto;max-width:1180px}.copyright{color:var(--muted);font-size:13px}.footer-links{display:flex;flex-wrap:wrap;gap:4px}
	@media(max-width:800px){.site-header{align-items:flex-start;flex-direction:column;gap:10px;padding:16px 22px}.nav{max-width:100%;overflow:hidden}.nav-item{padding:6px 8px}.section{padding:56px 22px}.hero{min-height:auto}.hero-grid,.content-grid,.testimonial-grid{grid-template-columns:1fr}.columns-3,.columns-4{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-inner{align-items:flex-start;flex-direction:column}}@media(max-width:520px){.columns-2,.columns-3,.columns-4{grid-template-columns:1fr}.section-title{font-size:39px}.section-body{font-size:16px}.card{padding:22px}.asset{min-height:210px}.site-header{position:relative}}
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
  readonly pageHref: (pageSlug: string) => string;
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

function sectionMarkup(
  section: WebsiteSection,
  spec: WebsiteSpec,
  assetUrls: ReadonlyMap<string, string>,
  published?: PublishedRenderOptions,
): string {
  const id = escapeHtml(section.id);
  switch (section.type) {
    case 'hero':
      return `<section class="hero section ${section.layout}" id="${id}"><div class="section-inner ${
        section.layout === 'split' ? 'hero-grid' : ''
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
      }</div></div>${
        section.layout === 'split' ? assetMarkup(section.assetId, spec, assetUrls) : ''
      }</div></section>`;
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

function renderWebsiteDocument(
  specValue: WebsiteSpec,
  pageSlug: string,
  assetUrls: ReadonlyMap<string, string>,
  published?: PublishedRenderOptions,
): string {
  const spec = WebsiteSpecSchema.parse(specValue);
  const page = spec.pages.find((item) => item.slug === pageSlug);
  if (page === undefined) throw new Error('Website preview page not found.');
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
  )} · ${escapeHtml(spec.name)}</title><style>${PREVIEW_STYLES}</style></head><body><div class="shell"><header class="site-header"><div class="brand">${escapeHtml(
    spec.navigation.brandLabel,
  )}</div><nav aria-label="Website preview navigation" class="nav">${spec.navigation.items
    .map((item) =>
      published === undefined
        ? `<span class="nav-item">${escapeHtml(item.label)}</span>`
        : `<a class="nav-item" href="${escapeHtml(
            publishedPageHref(published, item.pageSlug),
          )}">${escapeHtml(item.label)}</a>`,
    )
    .join('')}</nav></header><main>${page.sections
    .map((section) => sectionMarkup(section, spec, assetUrls, published))
    .join('')}</main></div></body></html>`;
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
): string {
  const published = zSiteSlug(siteSlug);
  return renderWebsiteDocument(specValue, pageSlug, assetUrls, {
    pageHref: (targetPageSlug) =>
      routeMode === 'site-host' ? `/${targetPageSlug}` : `/s/${published}/${targetPageSlug}`,
  });
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
