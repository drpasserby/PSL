#!/usr/bin/env node
// tools/check.mjs — 重构后的防漂移校验
//
// 两级结果：
//   错误（exit 1）— 结构性问题：条款数不一致、版本不一致、界面 key 缺失、
//                  构建产物缺失 / lang 错 / hreflang 不全 / 模板残留。
//   警告（exit 0）— 内容体检：重复标题、类型指代词不符、英文动作词跨类型。
//                  这类文本来自旧站，按"内容文本不变"原样保留；
//                  加 --strict 可把警告也当作失败，用于修完文案后的 CI 收口。
//
// 用法：node tools/check.mjs [--strict]

import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { TYPES, LOCALES, DEFAULT_LOCALE, OUT_DIR } from "./site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const infos = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const info = (msg) => infos.push(msg);

const readText = async (file) => {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
};

/** 解析正文，同时记录小节标题所在行号，便于报告定位 */
function parseClause(md) {
  const sections = [];
  let version = "";
  let versionLine = 0;
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    const body = buffer.join("\n\n").trim();
    if (body) sections.push({ heading: current.heading, line: current.line, paragraphs: body.split(/\n{2,}/) });
    current = null;
    buffer = [];
  };

  md.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith("## ")) {
      flush();
      current = { heading: line.slice(3).trim(), line: index + 1 };
      return;
    }
    if (line.startsWith("# ") && !sections.length && !version) return;
    if (!current && !version && /Protect Shield License/i.test(line)) {
      version = line;
      versionLine = index + 1;
      return;
    }
    if (!current) return;
    buffer.push(line);
  });
  flush();
  return { version, versionLine, sections };
}

/** 在文本里找关键词首次出现的行号 */
const lineOf = (text, re) => {
  const m = re.exec(text);
  if (!m) return 0;
  return text.slice(0, m.index).split(/\r?\n/).length;
};

/** 与 build.mjs 的 esc() 互逆 */
const unescapeHtml = (s) =>
  s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

const escHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const truncate = (s, n = 40) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

/** 顺序比对两组文本，返回第一处差异（用于证明重构没有改动一字） */
const diffAt = (got, want) => {
  const length = Math.max(got.length, want.length);
  let first = -1;
  let count = 0;
  for (let i = 0; i < length; i += 1) {
    if (got[i] !== want[i]) {
      count += 1;
      if (first < 0) first = i;
    }
  }
  if (first < 0) return null;
  return {
    index: first,
    count,
    got: typeof got[first] === "string" ? got[first] : "（缺失）",
    want: typeof want[first] === "string" ? want[first] : "（多出）",
  };
};

/* ---------- 已知文字问题（内容保持原样，等你确认后再改） ---------- */

const KNOWN_ISSUES = [
  {
    id: "video.zh-CN-pronoun",
    file: "content/video.zh-CN.md",
    test: (text) => /本音频/.test(text),
    detail: "视频条款正文写的是“本音频”（旧 PSLV.md 遗留）",
  },
  {
    id: "essay.en-US-verb",
    file: "content/essay.en-US.md",
    test: (text) => /\blisten(ing|er)?\b/i.test(text),
    detail: "Essay 英文版用了 listening 措辞（旧 en-US/PSLE.html 从 Audio 复制）",
  },
];

const knownIssues = KNOWN_ISSUES.map((issue) => ({ ...issue, hit: false }));

/* ---------- 读取正文 ---------- */

const clauses = {};
for (const locale of LOCALES) {
  clauses[locale] = {};
  for (const type of TYPES) {
    const relPath = `content/${type.key}.${locale}.md`;
    const md = await readText(join(root, relPath));
    if (md === null) continue;
    clauses[locale][type.key] = { ...parseClause(md), relPath, raw: md };
  }
}

/* ---------- 结构校验（错误） ---------- */

for (const type of TYPES) {
  const counts = LOCALES
    .filter((locale) => clauses[locale][type.key]?.sections.length)
    .map((locale) => ({ locale, n: clauses[locale][type.key].sections.length }));
  if (counts.length > 1 && new Set(counts.map((c) => c.n)).size > 1) {
    fail(`${type.key}：各语言条款数不一致 → ${counts.map((c) => `${c.locale} ${c.n}`).join(" / ")}`);
  }

  const versions = LOCALES
    .map((locale) => clauses[locale][type.key]?.version)
    .filter(Boolean)
    .map((version) => version.match(/(\d+\.\d+)\s*$/)?.[1])
    .filter(Boolean);
  if (new Set(versions).size > 1) {
    fail(`${type.key}：版本号不一致 → ${[...new Set(versions)].join(" / ")}`);
  }
}

