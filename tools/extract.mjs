// tools/extract.mjs — 一次性迁移脚本
// 把仓库里既有的条款文本（根目录 PSLE.md + Web/<locale>/PSL*.html）机械抽取成
// content/<type>.<locale>.md，作为之后唯一的正文事实源。
// 不重写、不润色、不翻译：输出文本 = 输入文本，逐字符保留。
//
// 迁移已经完成，content/ 才是事实源。这个脚本保留下来只为追溯：
// 注意：日文 video/picture/audio 已改为人工译本，music 已移除；重跑会按旧站
// 原文覆盖 content/*.md，只能用于历史核对，不要在正常维护时运行。
// 旧文件已归档到 archive/legacy-md 与 archive/web-1.0。
//
// 用法：node tools/extract.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = [
  { key: "essay", legacy: "PSLE" },
  { key: "video", legacy: "PSLV" },
  { key: "picture", legacy: "PSLP" },
  { key: "audio", legacy: "PSLA" },
];
const LOCALES = ["zh-CN", "en-US", "ja-JP"];

/** 抽取一个 markdown 文件里的标题与分节正文 */
function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  let title = "";
  let version = "";
  const sections = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) {
      current.body = buffer.join("\n\n").trim();
      if (current.body) sections.push(current);
      current = null;
    }
    buffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1 && !title) { title = text; continue; }
      // 版本号行既可能是 ## 也可能是 ###，用内容特征判定
      if (!version && /Protect Shield License/i.test(text)) { version = text; continue; }
      flush();
      current = { heading: text, body: "" };
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return { title, version, sections };
}

/** 从旧版 Web 页面里取出 thirdTitle + 紧随其后的若干 <p> */
function parseLegacyPage(html) {
  const grab = (cls) => {
    const m = new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)<\\/div>`).exec(html);
    return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
  };
  const title = grab("title");
  const version = grab("secTitle");

  // contect 区块的终点：其后的第一个 .back 导航或 </body>
  const bodyStart = html.indexOf('class="contect"');
  if (bodyStart < 0) return { title, version, sections: [] };
  const marks = [html.indexOf('class="back"', bodyStart), html.indexOf("</body>", bodyStart)]
    .filter((i) => i > -1);
  const body = html.slice(bodyStart, marks.length ? Math.min(...marks) : undefined);

  const sections = [];
  const token = /class="thirdTitle"[^>]*>([\s\S]*?)<\/div>|<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  let current = null;
  const clean = (s) =>
    s.replace(/<br\s*\/?>/gi, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

  while ((m = token.exec(body))) {
    if (m[1] !== undefined) {
      if (current) sections.push(current);
      current = { heading: clean(m[1]), body: "" };
    } else if (current) {
      const text = clean(m[2]);
      if (text) current.body = current.body ? `${current.body}\n\n${text}` : text;
    }
  }
  if (current) sections.push(current);
  return { title, version, sections };
}

const render = ({ title, version, sections }) =>
  `# ${title}\n${version ? `${version}\n` : ""}\n` +
  sections.map((s) => `## ${s.heading}\n${s.body}\n`).join("\n");

await mkdir(join(root, "content"), { recursive: true });
const report = [];

for (const type of TYPES) {
  // zh-CN 以根目录 md 为准
  const zh = parseMarkdown(
    await readFile(join(root, "archive", "legacy-md", `${type.legacy}.md`), "utf8"),
  );
  const zhOut = join(root, "content", `${type.key}.zh-CN.md`);
  await writeFile(zhOut, render(zh), "utf8");
  report.push({ file: zhOut, sections: zh.sections.length });

  // en-US / ja-JP 从旧页面机械抽取
  for (const locale of LOCALES.slice(1)) {
    const file = join(root, "archive", "web-1.0", locale, `${type.legacy}.html`);
    let out;
    try {
      out = parseLegacyPage(await readFile(file, "utf8"));
    } catch {
      report.push({ file: `${type.key}.${locale}`, sections: "— 无此页面，跳过" });
      continue;
    }
    const dest = join(root, "content", `${type.key}.${locale}.md`);
    await writeFile(dest, render(out), "utf8");
    report.push({ file: dest, sections: out.sections.length });
  }
}

for (const r of report) {
  const name = typeof r.file === "string" ? r.file.replace(/\\/g, "/").split("/").slice(-2).join("/") : r.file;
  console.log(`${String(r.sections).padStart(2)} 节  ${name}`);
}
