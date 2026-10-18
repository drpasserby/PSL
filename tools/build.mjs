#!/usr/bin/env node
// tools/build.mjs — 从 content/*.md 生成整站静态页
//
// 设计约束（与重构方案一致）：
//   1. 条款正文只来自 content/，本脚本不做任何改写、润色、翻译；
//   2. 输出是纯静态 HTML，零运行时依赖（没有 Vue，没有 CDN）；
//   3. 所有链接用相对路径，可部署在域名根或任意子目录（含 GitHub Pages 子路径）；
//   4. 同一套模板渲染全部页面，避免 12 份 HTML 各自漂移。
//
// 用法：node tools/build.mjs

import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TYPES, LOCALES, DEFAULT_LOCALE, ORIGIN, HOME_URL, OUT_DIR, LEGACY_MAP,
} from "./site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, OUT_DIR);
const rel = (depth) => (depth ? "../".repeat(depth) : "");
const url = (path) => (ORIGIN ? `${ORIGIN.replace(/\/+$/, "")}/${path}` : path);

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 正文是否已是日文：出现假名即视为日文译本，否则视为原文照录 */
const hasKana = (text) => /[\u3041-\u30ff]/.test(text);

/* ---------- 正文解析：content/<type>.<locale>.md ---------- */

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * 文件格式（由 tools/extract.mjs 生成，人工增补也必须遵守）：
 *   # 标题
 *   版本行
 *   ## 小节标题
 *   段落（段落之间空一行）
 */
function parseClause(md) {
  const title = [];
  let version = "";
  const sections = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    const body = buffer.join("\n\n").trim();
    if (body) sections.push({ heading: current, paragraphs: body.split(/\n{2,}/) });
    current = null;
    buffer = [];
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      flush();
      current = line.slice(3).trim();
      continue;
    }
    if (line.startsWith("# ") && !title.length && !sections.length && !version) {
      title.push(line.slice(2).trim());
      continue;
    }
    if (!current && !version && /Protect Shield License/i.test(line)) {
      version = line;
      continue;
    }
    if (!current) continue;
    buffer.push(line);
  }
  flush();

  return { title: title[0] || "", version, sections };
}

/* ---------- 站点数据 ---------- */

const strings = {};
for (const locale of LOCALES) {
  const raw = await readText(join(root, "content", `site.${locale}.json`));
  if (!raw) throw new Error(`缺少界面文案：content/site.${locale}.json`);
  strings[locale] = JSON.parse(raw);
}

/** clauses[locale][type] = { title, version, sections } */
const clauses = {};
for (const locale of LOCALES) {
  clauses[locale] = {};
  for (const type of TYPES) {
    const raw = await readText(join(root, "content", `${type.key}.${locale}.md`));
    clauses[locale][type.key] = raw === null ? null : parseClause(raw);
  }
}

/** 目录里的类型名：按语言取 */
const typeName = (type, locale) => {
  if (locale === "zh-CN") return type.zh;
  if (locale === "ja-JP") return type.ja;
  return type.en;
};

/** 类型名与英文名重复时（英文界面 Video · Video），只留一个 */
const typeLabel = (type, locale) =>
  typeName(type, locale).toLowerCase() === type.latin.toLowerCase()
    ? type.latin
    : `${typeName(type, locale)} \u00b7 ${type.latin}`;

/** 某类型在默认语言（缺失则任一语言）下的版本号，用于目录 */
const versionOf = (typeKey) => {
  for (const locale of [DEFAULT_LOCALE, ...LOCALES]) {
    const c = clauses[locale]?.[typeKey];
    if (c?.version) return c.version.replace(/^.*?(\d+\.\d+)$/, "$1");
  }
  return "";
};

/* ---------- 模板片段 ---------- */

function head({ locale, title, description, depth, alternates, type = "article" }) {
  const s = strings[locale];
  const r = rel(depth);
  const links = alternates
    .map((a) => `  <link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(url(a.path))}">`)
    .join("\n");
  const ogImage = ORIGIN
    ? `\n  <meta property="og:image" content="${esc(url("assets/psl.png"))}">`
    : "";

  return `<!DOCTYPE html>
<html lang="${esc(s.htmlLang)}" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="${esc(type)}">
  <meta property="og:site_name" content="${esc(s.brand)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">${ogImage}
${links}
  <link rel="stylesheet" href="${r}css/wabisabi.css">
</head>`;
}

