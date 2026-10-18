// tools/site.config.mjs — 站点结构与文案的来源配置
// 这里只放"结构"和"界面标签"，不放条款正文。
// 条款正文的唯一事实源是 content/<type>.<locale>.md。

/** 条款类型：顺序即首页目录顺序 */
export const TYPES = [
  { key: "essay",   latin: "Essay",   zh: "文章",   ja: "テキスト",   en: "Essay" },
  { key: "video",   latin: "Video",   zh: "视频",   ja: "ビデオ",     en: "Video" },
  { key: "picture", latin: "Picture", zh: "图片",   ja: "画像",       en: "Picture" },
  { key: "audio",   latin: "Audio",   zh: "音频",   ja: "オーディオ", en: "Audio" },
];

/** 语言：第一个是默认语言（x-default） */
export const LOCALES = ["zh-CN", "en-US", "ja-JP"];

export const DEFAULT_LOCALE = "zh-CN";

/**
 * 站点绝对地址，用于 hreflang / 引用文本。
 * 留空时全部使用相对链接（可部署到任意子路径，GitHub Pages 子目录也能用）。
 * 部署到自有域名时填成 "https://example.com" 即可，不带动结尾斜杠也行。
 */
export const ORIGIN = "";

/** 主页外链（旧站） */
export const HOME_URL = "https://wulvxinchen.cn/";

/** 输出目录（构建产物，提交进仓库以便静态托管） */
export const OUT_DIR = "site";

/**
 * 旧地址兼容表：这些路径在重构前是真实存在的线上地址，
 * 生成一个静态跳转壳，避免之前的引用全部 404。
 */
export const LEGACY_MAP = {
  "PSLE.html": "essay",
  "PSLV.html": "video",
  "PSLP.html": "picture",
  "PSLA.html": "audio",
  // 音乐已并入音频条款，旧音乐地址落到音频页
  "PSLM.html": "audio",
};