const strings = {};
for (const locale of LOCALES) {
  const raw = await readText(join(root, "content", `site.${locale}.json`));
  if (raw === null) {
    fail(`缺少 content/site.${locale}.json`);
    continue;
  }
  strings[locale] = JSON.parse(raw);
}
const localeKeys = Object.keys(strings);
if (localeKeys.length > 1) {
  const union = new Set(localeKeys.flatMap((locale) => Object.keys(strings[locale])));
  for (const key of union) {
    const missing = localeKeys.filter((locale) => !(key in strings[locale]));
    if (missing.length) fail(`site.*.json 缺少 key "${key}"：${missing.join(", ")}`);
  }
}

/* ---------- 内容体检（警告） ---------- */

const knownFor = (file, text) => {
  const issue = knownIssues.find((k) => k.file === file && k.test(text));
  if (issue) issue.hit = true;
  return issue;
};

for (const locale of LOCALES) {
  for (const type of TYPES) {
    const data = clauses[locale][type.key];
    if (!data) continue;

    // 重复小节标题：旧站真实发生过（12 份模板各自漂移）
    const seen = new Map();
    for (const section of data.sections) {
      if (seen.has(section.heading)) {
        warn(`${data.relPath}:${section.line} 小节标题重复「${section.heading}」（首次在第 ${seen.get(section.heading)} 行）`);
      } else {
        seen.set(section.heading, section.line);
      }
    }

    // 中文类型指代词
    if (locale === "zh-CN") {
      const allowed = { essay: ["本文", "本文章"], video: ["本视频"], picture: ["本图片"], audio: ["本音频"] }[type.key];
      for (const [word] of data.raw.matchAll(/本(文章|视频|图片|音频)/g)) {
        if (allowed.includes(word)) continue;
        const line = lineOf(data.raw, new RegExp(word));
        const known = knownFor(data.relPath, data.raw);
        warn(`${data.relPath}:${line} 出现「${word}」，${type.key} 应为「${allowed[0]}」${known ? `  [已知：${known.detail}]` : "  [待确认]"}`);
      }
    }

    // 中文动作词：音频条款里出现"观看"这类画面动作词
    if (locale === "zh-CN" && type.key === "audio") {
      const re = /观看|收看|浏览/;
      if (re.test(data.raw)) {
        const line = lineOf(data.raw, re);
        const known = knownFor(data.relPath, data.raw);
        warn(`${data.relPath}:${line} 出现画面动作词「${re.exec(data.raw)[0]}」，${type.key} 应为「倾听/收听」${known ? `  [已知：${known.detail}]` : "  [待确认]"}`);
      }
    }

    // 英文动作词：不同内容类型混用（旧站复制粘贴的典型症状）
    if (locale === "en-US") {
      const verbs = {
        read: { re: /\b(read|reads|reading)\b/i, families: ["essay"] },
        watch: { re: /\b(watch|watches|watching)\b/i, families: ["video"] },
        view: { re: /\b(view|views|viewing)\b/i, families: ["picture"] },
        listen: { re: /\b(listen|listens|listening)\b/i, families: ["audio"] },
      };
      for (const [verb, { re, families }] of Object.entries(verbs)) {
        if (families.includes(type.key)) continue;
        if (!re.test(data.raw)) continue;
        const line = lineOf(data.raw, re);
        const known = knownFor(data.relPath, data.raw);
        warn(`${data.relPath}:${line} 出现「${verb}」，属于 ${families.join("/")} 类型的动作词${known ? `  [已知：${known.detail}]` : "  [待确认]"}`);
      }
    }
  }
}

