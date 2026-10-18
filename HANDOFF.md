# 交接文档（HANDOFF）

> 交接时间：2026-10-21
> 当前分支：`main`，HEAD `49dc387`（2026-10-19「重构为 content/ 单一事实源 + 生成式站点」）
> 远端：`https://github.com/drpasserby/PSL.git`；本地领先 `origin/main` 1 个提交，**尚未 push**。
> 接手前先读 [`README.md`](README.md)。本文记录「现在到哪了、为什么、下一步做什么」。

## 一句话状态

1.1 的站点重构已经完成并通过校验：`content/` 是唯一事实源，`site/` 全部由
`tools/build.mjs` 生成。工作区里有一批**未提交**的收尾改动（排版、可访问性、404、
文档），`npm run verify` 为 0 错误、8 条已知警告（7 条文案 + 1 条日文 draft 提示）。
本轮按用户要求移除了音乐类型，并把日文版的视频 / 图片 / 音频换成按中文原文翻译的
日文译本；除此之外的条款文字（尤其中文、英文的旧措辞）仍在等确认。

## 先跑起来

要求 Node.js ≥ 18，无第三方依赖。

```bash
npm run serve     # http://127.0.0.1:4173
npm run build     # 从 content/ 生成 site/（会先清空 site/）
npm run check     # 校验内容与产物
npm run verify    # build + check，提交前跑这个
```

`site/` 需要提交进仓库（发布用）；`site/check-report.txt` 与 `.preview/` 已在
`.gitignore` 中。**不要手改 `site/`**，每次 build 都会被覆盖。

## 事实源与生成链

```
content/<type>.<locale>.md   条款正文（唯一事实源，逐字进页面）
content/site.<locale>.json   界面文案（三种语言 key 必须齐平）
tools/site.config.mjs        TYPES / LOCALES / LEGACY_MAP / ORIGIN
tools/build.mjs              零依赖生成器
tools/check.mjs              结构与文本保真校验
tools/serve.mjs              本地预览
src/styles/wabisabi.css      样式源（复制到 site/css/）
site/                        构建产物：22 个 HTML + 12 个 plain txt
```

一次 build 生成 34 个文件：三种语言的目录页与条款页、根目录页、5 个旧地址
跳转壳、404、12 个纯文本副本，另复制 css/assets/.nojekyll。条款覆盖：
**zh-CN 4/4、en-US 4/4、ja-JP 4/4**。音乐类型已移除，音频条款涵盖音乐。

旧地址 `PSLE/PSLV/PSLP/PSLA/PSLM.html` 生成 meta refresh 跳转壳，指向 `/zh-CN/<type>.html`；
其中 `PSLM.html` 指向 `/zh-CN/audio.html`（音乐并入音频）。
`archive/` 只作历史留存，不参与构建。

## 2026-10-21 这轮做了什么

上一轮 AI 已完成重构与主要视觉打磨，但工作区留有一批未提交的收尾改动。本轮在
其基础上完成并验证：

- **补齐 skip link**：`site.<locale>.json` 里的 `skip` 文案和 `.skip` 样式早已存在，
  但生成器从未输出。现在目录页与条款页首个元素就是「跳到正文」，`check.mjs`
  会检查 skip link 与 `#main` 是否存在。
- **统一 404 / 旧地址页报头**：之前多了层 `.shell`，左右边距比全站窄一截；现在
  直接使用 `.masthead`，桌面与移动端都与正常页对齐。
- **语言切换指向当前页**：条款页当前语言不再跳回目录，而是指向自身；旧地址跳转页
  的语言切换直达同一类型的对应译本，缺译本时回该语言目录。
- **日文页的英文原文按 `lang="en"` 排版**：此前 ja 的 video / picture / audio 是英文
  原文，套用日文字体会让西文显得松散；生成器会给这类页面标注 `lang="en"`，并加了
  对应校验。本轮这三个模块已换成日文译本，该机制保留给未来缺译的类型。
- **移除音乐类型**：`TYPES` 删掉 music，删除 `content/music.zh-CN.md`，三种语言的
  `metaDescription` 与 `check.mjs` 的类型映射同步收窄；旧地址 `PSLM.html` 改为跳转
  到音频条款。站点输出从 36 个文件降到 34 个。
