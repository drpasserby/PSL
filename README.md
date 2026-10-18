# 叠甲License

### Protect Shield License

> 帮助一切需要叠甲的人提前叠甲。
> 你只需要表达，剩下的交给叠甲License。

按内容类型分成四份的免责声明条款：**文章、视频、图片、音频**（音频条款同时涵盖
音乐）。它不是版权许可，而是一段放在作品前面的说明——把话说在前面，省得事后解释。

每种类型都提供中文、英文、日文三个版本，条款可整段引用，也可以复制全文。

![叠甲License](assets/psl.png)

## 站点

纯静态站点，没有框架，没有运行时依赖，语言切换是真实链接，键盘用户可跳过报头
直达正文，唯一的一段 JS 负责「复制全文」。所有页面都由 `tools/build.mjs` 从
`content/` 生成。

| 类型 | 中文 | English | 日本語 |
| --- | --- | --- | --- |
| 文章 Essay | `/zh-CN/essay.html` | `/en-US/essay.html` | `/ja-JP/essay.html` |
| 视频 Video | `/zh-CN/video.html` | `/en-US/video.html` | `/ja-JP/video.html` |
| 图片 Picture | `/zh-CN/picture.html` | `/en-US/picture.html` | `/ja-JP/picture.html` |
| 音频 Audio | `/zh-CN/audio.html` | `/en-US/audio.html` | `/ja-JP/audio.html` |

根路径 `/` 是中文目录页。旧的 `PSLE.html` / `PSLV.html` / `PSLP.html` /
`PSLA.html` / `PSLM.html` 保留为跳转页；音乐并入音频后，`PSLM.html` 指向音频条款，
老链接不会 404。

## 开始

需要 Node.js ≥ 18，不需要安装任何依赖：

```bash
npm run serve   # 本地预览 http://127.0.0.1:4173
npm run build   # 从 content/ 生成 site/
npm run check   # 校验内容与产物
npm run verify  # build + check
```

## 目录

```
.
├── assets/          品牌图 psl.png 与纸面噪点 grain.svg
├── content/         条款正文 <type>.<locale>.md + 界面文案 site.<locale>.json
├── src/styles/      wabisabi.css（侘寂风样式表，按 @layer 分层）
├── tools/           build / check / serve 与一次性迁移脚本 extract.mjs
├── site/            构建产物（提交进仓库，发布时整体托管）
├── archive/         旧站与旧条款 md 归档，不参与构建
└── HANDOFF.md       交接说明：当前进度、待确认事项、部署缺口
```

## 改条款

`content/` 是唯一事实源，页面不手改。

1. 编辑 `content/<type>.<locale>.md`。文件结构：

   ```markdown
   # 文章叠甲                 ← 标题
   Protect Shield License of Essay 1.1   ← 版本行
   ## 适用范围                ← 小节标题
   正文段落，段落之间空一行。
   ```

2. 跑 `npm run verify`，错误清零后提交——`site/` 的变动要一起提交（发布方式见
   「部署」）。

增删类型改 `tools/site.config.mjs` 里的 `TYPES`；界面文案在
`content/site.<locale>.json`，各语言的 key 必须齐平。

## 校验做了什么

`npm run check` 分两级：

**错误**（会让命令失败）——各语言条款数或版本号不一致、界面文案缺 key、产物缺失、
`<html lang>` 不对、hreflang 不全、模板残留、skip link 或 `#main` 缺失、日文页里
照录的英文原文没有标注 `lang="en"`，以及**文本保真**：页面里每一节标题和每一段
正文，必须与 `content/` 的 md 逐字一致。重构不改内容，这一条守的就是它。

**警告**（不失败，`--strict` 可升级为失败）——内容体检：重复的小节标题、跨内容
类型的措辞混用、草稿语言。见下一节。

## 已知文字问题

下面这些都是旧站留下的，属于「内容文本不变」的范围，**目前原样保留**，等你确认
后再改。`npm run check` 会持续把它们报成警告，不会悄悄消失。

| 位置 | 现象 | 应该是 |
| --- | --- | --- |
| `content/video.zh-CN.md:14` | 视频条款写「本音频所有内容纯属虚构」 | 本视频 |
| `content/audio.zh-CN.md:28` | 音频条款写「强制性观看」「停止观看」 | 倾听 / 收听 |
| `content/essay.en-US.md:28` | 英文文章条款用了 listening 措辞 | reading |
| `content/video.en-US.md:28` | 英文视频条款用了 listening 措辞 | watching |
| `content/picture.en-US.md:28` | 英文图片条款混用 reading 与 listening | viewing |
| `content/essay.ja-JP.md:27` | 第 8 节标题重复「適用範囲」 | 待你给一个译名 |

确认后逐条改 `content/`，重跑 `npm run verify`，警告自然消失。

## 语言状态

- **中文（zh-CN）**：正式版，1.1。
- **英文（en-US）**：正式版，1.1，但带有上表的措辞问题。
- **日文（ja-JP）**：`status` 标为 `draft`。四种类型现在都有日文译本，按中文原文
  翻译，仍在校正；文章第 8 节标题重复的问题见上表。页面顶部统一提示「校正中」，
  目录里逐条标注。

音乐（music）已并入音频条款，不再单独提供；旧地址 `PSLM.html` 会跳到音频页。

## 部署

`site/` 是完整的静态站点，可放到任意静态服务器的根路径或子路径（全站相对链接，
含 `.nojekyll`）。

> 注意：GitHub Pages 的「分支发布」只能选仓库根或 `/docs`，不能直接选 `site/`。
> 本仓库目前没有 Pages workflow。若用 Pages，需要在仓库设置里把发布源切到
> GitHub Actions，并添加一个上传 `site/` 的 workflow；具体选项见
> [`HANDOFF.md`](HANDOFF.md)。

`tools/site.config.mjs` 里的 `ORIGIN` 默认为空，此时全站使用相对链接、不生成
sitemap。填上正式域名（如 `https://example.com/psl`）后重新 build，会额外生成
绝对地址的 `sitemap.xml`、`robots.txt` 和 `og:image`。

## 许可

构建脚本与样式按 [MIT](LICENSE)。条款正文的授权说明写在条款本身里。
旧站归档见 [`archive/`](archive/README.md)。