for (const issue of knownIssues) {
  if (!issue.hit) info(`content/${issue.file.replace(/^content\//, "")}：已知问题已不存在，可从 KNOWN_ISSUES 移除（${issue.id}）`);
}
for (const locale of LOCALES) {
  if (strings[locale]?.status !== "draft") continue;
  // 日文版完成度逐类型不同：页面按实际文本给出「校正中」或「未翻译」，这里如实点名
  const described = LOCALES.includes("ja-JP") && locale === "ja-JP"
    ? TYPES.filter((type) => clauses[locale][type.key]?.sections.length).map((type) => {
        const text = clauses[locale][type.key].sections.flatMap((section) => section.paragraphs).join(" ");
        return `${type.key}（${/[\u3041-\u30ff]/.test(text) ? "日文译本，校正中" : "英文原文"}）`;
      })
    : [];
  warn(`content/site.${locale}.json：status 为 draft${described.length ? ` → ${described.join("、")}` : ""}；页面顶部的提示与目录标注据此生成`);
}

/* ---------- 构建产物校验（错误） ---------- */

const pages = [{ path: `${OUT_DIR}/index.html`, locale: DEFAULT_LOCALE, kind: "index" }];
for (const locale of LOCALES) {
  pages.push({ path: `${OUT_DIR}/${locale}/index.html`, locale, kind: "index" });
  for (const type of TYPES) {
    if (clauses[locale][type.key]) {
      pages.push({ path: `${OUT_DIR}/${locale}/${type.key}.html`, locale, kind: "clause", type: type.key });
    }
  }
}

for (const page of pages) {
  const html = await readText(join(root, page.path));
  if (html === null) {
    fail(`缺少构建产物 ${page.path}（先运行 npm run build）`);
    continue;
  }
  const expectedLang = strings[page.locale]?.htmlLang;
  const langMatch = /<html lang="([^"]+)"/.exec(html);
  if (!langMatch) fail(`${page.path}：<html> 缺少 lang 属性`);
  else if (expectedLang && langMatch[1] !== expectedLang) {
    fail(`${page.path}：lang="${langMatch[1]}"，应为 "${expectedLang}"`);
  }

  if (/\{\{|undefined|\[object Object\]/.test(html)) fail(`${page.path}：存在模板残留`);

  // 键盘用户要能跳过报头直达正文
  if (!/<a class="skip" href="#main">/.test(html)) fail(`${page.path}：缺少「跳到正文」的 skip link`);
  if (!/id="main"/.test(html)) fail(`${page.path}：缺少 #main 锚点`);

  // hreflang 只应声明真实存在的版本：条款页按该类型的译本数算，目录页三种语言都有
  const expectedAlternates =
    page.kind === "clause"
      ? LOCALES.filter((locale) => clauses[locale][page.type]).length +
        (clauses[DEFAULT_LOCALE][page.type] ? 1 : 0)
      : LOCALES.length + 1;
  const alternates = html.match(/rel="alternate"/g)?.length ?? 0;
  if (alternates !== expectedAlternates) {
    fail(`${page.path}：hreflang 有 ${alternates} 条，应为 ${expectedAlternates} 条（含 x-default）`);
  }

  // 链接不能指向自身目录的下一层（相对路径算错的典型症状）
  if (/href="(?:\.\.\/)?(?:[a-z-]{2,5}\/)?\1"/.test(html)) fail(`${page.path}：发现可疑的自引用链接`);

  if (page.kind === "clause") {
    if (!/class="clause-no"/.test(html)) fail(`${page.path}：缺少条款编号列（.clause-no）`);

    // 文本保真：页面正文必须与 content/ 的 md 逐段一致（重构不改内容）
    const source = clauses[page.locale][page.type];
    if (!source.sections.length) {
      // 正文尚未起草的类型：应当是明确的待补充占位，而不是空白或编造内容
      if (!html.includes(escHtml(strings[page.locale].notDraftedTitle))) {
        fail(`${page.path}：${source.relPath} 尚无正文，页面应显示待补充占位`);
      }
      // 没有正文就不该提供引用行与复制按钮，否则等于让人引用一个空壳
      if (/class="cite"|data-copy=/.test(html)) {
        fail(`${page.path}：${source.relPath} 尚无正文，却提供了引用块或复制按钮`);
      }
      continue;
    }
    if (!/class="cite"/.test(html)) fail(`${page.path}：缺少引用块（.cite）`);
    if (!/data-copy=/.test(html)) fail(`${page.path}：缺少「复制全文」按钮（渐进增强，无 JS 时降级为纯文本链接）`);

    // 日文页里照录的英文原文要按 en 排版，不能套日文字体与字距
    const flatText = source.sections.flatMap((section) => section.paragraphs).join(" ");
    if (page.locale === "ja-JP" && !/[\u3041-\u30ff]/.test(flatText) && !/<article class="sheet" lang="en">/.test(html)) {
      fail(`${page.path}：正文是英文原文，<article> 应标注 lang="en"`);
    }
    const headHtml = [...html.matchAll(/<h2 class="clause-title">([\s\S]*?)<\/h2>/g)].map((m) => unescapeHtml(m[1]));
    const bodyHtml = [...html.matchAll(/<div class="clause-body">([\s\S]*?)<\/div>/g)]
      .flatMap((m) => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => unescapeHtml(p[1])));
    const headSrc = source.sections.map((s) => s.heading);
    const bodySrc = source.sections.flatMap((s) => s.paragraphs);

    const diff = diffAt(headHtml, headSrc);
    if (diff) fail(`${page.path}：小节标题与 ${source.relPath} 不一致（首次出现在第 ${diff.index + 1} 节：「${diff.got}」≠「${diff.want}」）`);
    const diffBody = diffAt(bodyHtml, bodySrc);
    if (diffBody) {
      fail(
        `${page.path}：正文与 ${source.relPath} 不一致（段落 ${diffBody.index + 1}：「${truncate(diffBody.got)}」≠「${truncate(diffBody.want)}」）`,
      );
    }
  }
}