- **日文模块改为中文原文的日文译本**：`content/video.ja-JP.md`、`picture.ja-JP.md`、
  `audio.ja-JP.md` 不再照录英文，按中文原文重写为 8 节日文；标题分别为
  「動画の宣言」「画像の宣言」「音声の宣言」，第 8 节统一为「使用上の制限」。
  `status` 仍为 `draft`，四页统一显示「校正中」。
- **标题与引用去重**：英文标题本身就是版本行主干，`<title>` 不再出现
  「Protect Shield License of Essay · Protect Shield License of Essay 1.1」；
  英文引用行改为只引用完整版本名。
- **页脚不再暴露实现细节**：原来面向读者写「正文以 content/ 的 markdown 为唯一
  事实源」，现在改成中性的出处说明；`README` 里仍保留维护者需要的事实源说明。
- **移动端横向溢出修复**：单列布局下 `.spine` 残留 `grid-column: 2` 会撑出隐式列；
  已显式归位到第一列，390px 实测无溢出。
- **字体回退**：中文补 `SimSun` / `NSimSun`；日文单独指定日文库，避免与中文衬线混用。
- 修正 `check.mjs` 结尾「警告均为旧站文字问题」的旧说法（日文 draft 提示也是警告）。
- 更新 `README`、`CHANGELOG`（新增 `[未发布]` 段）。

## 验证记录

最近一次 `npm run verify`：

```text
生成了 34 个页面到 site/
条款：zh-CN 4/4  en-US 4/4  ja-JP 4/4
未配置 ORIGIN：使用相对链接，不生成 sitemap/robots

正文覆盖：zh-CN 4/4   en-US 4/4   ja-JP 4/4
已生成页面：16 个，内部链接：254 条
警告（8）
结果：通过
```

`check` 的「16 个页面」只统计三种语言的目录页与条款页，不含 5 个跳转壳和 404；
它们仍会被链接完整性扫描覆盖。

8 条警告中，**6 条是中文 / 英文旧站遗留措辞**，1 条是日文 essay 第 8 节标题重复，
1 条是日文版 `status=draft` 的提示；都不是构建问题。`--strict` 会把它们当失败，
适合文案收口后放进 CI。

浏览器实测（headless Chrome 155 + CDP 设备模拟）：

- 17 个可访问页面 × 320 / 390 / 768 / 1024 / 1440 五档宽度：**0 横向溢出**
  （移除 music 后从 18 降至 17）；
- 1440 桌面、390 移动端、404、三种日文译本页均检查过；本轮重新截取了
  `/ja-JP/video.html` 的桌面与移动端，日文断行与书脊布局正常；
- `/PSLM.html` 的 meta refresh 目标已确认是 `./zh-CN/audio.html`；
- 「复制全文」：点击后按钮变为「已复制」，剪贴板拿到 617 字符的条款文本；
- 禁用 JS：复制按钮 `display:none`，纯文本链接正常显示（渐进增强成立）；
- skip link：键盘聚焦后从 `top:-64px` 移到 `12px`，可见且 `:focus-visible` 生效。

验证脚本和截图在 `.preview/qa/`（整个 `.preview/` 已被忽略）：
`scan.mjs`（全页溢出扫描）、`shot.mjs`（指定尺寸/配色截图）、`interact.mjs`
（复制与无 JS）、`skip.mjs`（skip link）。运行脚本需要先起 `npm run serve`，并
用 `--remote-debugging-port=9229` 启动 Chrome；这些不是仓库测试，只是本次人工 QA
的临时工具。

## 工作区状态（重要）

**没有 commit，也没有 push。** 目前 43 个已跟踪文件有未提交改动（含 4 个删除），
外加本文件 `HANDOFF.md` 未跟踪。改动分三类：

1. 源文件：`tools/build.mjs`、`tools/check.mjs`、`tools/site.config.mjs`、
   `tools/extract.mjs`、`src/styles/wabisabi.css`、`content/*.ja-JP.md`、
   `content/site.*.json`、删除的 `content/music.zh-CN.md`、`.gitignore`、
   `README.md`、`CHANGELOG.md`；
2. 重新生成的 `site/`（22 个 HTML + 12 个 plain txt + css，删除 music 产物）；
3. 本交接文档。