function masthead(locale, depth, { home = null, current = null, alternates = null } = {}) {
  const s = strings[locale];
  const r = rel(depth);
  const langLinks = LOCALES.map((other) => {
    const href = other === locale
      ? current || `${r}${locale}/index.html`
      : alternates?.[other] || `${r}${other}/index.html`;
    const attr = other === locale ? ' aria-current="true"' : "";
    return `      <a href="${esc(href)}" hreflang="${esc(other)}" lang="${esc(strings[other].htmlLang)}"${attr}>${esc(strings[other].name)}</a>`;
  }).join("\n");

  const brandInner = `${esc(s.brand)}<span class="brand-sub">${esc(s.brandSub)}</span>`;
  const brand = home
    ? `<a class="brand" href="${esc(home)}">${brandInner}</a>`
    : `<p class="brand">${brandInner}</p>`;
  const back = home ? `\n    <a class="plain-link" href="${esc(home)}">${esc(s.home)}</a>` : "";

  return `  <header class="masthead">
    ${brand}
    <span class="masthead-spacer"></span>${back}
    <nav class="switch" aria-label="${esc(s.switchLabel)}">
      <span class="switch-label">${esc(s.switchLabel)}</span>
${langLinks}
    </nav>
  </header>`;
}

const skipLink = (locale) => `  <a class="skip" href="#main">${esc(strings[locale].skip)}</a>`;

function foot(locale, depth) {
  const s = strings[locale];
  const r = rel(depth);
  return `  <footer class="pagefoot">
    <a href="${esc(HOME_URL)}" rel="noopener">wulvxinchen.cn</a>
    <a href="${r}index.html">${esc(s.home)}</a>
    <span class="foot-note">${esc(s.footNote)}</span>
  </footer>`;
}

const script = `  <script>
  (function () {
    document.documentElement.className = document.documentElement.className.replace(/\\bno-js\\b/, "js");
    var buttons = document.querySelectorAll("[data-copy]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-copy");
        var original = button.textContent;
        var done = button.getAttribute("data-copy-done") || original;
        fetch(target)
          .then(function (response) {
            if (!response.ok) throw new Error("HTTP " + response.status);
            return response.text();
          })
          .then(function (text) { return navigator.clipboard.writeText(text); })
          .then(function () {
            button.textContent = done;
            button.disabled = true;
            setTimeout(function () {
              button.textContent = original;
              button.disabled = false;
            }, 2000);
          })
          .catch(function () { window.location.href = target; });
      });
    });
  })();
  </script>`;

/* ---------- 目录页 ---------- */

function indexPage(locale, depth) {
  const s = strings[locale];
  const r = rel(depth);
  const title = `${s.brand} \u00b7 ${s.brandSub}`;
  const alternates = LOCALES.map((other) => ({ hreflang: other, path: `${r}${other}/index.html` }));
  alternates.push({ hreflang: "x-default", path: `${r}${DEFAULT_LOCALE}/index.html` });

  const entries = TYPES.map((type, i) => {
    const data = clauses[locale][type.key];
    const count = data?.sections.length ?? 0;
    const version = versionOf(type.key);
    const bodyText = data?.sections.flatMap((section) => section.paragraphs).join(" ") ?? "";
    // 日文版可能只有部分类型有译本：有假名标「校正中」，否则标「英語原文」。
    const note =
      count && locale === "ja-JP"
        ? `<span class="is-note">${esc(hasKana(bodyText) ? s.statusInReview : s.statusOriginal)}</span>`
        : "";
    // 没有正文的类型不给链接：宁可不可点，也不指向一个空壳页面
    const tag = count ? "a" : "span";
    const attrs = count
      ? ` class="entry" href="${esc(r)}${esc(locale)}/${esc(type.key)}.html"`
      : ` class="entry entry--todo"`;
    const mark = count
      ? `${count} ${esc(s.sectionUnit)}${note} <span class="arrow">\u2192</span>`
      : `<span class="is-todo">${esc(s.statusTodo)}</span>`;
    // 英文界面里类型名与英文名相同，副标题只留版本号，避免「Video / Video · 1.1」
    const latinLine =
      typeLabel(type, locale) === type.latin
        ? version
        : `${type.latin}${version ? ` \u00b7 ${version}` : ""}`;
    return `      <${tag}${attrs}>
        <span class="entry-no">${String(i + 1).padStart(2, "0")}</span>
        <span class="entry-name">${esc(typeName(type, locale))}<span class="entry-latin">${esc(latinLine)}</span></span>
        <span class="entry-mark">${mark}</span>
      </${tag}>`;
  }).join("\n");

  return `${head({ locale, title, description: s.metaDescription, depth, alternates, type: "website" })}
<body>
${skipLink(locale)}
${masthead(locale, depth)}
  <main id="main" class="shell">
    <section class="lede">
      <h1 class="lede-title">${esc(s.ledeTitle)}</h1>
      <p class="lede-sub">${esc(s.ledeSub)}</p>
      <p class="lede-quote">${esc(s.ledeQuote)}</p>
    </section>
    <section class="catalog">
      <h2 class="catalog-head">${esc(s.catalogHead)}</h2>
${entries}
    </section>
  </main>
${foot(locale, depth)}
${script}
</body>
</html>
`;
}