for (const asset of ["index.html", "404.html", "css/wabisabi.css", "assets/grain.svg", "assets/psl.png", ".nojekyll"]) {
  if ((await readText(join(root, OUT_DIR, asset))) === null) fail(`缺少产物文件 ${OUT_DIR}/${asset}`);
}

/* ---------- 链接完整性（错误） ---------- */

const siteRoot = join(root, OUT_DIR);
const siteFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else siteFiles.push(path);
  }
};
walk(siteRoot);

let linkCount = 0;
for (const file of siteFiles) {
  const isHtml = file.endsWith(".html");
  const isCss = file.endsWith(".css");
  if (!isHtml && !isCss) continue;
  const text = await readFile(file, "utf8");
  const pattern = isHtml ? /(?:href|src)="([^"]+)"/g : /url\((["']?)([^"')]+)\1\)/g;
  const relFile = relative(siteRoot, file).split(sep).join("/");
  for (const match of text.matchAll(pattern)) {
    const raw = isHtml ? match[1] : match[2];
    if (/^(https?:|mailto:|#|data:)/.test(raw)) continue;
    const clean = raw.split("#")[0];
    if (!clean) continue;
    linkCount += 1;
    const target = resolve(dirname(file), clean);
    const reachable = existsSync(target) && (!statSync(target).isDirectory() || existsSync(join(target, "index.html")));
    if (!reachable) fail(`${OUT_DIR}/${relFile}：链接指向不存在的 ${clean}`);
  }
}

/* ---------- 报告 ---------- */

const lines = [];
lines.push("PSL 内容与产物校验");
lines.push("=".repeat(52));
lines.push(`正文覆盖：${LOCALES.map((locale) => `${locale} ${TYPES.filter((t) => clauses[locale][t.key]).length}/${TYPES.length}`).join("   ")}`);
lines.push(`已生成页面：${pages.length} 个，内部链接：${linkCount} 条`);
lines.push("");

for (const [label, list] of [["错误", errors], ["警告", warnings], ["提示", infos]]) {
  if (!list.length) continue;
  lines.push(`${label}（${list.length}）`);
  for (const item of list) lines.push(`  - ${item}`);
  lines.push("");
}

const failed = errors.length > 0 || (strict && warnings.length > 0);
lines.push(`结果：${failed ? "未通过" : "通过"}${strict ? "（strict）" : ""}`);
if (!failed && warnings.length) {
  lines.push("说明：警告不阻塞构建；加 --strict 可把警告升级为失败，用于文案收口。");
}

const report = lines.join("\n");
console.log(report);

try {
  await writeFile(join(root, OUT_DIR, "check-report.txt"), `${report}\n`, "utf8");
} catch {
  // 产物目录不存在时忽略
}

process.exit(failed ? 1 : 0);