提交时要把 `site/` 的变动一起带上，否则线上/本地产物与源不一致。建议 commit
message 方向：`移除音乐类型，日文模块改用中文原文译本`。

## 待决策 / 未完成

### P0：条款正文的措辞问题（需用户确认后才可改）

这些是旧站复制粘贴留下的，重构时按「正文逐字不变」原样保留。`check.mjs` 每次
都会报；改完相应条目后警告会消失。**不要在没有确认的情况下改条款**，这是对外
展示的声明文本。

| 位置 | 现状 | 建议 | 备注 |
| --- | --- | --- | --- |
| `content/video.zh-CN.md:14` | 「本音频所有内容纯属虚构」 | 本视频 | 该文件仅此一处「本音频」 |
| `content/audio.zh-CN.md:28` | 「强制性观看」「停止观看」 | 「强制性倾听」/「停止倾听」（或统一用「收听」） | 同段已有「本音频拥有倾听自由」，建议统一为「倾听」 |
| `content/essay.en-US.md:28` | compulsory listening / stop listening | compulsory reading / stop reading | 同段已有 reading freedom |
| `content/video.en-US.md:28` | compulsory listening / stop listening | compulsory watching / stop watching | 同段已有 watching freedom |
| `content/picture.en-US.md:28` | compulsory listening / stop listening、reading freedom | compulsory viewing / stop viewing、viewing freedom | 图片类型应统一为 viewing |
| `content/essay.ja-JP.md:27` | 第 8 节标题重复「適用範囲」 | 待定，建议「使用上の制限」 | 该节内容是使用限制；需日文母语/译者确认 |

改完的运行顺序：编辑 `content/*.md` → `npm run verify` → 确认警告减少 →
如 `video.zh-CN` 或 `essay.en-US` 已修，删掉 `check.mjs` 里 `KNOWN_ISSUES`
对应条目（否则会输出「已知问题已不存在，可移除」的提示，不算失败）。

### P1：日文译本的校对与状态

- **日文版四种类型现在都有译本**，均按中文原文翻译，`status` 仍为 `draft`，
  页面顶部与目录统一显示「校正中」。其中 video / picture / audio 是本轮新译，
  essay 是上一轮已有的译本。
- `content/essay.ja-JP.md:27` 第 8 节标题仍重复「適用範囲」（P0 表最后一行）；
  其余三种日文页已经使用「使用上の制限」。
- `site.ja-JP.json` 的 `statusOriginal`、`draftBannerNotTranslated` 现在没有
  类型会用到（没有英文原文页了），但生成器仍保留按内容判断的机制；以后新增
  缺译类型时会自动生效，不需要改代码。
- 校对完成后把 `status` 改为 `official`，并清除两个 `draftBanner*` 文案；
  `check` 的 draft 警告会随之消失。是否标正式版需用户确认。

### P1：部署缺口（上线前必须处理）

`README` 原先写「GitHub Pages 直接托管 site/ 目录」，但 **Pages 的分支发布只允许
仓库根或 `/docs`，不能直接选 `site/`**。仓库里目前也没有 `.github/workflows`。
也就是说，按现在的状态 push 后，旧 Pages 配置（若仍指向 main 根）会找不到根
`index.html`，新站不会自动上线。

三个选项，推荐 A：

**A. 用 GitHub Actions 发布 `site/`（推荐）**

在仓库设置 → Pages → Source 选「GitHub Actions」，然后添加 workflow，核心是
`actions/upload-pages-artifact` 上传 `site/`、`actions/deploy-pages` 发布。
构建步骤跑 `npm run verify`，产物 `site/` 作为 artifact，不需要把构建产物再
commit 一次（但仓库现有约定是提交 `site/`，两者可并存）。

**B. 把 `site/` 改名为 `docs/`**，Pages 分支发布选 `/docs`。改动面大：build
输出目录、README、链接、历史路径都要同步；旧根路径仍会失效。不推荐。

**C. 根目录放跳转/落地页**，继续用分支发布。旧 `PSL*.html` 也要在根保留跳转壳，
相当于维护两套入口，不推荐。