/* ---------- 条款页 ---------- */

function clausePage(locale, type) {
  const s = strings[locale];
  const data = clauses[locale][type.key];
  const depth = 1;
  // 只对真实存在的译本声明 hreflang，避免指向未生成的页面
  const alternates = LOCALES.filter((other) => clauses[other][type.key]).map((other) => ({
    hreflang: other,
    path: `${rel(depth)}${other}/${type.key}.html`,
  }));
  if (clauses[DEFAULT_LOCALE][type.key]) {
    alternates.push({ hreflang: "x-default", path: `${rel(depth)}${DEFAULT_LOCALE}/${type.key}.html` });
  }

  const h1 = data?.title || typeName(type, locale);
  const version = data?.version || "";
  // 英文标题本身就是版本行的主干，别在 <title> 里写成「A · A 1.1」
  const redundantTitle = Boolean(version) && version.startsWith(h1);
  const heading = redundantTitle ? version : `${h1}${version ? ` \u00b7 ${version}` : ""}`;
  const pageTitle = `${heading} \u00b7 ${s.brand}`;
  const description = `${redundantTitle ? version : `${h1}${version ? `\uff08${version}\uff09` : ""}`} \u2014 ${s.metaDescription}`;
  // 日文版可能只有部分类型有译本；提示语按实际内容给出，不把英文原文标成「日本語」。
  const bodyText = data?.sections.flatMap((section) => section.paragraphs).join(" ") ?? "";
  const isEnglishOriginal = locale === "ja-JP" && Boolean(bodyText) && !hasKana(bodyText);
  const bannerText =
    locale === "ja-JP" && s.status === "draft"
      ? hasKana(bodyText)
        ? s.draftBannerInReview
        : s.draftBannerNotTranslated
      : "";
  const banner = bannerText
    ? `\n      <p class="draft-banner">${esc(bannerText)}</p>`
    : "";
  // 日文页里照录的英文原文按 en 排版，否则会套用日文字体与字距
  const articleLang = isEnglishOriginal ? ' lang="en"' : "";

  const clausesHtml = data?.sections.length
    ? data.sections
        .map((section, i) => `        <section class="clause">
          <header class="clause-head">
            <span class="clause-no">${String(i + 1).padStart(2, "0")}</span>
            <h2 class="clause-title">${esc(section.heading)}</h2>
          </header>
          <div class="clause-body">
${section.paragraphs.map((p) => `            <p>${esc(p)}</p>`).join("\n")}
          </div>
        </section>`)
        .join("\n")
    : `        <section class="clause">
          <header class="clause-head">
            <span class="clause-no">\u2014</span>
            <h2 class="clause-title">${esc(s.notDraftedTitle)}</h2>
          </header>
          <div class="clause-body">
            <p>${esc(s.notDraftedBody)}</p>
          </div>
        </section>`;

  const cite = s.citeTemplate
    .replace("{title}", h1)
    .replace("{version}", version);
  const plain = `../plain/${locale}/${type.key}.txt`;
  // 没有正文时不给引用块：连「可复制全文」都不提供，才符合「尚无可引用文本」的说法
  const hasBody = Boolean(data?.sections.length);
  const colophon = hasBody
    ? `
        <aside class="colophon">
          <h2 class="colophon-title">${esc(s.colophonTitle)}</h2>
          <p class="colophon-note">${esc(s.colophonNote)}</p>
          <p class="cite">${esc(cite)}</p>
          <div class="actions">
            <button class="btn js-only" type="button" data-copy="${esc(plain)}" data-copy-done="${esc(s.citeFullDone)}">${esc(s.citeFull)}</button>
            <a class="plain-link" href="${esc(plain)}">${esc(s.plainLink)}</a>
          </div>
        </aside>`
    : "";

  return `${head({ locale, title: pageTitle, description, depth, alternates })}
<body>
${skipLink(locale)}
${masthead(locale, depth, {
  home: "../index.html",
  current: `../${locale}/${type.key}.html`,
  // 该类型在某语言下还没写正文时，语言切换落到那门语言的目录页，避免死链
  alternates: Object.fromEntries(LOCALES.map((other) => [
    other,
    clauses[other][type.key] ? `../${other}/${type.key}.html` : `../${other}/index.html`,
  ])),
})}
  <main id="main" class="shell">${banner}
    <article class="sheet"${articleLang}>
      <div>
        <p class="eyebrow">${esc(typeLabel(type, locale))}</p>
        <h1 class="license-title">${esc(h1)}</h1>
        ${version ? `<p class="license-id">${esc(version)}</p>` : ""}
        <hr class="rule-soft">
${clausesHtml}${colophon}
        <p class="actions"><a class="back" href="../index.html">\u2190 ${esc(s.back)}</a></p>
      </div>
      <aside class="spine" aria-hidden="true">
        <span class="spine-text">${esc(h1)}</span>
        <span class="seal">${esc(s.seal)}</span>
      </aside>
    </article>
  </main>
${foot(locale, depth)}
${script}
</body>
</html>
`;
}

