# 归档说明

这个目录保存重构前的旧文件，只为可追溯，**不是站点的一部分**，也不会被
`tools/build.mjs` 读取。线上访问请用根目录的 `site/`。

## web-1.0/

上一代站点（2023–2024），一个 Vue 2 单页 + 多份复制粘贴的静态 HTML：

- `index.html`：入口，用 `js/vue.min.js` 做中/英/日语言切换
- `zh-CN|en-US|ja-JP/PSL?.html`：每种语言各自四份页面（缺 PSLM）
- `PSL?.html`：顶层 1.0 残留页
- `css/page.css`：旧样式表

问题：同一段条款被复制到 12 个文件里各自漂移，改一处要改十二处；语言切换依赖
JS，禁用脚本后只剩一种语言；正文里已经混进了不同内容类型的措辞（见根目录
README 的「已知文字问题」）。

新站点把正文收进 `content/`，页面全部由 `tools/build.mjs` 生成，这些文件因此
下线归档。

## legacy-md/

1.0/1.1 时期的条款源文件（`PSLE.md`、`PSLV.md`、`PSLP.md`、`PSLA.md`、`PSLM.md`）。

它们是 `content/*.zh-CN.md` 的来源：正文逐字迁移，只做了两处机械规范化——
小节标题从 `###` 统一为 `##`，文件末尾补齐换行。文本内容没有改动，可用下面
的命令复核：

```bash
norm() { sed 's/^#\+[[:space:]]*//' "$1" | sed '/^[[:space:]]*$/d'; }
diff <(norm archive/legacy-md/PSLE.md) <(norm content/essay.zh-CN.md)
```

现在条款正文的唯一事实源是 `content/`，请不要再改这里的文件。