另外：`tools/site.config.mjs` 的 `ORIGIN` 目前是空字符串，全站用相对链接，
**不生成 sitemap 和 robots，hreflang 也是相对地址**。确定正式地址后填上
（例如 `https://drpasserby.github.io/PSL`），重新 `npm run build`，会生成绝对地址
的 `sitemap.xml`、`robots.txt` 和 `og:image`。如果使用自定义域名，填自定义域名。

### P2：纯文本副本的格式

`site/plain/<locale>/<type>.txt` 现在是 `content/*.md` 的**逐字节复制**，所以
「复制全文」拿到的是带 `#` / `##` 标记的 Markdown，而不是去掉标记的纯文本。
本次实测复制出的 617 字符以 `# 文章叠甲` 开头。

如果目标场景是贴进作品简介/文件头，建议改为生成「标题 + 版本 + 小节标题 + 段落」
的无标记文本；如果希望保留 Markdown 结构用于归档，则保持现状。这是一个产品
选择，本次**没有擅自改**。改的话需要同步 `tools/build.mjs` 与 `check.mjs`
（现在 plain 文件不参与文本保真校验）。

### P3：可选清理（不影响功能）

- 三个 `site.<locale>.json` 里的 `clausesLabel`、`statusDraft` 目前没有被
  `build.mjs` 使用；`wabisabi.css` 的 `.dump` 也没有对应 HTML。可以删，也可以留作
  后续扩展。删的话三种语言要同步，否则 key 齐平校验会报错（删同一 key 不会）。
- `statusOriginal` / `draftBannerNotTranslated` 与「本文尚未定稿」占位目前都没有
  触发条件（四种类型三种语言都有正文），代码保留给以后新增缺译类型。
- `check.mjs` 的页面循环只覆盖目录页与条款页，404 与 5 个跳转页只被链接完整性
  扫描覆盖；如需更严，可把这两类页加入 `pages` 数组。
- 没有自动化视觉回归；本次靠 CDP 脚本人工检查。若以后频繁改版，可以把
  `.preview/qa` 的做法固化成可提交的脚本。

## 不要做的事

- 不要直接编辑 `site/` 下的 HTML/CSS；改 `content/`、`tools/`、`src/` 后重新
  build，再把 `site/` 的变动一起提交。
- 不要在未确认时改动 `content/*.md` 的条款文字；`check.mjs` 的文本保真和
  `KNOWN_ISSUES` 机制就是为这件事设的。
- 不要为了「让警告消失」而删掉 `check.mjs` 里的检查；警告是内容待确认的信号。
- 不要删除 `site/` 或 `archive/`：前者是发布产物，后者是旧站追溯依据。
- 不要把 `ORIGIN` 填成没有根据的地址；先确认实际域名。

## 接手后的建议顺序

1. 和用户确认 P0 表剩余的 6 行（5 个中英文措辞 + 日文 essay 标题）→ 改
   `content/` → `npm run verify`；
2. 请日语母语者校对四种日文译本（P1），确认后把 `site.ja-JP.json` 的
   `status` 改为 `official`；
3. 确认部署方式与正式域名；按 A 方案补 workflow、填 `ORIGIN`、重新 build；
4. 跑 `npm run verify`，检查 `git status`，把源文件 + `site/` + 文档一起提交；
5. push 前确认远端 Pages 设置已切到「GitHub Actions」（若走 A 方案）；
6. 部署后抽查：`/`、`/zh-CN/essay.html`、`/en-US/essay.html`、`/ja-JP/video.html`、
   `/PSLM.html`（应落到音频页）、`/404.html`，以及移动端与禁用 JS 的复制降级。

## 快速定位

- 改站点结构/类型/语言：`tools/site.config.mjs`
- 改页面模板/输出逻辑：`tools/build.mjs`
- 新增校验：`tools/check.mjs`（错误用 `fail()`，文案体检用 `warn()`）
- 改界面文案：`content/site.zh-CN.json` / `content/site.en-US.json` / `content/site.ja-JP.json`
- 改条款：`content/<type>.<locale>.md`
- 改版式：`src/styles/wabisabi.css`（`@layer tokens/reset/base/layout/components/states/print`）
- 旧站与来源：`archive/README.md`
- 本次 QA 证据：`.preview/qa/`（忽略目录）