/* ---------- 跳转壳 / 404 / 站点文件 ---------- */

function redirectPage(locale, typeKey, label) {
  const s = strings[locale];
  const target = `${DEFAULT_LOCALE}/${typeKey}.html`;
  const alternates = Object.fromEntries(LOCALES.map((other) => [
    other,
    clauses[other][typeKey] ? `${other}/${typeKey}.html` : `${other}/index.html`,
  ]));
  return `<!DOCTYPE html>
<html lang="${esc(s.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=./${esc(target)}">
  <link rel="canonical" href="${esc(url(target))}">
  <title>${esc(label)} \u00b7 ${esc(s.brand)}</title>
  <link rel="stylesheet" href="css/wabisabi.css">
</head>
<body>
${masthead(locale, 0, {
  home: "index.html",
  current: target,
  alternates,
})}
  <div class="moved">
    <p>此地址已迁移到新结构</p>
    <p><a href="./${esc(target)}">${esc(label)}</a></p>
  </div>
</body>
</html>
`;
}

function notFoundPage() {
  const s = strings[DEFAULT_LOCALE];
  return `<!DOCTYPE html>
<html lang="${esc(s.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 \u00b7 ${esc(s.brand)}</title>
  <link rel="stylesheet" href="css/wabisabi.css">
</head>
<body>
${masthead(DEFAULT_LOCALE, 0, {
  current: `${DEFAULT_LOCALE}/index.html`,
})}
  <div class="moved">
    <p>404 · 没有这个页面 / Page not found</p>
    <p><a href="./index.html">${esc(s.home)}</a></p>
  </div>
</body>
</html>
`;
}

/* ---------- 构建 ---------- */

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "css"), { recursive: true });
await mkdir(join(out, "assets"), { recursive: true });

for (const locale of LOCALES) {
  await mkdir(join(out, locale), { recursive: true });
  await mkdir(join(out, "plain", locale), { recursive: true });
}

await copyFile(join(root, "src", "styles", "wabisabi.css"), join(out, "css", "wabisabi.css"));
await copyFile(join(root, "assets", "psl.png"), join(out, "assets", "psl.png"));
await copyFile(join(root, "assets", "grain.svg"), join(out, "assets", "grain.svg"));
await writeFile(join(out, ".nojekyll"), "", "utf8");

const written = [];
const write = async (path, content) => {
  await writeFile(join(out, path), content, "utf8");
  written.push(path);
};

for (const locale of LOCALES) {
  await write(join(locale, "index.html"), indexPage(locale, 1));
  for (const type of TYPES) {
    if (!clauses[locale][type.key]) continue;
    await write(join(locale, `${type.key}.html`), clausePage(locale, type));
    await copyFile(
      join(root, "content", `${type.key}.${locale}.md`),
      join(out, "plain", locale, `${type.key}.txt`),
    );
    written.push(join("plain", locale, `${type.key}.txt`));
  }
}

// 站点根：默认语言的目录页，访问域名直接可用
await write("index.html", indexPage(DEFAULT_LOCALE, 0));

for (const [legacy, typeKey] of Object.entries(LEGACY_MAP)) {
  const type = TYPES.find((t) => t.key === typeKey);
  await write(legacy, redirectPage(DEFAULT_LOCALE, typeKey, `${type.zh}叠甲`));
}

await write("404.html", notFoundPage());

if (ORIGIN) {
  const urls = [];
  for (const locale of LOCALES) {
    urls.push(`${locale}/index.html`);
    for (const type of TYPES) {
      if (clauses[locale][type.key]) urls.push(`${locale}/${type.key}.html`);
    }
  }
  const body = urls
    .map((p) => `  <url><loc>${esc(url(p))}</loc></url>`)
    .join("\n");
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`);
  await write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${url("sitemap.xml")}\n`);
}

const missing = LOCALES.map((locale) =>
  TYPES.filter((type) => !clauses[locale][type.key]).map((type) => `${type.key}.${locale}`),
).flat();

console.log(`生成了 ${written.length} 个页面到 ${OUT_DIR}/`);
console.log(`  条款：${LOCALES.map((l) => `${l} ${TYPES.filter((t) => clauses[l][t.key]).length}/${TYPES.length}`).join("  ")}`);
if (missing.length) {
  console.log(`  缺正文（页面不生成，目录标注为待补充）：${missing.join(", ")}`);
}
console.log(ORIGIN ? `  sitemap/robots 使用绝对地址 ${ORIGIN}` : "  未配置 ORIGIN：使用相对链接，不生成 sitemap/robots");
