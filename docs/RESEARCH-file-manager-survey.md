# 文件管理器前端调研报告 —— 为 dufs-solid（Svelte 5 媒体优先 dufs 前端）找借鉴

调研人：FMSurvey ｜ 日期：2026-10-03
对象：① 52funny/dufs-tabler-web（本地 `/tmp/dufs-tabler-web`，重点 `assets/index.js` 全 1537 行、`index.html`、`index.css`）
② filebrowser/filebrowser（GitHub + docs，重点前端交互）
③ sigoden/dufs 官方 `assets/`（GitHub 远端读取，作第三参照）
证据格式：`文件:行号`（本地文件）或 URL（远端文件/文档）。

> 前置说明：dufs-solid 现状（据其 README）已有 Gallery/Grid/List 三视图、ComicReader 分页记忆、View Transition 缩略图变形、长按选择、Esc 分层、`/` 聚焦搜索、⌘K 命令等。本报告的「借鉴点」会标注**新增价值** vs **已有类似实现可加强**，避免重复建议。

---

## ① 项目总览

### 1.1 dufs-tabler-web（52funny/dufs-tabler-web，本地克隆）
- **技术栈**：零框架 vanilla JS + 原生 DOM（`el()` 工具函数，`index.js:1520-1537`）；样式用本地打包的 Tabler 子集 `tabler.min.css` + 自定义 `index.css`（1084 行）；无 CDN、无字体、无运行时依赖（`README.md`）。Docker 构建时用 esbuild 压缩，产物不覆盖源码。
- **体量**：`index.js` 53.2KB / 1537 行，`index.css` 20.1KB / 1084 行，`index.html` 10.3KB / 82 行。
- **架构**：服务端 dufs 把 base64 JSON 注入 `<template id="index-data">`（`index.html:82`），前端 `readDufsData()` 解码（`index.js:1441-1464`）；`DATA.kind ∈ Index|Edit|View` 分流到「索引页 / 编辑器页」（`index.js:47-66`）。权限完全由注入布尔驱动：`allow_search/allow_upload/allow_archive/allow_delete` 逐个显隐按钮（`index.js:221-250`）。
- **亮点**：上传队列 + dufs 原生 PATCH 断点续传；外部播放器协议菜单；智能排序（目录优先 + `Intl.Collator`）；编辑/预览双 tab；媒体原生预览；token 全链路（`tokengen` 获取、继承、直链清洗）。

### 1.2 filebrowser/filebrowser（Go 后端 + 前端）
- **技术栈**：前端为 Vue 3.5 + TypeScript + Vite + Pinia + vue-router 5 + vue-i18n（`frontend/package.json`）。重型依赖：`tus-js-client`（分块断点续传）、`video.js`（+hotkeys/mobile-ui）、`ace-builds`（代码编辑器）、`epubjs` + `vue-reader`（EPUB 阅读器）、`marked` + KaTeX、`dompurify`、`csv-parse`、`qrcode.vue`、`vue-lazyload`、`dayjs`、`filesize`、`utif`（TIF/RAW 解码）。
- **体量**：`FileListing.vue` 1138 行（主列表，含全部交互）、`Preview.vue` 509 行、`Editor.vue` 368 行、`ListingItem.vue` 417 行、`Search.vue`、`Sidebar.vue`、`ExtendedImage.vue` 342 行、`CsvViewer.vue` 376 行、stores（file/auth/layout/upload/clipboard）等。
- **状态**：⚠️ **2026-09-01 已归档**，不再发版/修安全（仓库 README 顶部警告；背景文章 hacdias.com/2026/07/28/filebrowser/）。安全注意事项两条：命令执行与自包含 JWT 会话存在已知未修漏洞。→ 只借鉴交互设计，**不借鉴安全模型**。
- **亮点**：键盘优先的选择模型、预览画廊（上一张/下一张媒体）、拖拽到文件夹移动/复制、冲突解决弹窗、增量渲染大目录、右键菜单、移动端多选模式、TUS 上传 + 全局进度条、per-user 偏好（viewMode/排序/日期格式/单双击）。

### 1.3 dufs 官方前端（sigoden/dufs `assets/`）
- **技术栈**：vanilla JS，`index.js` 约 1000 行，`index.html` 极简（面包屑 + 工具行 + searchbar + 上传表 + 路径表 + 编辑器 textarea）。
- **能力基线**（tabler-web 是其超集）：单并发上传（`DUFS_MAX_UPLOADINGS = 1`，`assets/index.js:41`）XHR PUT，失败显示 `✗ + 重试 ↻`，重试用 HEAD 探测 `content-length` 后 `PATCH + X-Update-Range: append` 续传（`assets/index.js` Uploader 类）；表格表头 `?sort=&order=` URL 参数排序（`renderPathsTableHead`）；`IFRAME_FORMATS`（pdf/图片/音视频）用 `<iframe sandbox>` 预览，其余提示 "Cannot edit because file is too large or binary"；下载链接统一 `dlwt` 点击时 `?tokengen` 换 token；新建/移动/删除全用 `prompt()`/`confirm()` 原生对话框。
- **参照价值**：界定 dufs 服务端能力边界（`PUT`/`PATCH append`/`MKCOL`/`MOVE`+`Destination`/`DELETE`/`?zip`/`?q=`/`?edit`/`?view`/`?tokengen`/`CHECKAUTH`/`LOGOUT`，见仓库 README「API」一节）——任何前端借鉴都要落在这套协议上。

---

## ② 功能清单对照表

图例：✓ 完整实现 ｜ ◐ 部分/受限 ｜ ✗ 无

| 功能 | tabler-web | filebrowser | dufs 官方 | 备注 |
|---|---|---|---|---|
| 列表视图（表格） | ✓ 表格+固定列宽（`index.css:852+`） | ✓（list 模式） | ✓ 表格 | 三项目都有 |
| 网格/图标视图 | ✓ grid 卡片 + 类型图标（`index.js:697-713`、`index.css:504-527`） | ✓ mosaic / mosaic gallery 两种网格，缩略图（`ListingItem.vue`、`FileListing.vue:775-793`） | ✗ | dufs-solid 已有 Gallery/Grid |
| 目录优先排序 | ✓「智能排序」dir-first + `Intl.Collator(numeric)`，降序时目录单独反转（`index.js:1105-1128`） | ✓ 列头点击排序，目录文件分区块（`FileListing.vue` Folders/Files 两个 h2） | ◐ 目录混合在表格中 | tabler-web 的 desc 保目录优先是最细的 |
| 排序持久化 | ✓ localStorage `dufs-sort/dufs-order` + URL 参数优先（`index.js:34-36`） | ✓ 服务端存用户 profile（`users.update({sorting})`，`FileListing.vue` sort()） | ✓ URL 参数 `?sort=&order=`（可分享） | dufs 无用户系统 → 用 localStorage/URL |
| 多选/全选 | ✓ checkbox + select-all（含 indeterminate）+ 选择条（`index.js:699-770`） | ✓ 点击/⌘/⇧范围/长按/多选模式 + `Esc` 清空（`ListingItem.vue`、`FileListing.vue:422-503`） | ✗ 无选择 | filebrowser 选择模型最完整 |
| 批量操作 | ✓ 批量下载（逐项）批量删除（confirm）（`index.js:724-769`） | ✓ 批量下载/删除/复制/移动 + 右键菜单（`FileListing.vue:298-317`、`api/files.ts` moveCopy） | ✗ | filebrowser 批量最全 |
| 行内操作按钮 | ✓ 下载/复制直链/预览/移动/编辑/删除（`index.js:690-760`） | ✓ 点击打开 + 右键菜单 | ✓ 下载/预览/编辑/移动/删除（`assets/index.js` addPath） | |
| 右键菜单 | ✗（移动端无，用工具栏） | ✓ 光标处弹出、视口夹紧（`FileListing.vue:1089-1099`、`ContextMenu.vue` left clamp） | ✗ | dufs-solid 可选 |
| 键盘快捷键 | ✗ 仅 Esc 关菜单 | ✓ Esc/Del/F2/Ctrl+A/S/C/X/V/⇧F（`FileListing.vue:422-503`） | ✗ | dufs-solid 已有 / ⌘K ? Esc，可补 F2/Del/Ctrl+A |
| 面包屑 | ✓ 根图标 + 分隔符 + 当前目录 `<b>`（`index.js:1060-1082`） | ✓ `Breadcrumbs.vue` | ✓ 同 tabler-web（`assets/index.js` addBreadcrumb） | |
| 搜索 | ✓ 提交式 `?q=` 导航（`index.js:284-297`） | ✓ 浮层搜索：类型快捷（图/音/视频/PDF）、增量结果、AbortController 取消（`Search.vue`） | ✓ 提交式 `?q=`（`assets/index.js` setupSearch） | filebrowser 的浮层+类型过滤最值得搬 |
| 上传（按钮/文件夹） | ✓ 单文件 + `webkitdirectory` 文件夹（`index.js:300-330`） | ✓ 同，另有多选模式上传 | ✓ 文件（官方无文件夹按钮） | |
| 拖拽上传 | ✓ 页面级 drop + `webkitGetAsEntry` 递归（`index.js:363-402`） | ✓ 同 + 拖到文件夹上=移动到该文件夹、dragEnter 时全列表 50% 透明（`FileListing.vue` dragEnter/drop） | ✓ 同 tabler-web（`assets/index.js` setupDropzone） | |
| 断点续传上传 | ✓ HEAD 探测 offset + `PATCH X-Update-Range: append`，可续传/重试（`index.js:457-595`） | ✓ TUS 分块 + 退避重试（`api/tus.ts`、`stores/upload.ts`） | ✓ HEAD + PATCH append（`assets/index.js` Uploader.retry） | **dufs 无 tus 端点 → 必须用 PATCH append 方案** |
| 上传队列/进度 | ✓ 队列 + 双并发 + 每项进度条/速度/状态、导航栏徽标、beforeunload 守卫（`index.js:403-456`、`index.js:203-209`） | ✓ 全局进度条 + 并发 5（`stores/upload.ts` UPLOADS_LIMIT=5） | ✓ 表格内文本进度 + 速度 + 预计剩余时长（`assets/index.js` progress()） | tabler-web 队列最接近 dufs-solid 应有形态 |
| 冲突处理 | ◐ 仅移动/重命名时 HEAD 探测 + confirm 覆盖（`index.js:754-778`） | ✓ 上传/复制/移动前预检，逐项 保留/覆盖/重命名/跳过 弹窗（`utils/upload.ts` checkConflict、resolve-conflict prompt） | ◐ 同 tabler-web（`assets/index.js` doMovePath） | dufs 无 rename-on-conflict 服务端语义，需自行组合 MOVE |
| 目录打包下载 | ✓ `?zip` 按钮（`index.js:226-229`） | ✓ 服务端 `?files=a,b&algo=zip|tar`（`api/files.ts` download） | ✓ `?zip` 链接（`assets/index.js` addPath） | dufs 能力：`?zip` |
| 预览（图片/音视频/PDF） | ✓ 原生 `<img>/<video>/<audio preload=metadata>`、PDF object+iframe、未知类型 fallback（打开/下载）（`index.js:1252-1330`） | ✓ 图片缩放查看器、video.js、PDF `<object>`、EPUB、CSV（`Preview.vue`） | ✓ iframe（`assets/index.js` setupEditorPage） | tabler-web 的 fallback 与 PDF fragment 值得抄 |
| 预览画廊（上/下张） | ✗ | ✓ 同目录媒体上一张/下一张、导航 1.5s 自动隐藏、左右键（视频时放行给播放器）、图片预取、删除后自动跳下一张（`Preview.vue:238-330`） | ✗ | **媒体优先前端最高价值借鉴** |
| 外部播放器 | ✓ IINA/VLC/PotPlayer 协议、M3U 播放列表下载、复制 mpv/vlc 命令（`index.js:843-905`） | ✗（仅 video.js 内嵌 + openDirect） | ✗ | tabler-web 独有，媒体优先直接搬 |
| 文本/代码编辑 | ✓ textarea + 编辑/预览 tab + MD(正则)/JSON 美化/CSV 表（前 200 行）+ 编码探测（`index.js:1252-1400`） | ✓ ACE（语法高亮/补全/snippets）+ MD+KaTeX 预览（DOMPurify）、字体大小记忆、dirty 守卫（`Editor.vue`） | ✓ textarea + 编码（`assets/index.js` setupEditorPage） | dufs-solid 无运行时 UI 库 → 保持 textarea 级别 |
| 新建文件/文件夹 | ✓ MKCOL / PUT 空文件 + `prompt()`（`index.js:780-807`） | ✓ 弹窗表单（sidebar newDir/newFile） | ✓ 同 tabler-web `prompt()`（`assets/index.js` setupNewFolder） | dufs-solid 已有 dialog，弃 prompt |
| 重命名/移动 | ✓ MOVE + Destination，HEAD 预检覆盖（`index.js:754-778`） | ✓ PATCH action=rename + 冲突弹窗；拖拽移动 | ✓ 同 tabler-web | |
| 删除 | ✓ 逐项/批量 confirm + 本地即时移除（`index.js:780-807` 一带） | ✓ 删除后预览自动前进；F2/Del 快捷键 | ✓ confirm（`assets/index.js` doDeletePath） | |
| 下载直链/token | ✓ 清洗 `view/edit/noscript/tokengen` 参数 + tokengen 取 token + 继承（`index.js:887-1070`） | ✓ `/api/raw?inline=` 直链 + openDirect | ✓ dlwt 链接 tokengen（`assets/index.js` setupDownloadWithToken） | dufs 的 token 体系必须这样处理 |
| 鉴权 | ✓ CHECKAUTH/LOGOUT + 浏览器弹窗登录（`index.js:1034-1058`） | ✓ 登录页 + JWT + 用户系统 | ✓ 同 tabler-web | dufs 用 HTTP auth + 查询 token |
| 主题 | ✓ 系统/亮/暗 + 内联脚本防 FOUC + localStorage（`index.html:10-16`、`index.js:1161-1210`） | ✓ per-user + 编辑器主题 | ✗ | 内联防闪烁脚本是通用技巧 |
| 大目录性能 | ◐ 全量注入 + 一次性渲染（`DATA.paths`） | ✓ 增量渲染：初始 50 项、滚动到 75% 加 2 屏、itemWeight 估算（`FileListing.vue` showLimit/fillWindow/scrollEvent） | ◐ 全量渲染 | **filebrowser 增量渲染对媒体目录很关键** |
| 移动端适配 | ✓ 表格固定宽度横向滚动、工具栏横向滚动、面包屑滚动、上传徽标折叠（`index.css:852-1084`） | ✓ 独立底部多选操作条（`FileListing.vue:31-84`）、长按选择（`ListingItem.vue`）、videojs mobile-ui | ✗ 无 | dufs-solid 长按已有，可补底部操作条 |
| 目录大小/用量 | ✓ 目录显示子项数（>999 封顶）+ 路径摘要（`index.js:660-698`、`index.js:1439-1447`） | ✓ Sidebar 磁盘用量进度条（`Sidebar.vue` usage API） | ✓ 子项数封顶（`assets/index.js` formatDirSize） | dufs 无 usage API → 子项数方案即可 |
| 分享 | ✗（仅复制直链） | ✓ Share 弹窗 + 二维码（`views/Share.vue` 15KB、qrcode.vue） | ✗ | 依赖 share 权限体系，dufs 无 → 不建议 |
| 缩略图 | ✗ 图标代替 | ✓ `api/preview/thumb` + vue-lazyload（`ListingItem.vue` thumbnailUrl） | ✗ | dufs 无预览尺寸 API，需前端自渲染 |
| 时间显示 | ✓ 绝对时间 `YYYY-MM-DD HH:mm`（`index.js:1430-1438`） | ✓ 相对时间 fromNow / 用户日期格式（`ListingItem.vue` dayjs） | ✓ 绝对时间 | 媒体目录建议相对时间可选 |
| 编码处理 | ✓ content-type charset → TextDecoder（`index.js:1358-1363`） | ✓ 编码探测 + CSV 编码下拉（`CsvViewer.vue`、`utils/encodings.ts`） | ✓ 同 tabler-web | |

---

## ③ 对 dufs-solid 有价值的借鉴点

按「媒体优先」适配度排序，标注适用性：**[媒体]** = 直接服务媒体浏览；**[通用]** = 文件管理通用；**[已有]** = dufs-solid 已有类似实现、可参考加强。

### 3.1 媒体预览画廊：上一张/下一张 + 键盘 + 自动隐藏导航 + 预取 **[媒体]【最高优先】**
- **交互**（filebrowser `frontend/src/views/files/Preview.vue:238-330`）：
  1. 打开任一媒体时，取**同目录完整列表**，仅把 `type ∈ image/video/audio/blob` 的项串成 prev/next 链（`mediaTypes` 数组）；左右箭头按钮常驻，移动到边缘自动淡出、鼠标/触摸即现、1.5s 无操作隐藏（`toggleNavigation` throttle 500ms）。
  2. 键盘：`←/→` 切换上一张/下一张，`Enter` 前进，`Esc` 返回目录；**播放视频时放行左右键给播放器做 seek**（`if (isVideo) return;`，避免抢占）。
  3. 性能：`<link rel="prefetch">` 预取上一张/下一张图片（`Preview.vue` 中 `previousRaw/nextRaw` + `prefetchUrl()`，仅图片且按当前 fullSize 档位取对应尺寸）。
  4. 删除当前媒体后自动前进到下一张（`deleteFile()` 里 splice 列表后 `next()`；没有下一张回退 `prev()`；列表空则回目录并 preselect 邻近项）。
- 对 dufs-solid：Gallery/List 打开媒体后即可复用：读 `DATA.paths` 已注入，无需额外请求；预览时用 history 更新 `?view=` 让浏览器前进/后退语义成立；图片预取用 `<link rel=prefetch>` 或 `new Image()`；视频播放时左右键要让给播放器（dufs-solid 的 ComicReader 里 Space 翻页已有类似让步逻辑）。现状：dufs-solid 暂无同目录连续预览 → 这是最高优先新增项。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/views/files/Preview.vue

### 3.2 外部播放器协议菜单：IINA/VLC/PotPlayer + M3U 播放列表 + mpv/vlc 命令 【媒体】
- 交互（tabler-web `index.js:843-905`）：媒体预览页的「播放」按钮弹出菜单，项包括：
  - IINA 打开（macOS）：`iina://weblink?url=<encoded>`；VLC：`vlc://<url>`；PotPlayer（Windows）：`potplayer://<url>`（`openPlayerScheme`）。
  - 下载 M3U 播放列表：本地生成 `#EXTM3U\n#EXTINF:-1,<name>\n<url>` Blob，下载为 `*.m3u8`（`downloadPlaylist`，文件名非法字符替换为 `_`）。
  - 复制 mpv 命令 / 复制 VLC 命令：`mpv "url"`（`quoteCommandArg` 转义引号反斜杠）。
  - 复制直链。
  - 菜单定位与排序菜单同款：fixed 定位、视口夹紧、点击外部/Esc/滚动关闭（`positionPlayerMenu`）。
- 对 dufs-solid：媒体优先前端几乎必做，纯前端零依赖。直链须走 withAccessToken（tokengen），确保带 token 的 URL 可被播放器直接拉流。现状：dufs-solid 无此功能 → 新增。
- 证据：/tmp/dufs-tabler-web/assets/index.js:843-905（含菜单项构造、scheme 表、M3U 生成、命令复制）。

### 3.3 dufs 原生断点续传上传队列 【通用】【高优先】
- 交互（tabler-web `index.js:403-595`）：
  - 全局 UploadManager：队列 + 双并发（MAX_PARALLEL_UPLOADS=2）、每项独立状态（queued/running/done/failed/canceled）、run() 递归调度。
  - 续传：detectOffset() 先 HEAD 目标，读 content-length 得已传字节；剩余部分 PATCH + X-Update-Range: append；从头传则 PUT。失败项显示「继续断点续传」按钮（retry() 重新探测 offset）。
  - 进度 UI：loaded/size + 百分比 + 实时速度（speed 按 250ms 节流）、进度条动画；导航栏「上传队列」按钮带数字徽标，点击滚动到队列面板。
  - beforeunload 守卫：有活跃上传时阻止离开（index.js:203-209）。
- 对 dufs-solid：dufs 无 tus 端点，唯一可行的断点续传就是这套 PATCH append 协议（官方前端同样如此，assets/index.js Uploader）。dufs-solid 已有 uploads store，建议对照补齐：重试即 HEAD 探测 offset、队列并发上限、进度速度展示、徽标、beforeunload。现状：已有上传组件 → 加强。
- 证据：/tmp/dufs-tabler-web/assets/index.js:457-595（detectOffset/send/进度/重试）；dufs 官方同款协议见 https://github.com/sigoden/dufs/blob/master/assets/index.js

### 3.4 搜索浮层 + 媒体类型过滤 【媒体/通用】【高优先】
- 交互（filebrowser components/Search.vue）：
  - 全屏浮层（body 滚动锁定、输入自动聚焦）；空输入时展示四个类型快捷块（图片/音乐/视频/PDF），点击即以 type:image 等前缀填充搜索框（boxes + init('type:'+k)）。
  - 结果列表增量加载（初始 50，滚到底 +50）；每次提交前 AbortController.abort() 取消旧请求，输入变化即 reset。
  - 结果项为 router-link，点击跳转到对应文件；搜索状态可停止（stop 按钮）。
- 对 dufs-solid：dufs 的搜索是服务端 ?q=（glob 匹配），前端只需发请求拿 Index JSON 即可实现同样的浮层；媒体类型过滤可以直接在客户端对 DATA.paths 按扩展名过滤（无需服务端支持）——这对媒体优先场景（快速筛出全部视频/漫画图片）价值极高。现状：dufs-solid 有 / 聚焦搜索 → 加强为浮层 + 类型 chips。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/components/Search.vue

### 3.5 冲突处理弹窗：保留/覆盖/重命名/跳过 【通用】
- 交互（filebrowser utils/upload.ts + resolve-conflict prompt）：上传/复制/移动/粘贴前先 checkConflict()：仅当拖入内容含嵌套路径（文件夹上传）才递归拉取目标目录树（fetchAll），普通平铺上传只拉目标目录一层——避免大目录下上传前全树遍历卡死 UI；逐项比对返回 origin/dest 的 size/mtime，弹窗给每项「保留 / 覆盖 / 重命名 / 跳过」复选；确认后按选择执行（复制时 rename 走服务端 rename 参数）。
- 对 dufs-solid：dufs 没有 rename-on-conflict 语义，但「覆盖 / 跳过」可以直接做（PUT/MOVE 前 HEAD 探测 + 弹窗选择）；重命名项可组合 MOVE 到 `name (1).ext`。建议至少实现「已存在 → 覆盖或跳过」二选一弹窗，避免 409/覆盖事故。现状：无 → 新增（简化版）。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/utils/upload.ts

### 3.6 大目录增量渲染 【媒体】【高优先】
- 交互（filebrowser FileListing.vue）：初始只渲染 50 项；setItemWeight() 估算每项占高；滚动到页面高度 75% 时按「2 屏数量」增量追加（scrollEvent throttle 100ms）；窗口 resize 时 fillWindow() 补足可视区域；revealPreviousItem() 在 reload 后把上次选中的项 scrollIntoView({block:'center'})。
- 对 dufs-solid：dufs 注入的 DATA.paths 可能是几千张漫画/照片的目录，一次性渲染卡片会卡。Svelte 5 里用 store + {#each} 切片即可低成本实现；媒体目录按需渲染 + 缩略图懒加载（IntersectionObserver）组合最佳。现状：无 → 新增。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/views/files/FileListing.vue（showLimit/fillWindow/scrollEvent/setItemWeight/revealPreviousItem）

### 3.7 智能排序细节：目录优先 + locale 感知 + 降序保目录 【通用】
- 交互（tabler-web index.js:1105-1128）：Intl.Collator(undefined, {numeric:true, sensitivity:'base'}) 做名称比较（数字后缀自然排序）；五种排序（smart/name/mtime/size/type）全部目录永远在前；降序时不是简单 reverse——先目录内反转再接文件反转，保证降序下目录仍整体在前。排序选择持久化 localStorage 且允许 URL 参数覆盖（?sort=&order= 可分享）。
- 对 dufs-solid：媒体目录里「文件夹在前」+「数字命名（p001、p002…）自然排序」对漫画/相册浏览是刚需。现状：可能已有排序 → 对照检查降序目录优先细节。
- 证据：/tmp/dufs-tabler-web/assets/index.js:1105-1128；index.js:18-24（五种模式文案）。

### 3.8 键盘选择模型：⇧范围、⌘ 多选、双击打开、Esc 清空 【通用】
- 交互（filebrowser ListingItem.vue + FileListing.vue）：单击选中；Ctrl/Cmd+单击 增删；Shift+单击 连续范围（从首个选中项到当前项补齐）；双击/Enter 打开；点击空白区清空选择（data-clear-on-click）；Esc 清空；Del 删除、F2 重命名（仅选中 1 项时）。移动端长按 500ms 进入选择（handleLongPress，位移 >10px 取消）。
- 对 dufs-solid：dufs-solid 已有长按选择，可补 Shift 范围选择 + Esc 清空 + 双击打开——桌面上「批量下载一沓漫画」最顺手的路径。现状：部分已有 → 加强。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/components/files/ListingItem.vue；FileListing.vue keyEvent。

### 3.9 上传/删除后视图位置恢复（preselect / revealPreviousItem）【通用】
- 交互（filebrowser stores/file.ts + FileListing.vue）：上传完成后 fileStore.preselect = 新路径，reload 后自动定位到新文件；预览删除当前文件后把邻近项 preselect 再回目录；updateRequest() 里按 url 重映射选中项，目录刷新后保持选中。
- 对 dufs-solid：Svelte 5 里可存「上次选中路径」，目录数据刷新后 scrollIntoView + 高亮。「向上回退高亮来源文件夹」已有（README），思路一致。现状：部分已有 → 加强。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/stores/file.ts

### 3.10 PDF 预览：object + iframe 双保险 + fragment 参数 【媒体】
- 交互（tabler-web index.js:1277-1300）：<object data="url#toolbar=1&navpanes=0&view=FitH"> 内嵌 iframe 兜底（object 渲染失败时浏览器仍显示 iframe）；底部提供「新窗口打开 / 下载」fallback 链接，提示「如果 PDF 仍然空白，说明当前浏览器不支持内嵌 PDF」。
- 对 dufs-solid：零依赖的 PDF 预览最优解；view=FitH 让漫画/横版 PDF 打开即适宽。现状：dufs-solid 可能已有 PreviewPane → 对照补 object 双保险 + fragment。
- 证据：/tmp/dufs-tabler-web/assets/index.js:1277-1300、withPdfFragment。

### 3.11 主题防闪烁内联脚本 【通用】
- 交互（tabler-web index.html:10-16）：<head> 顶部同步脚本读 localStorage['dufs-theme']，命中 light/dark 立即 document.documentElement.dataset.theme = theme，避免首帧闪白/闪黑；index.js:1161-1210 的切换按钮负责写回 + 跟随系统（matchMedia change 时若无存储则重绘图标）。
- 对 dufs-solid：SPA 里主题闪烁更明显，在 index.html 内联同一脚本即可（dufs-solid 已有主题系统 → 补内联防 FOUC）。现状：已有 → 小改。
- 证据：/tmp/dufs-tabler-web/assets/index.html:10-16。

### 3.12 原生视频播放器细节：MKV mimetype 修正 + 热键让步 【媒体】
- 交互（filebrowser VideoPlayer.vue）：.mkv 在 Chrome 无法按 video/x-matroska 播，把 sourceType 强制为 video/mp4（容器实际是 MP4 封装时可行）；播放器支持倍速（0.5–3）与快捷键 seek（±10s、音量 0.1 步进）；预览页左右键在视频播放时让位给播放器（Preview.vue key handler）。
- 对 dufs-solid：原生 <video> + controls 即可，但建议：a) 不设 preload 大文件（tabler-web 用 preload="metadata"），b) 记住每目录最后播放位置（dufs-solid ComicReader 已有按目录记忆模式，可推广到视频）。现状：已有原生预览 → 微调。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/components/files/VideoPlayer.vue；/tmp/dufs-tabler-web/assets/index.js:1260-1276（video/audio preload=metadata）。

### 3.13 图片查看器：缩放/拖拽/双击循环/捏合 【媒体】
- 交互（filebrowser ExtendedImage.vue）：scale 0.25–4；滚轮缩放、拖拽平移（movementX/Y）、双击在 1→2→4→1 循环（zoomAuto）；双指捏合（touch 距离增量/步进）、双指期间禁平移；maxScale = 原图尺寸/显示尺寸 + 4（支持 1:1 查看大图）；TIF/TIFF/DNG/CR2/NEF 用 UTIF 解码（decodeUTIF）。
- 对 dufs-solid：dufs-solid 已有 ImageStage，可对照补「双击循环缩放 + 捏合 + 1:1 上限」；UTIF 为可选（漫画/摄影库常见 TIFF 源图，值得）。现状：已有 ImageStage → 加强。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/components/files/ExtendedImage.vue

### 3.14 空目录三态文案 + 路径摘要 【通用】
- 交互（tabler-web index.js:663-698）：空状态区分「搜索无结果 / 空文件夹 / 上传时会自动创建文件夹」（PARAMS.q 优先判断）；目录顶部显示摘要「N 项 · X 个文件夹 · Y 个文件」；目录大小列显示子项数（>999 显示 >999，MAX_SUBPATHS_COUNT=1000，防注入数据过大）。
- 对 dufs-solid：媒体库「上传时会自动创建文件夹」文案对首次使用很重要（dufs 上传到不存在目录会自动建）。现状：未知 → 对照。
- 证据：/tmp/dufs-tabler-web/assets/index.js:663-698、index.js:1439-1447。

### 3.15 权限驱动的按钮显隐 【通用】
- 交互（tabler-web index.js:221-250）：DATA.allow_search/allow_upload/allow_archive/allow_delete 分别控制搜索框、上传组、打包下载、批量删除的显隐；allow_upload && allow_delete 才显示移动/编辑（dufs 语义：编辑/移动需要写权限+删除权限）；DATA.auth && DATA.user 才走 tokengen 下载流程。
- 对 dufs-solid：媒体服务器常 --allow-all，但只读分享场景会关写权限——按钮按权限显隐是必须的。现状：大概率已有 → 对照 dufs 语义细节（move/edit 需要 upload+delete 双权限）。
- 证据：/tmp/dufs-tabler-web/assets/index.js:221-250。

### 3.16 类型图标色板（CSS 变量按 kind 着色）【通用】
- 交互（tabler-web index.css:527-575）：tr[data-kind]/card[data-kind] 设 --icon-color（文件夹=主色、图片=绿、视频=紫、音频=橙、PDF=红、压缩包=黄、Office=蓝、文本=灰），图标颜色随类型一眼可辨。
- 对 dufs-solid：漫画/照片库里「按类型扫一眼」很实用；Svelte 里用 data-kind + 同一组 CSS 变量即可。现状：dufs-solid 有 Icon 组件 → 可加色板。
- 证据：/tmp/dufs-tabler-web/assets/index.css:527-575。

### 3.17 编辑器 dirty 守卫（beforeunload + 离开确认）【通用】
- 交互（filebrowser Editor.vue）：ACE 用 undoManager 判断 isClean()；未保存时 beforeunload 拦截 + 路由离开时弹「丢弃 / 保存并离开」；Ctrl+S 保存。tabler-web 简化版只做 beforeunload（index.js:203-209 复用上传守卫思路）。
- 对 dufs-solid：文本编辑页未保存离开提示是基本体验；Svelte 5 里可用 store 脏标记 + 导航拦截。现状：未知 → 建议补。
- 证据：https://github.com/filebrowser/filebrowser/blob/master/frontend/src/views/files/Editor.vue

---

## ④ 明确不适用 / 不建议搬

| 候选功能 | 来源 | 不搬原因 |
|---|---|---|
| ACE 编辑器（语法高亮/补全） | filebrowser Editor.vue | 违反 dufs-solid「无运行时 UI 库」约束；tabler-web 的 textarea + 预览 tab 已覆盖 99% 场景；可后续按需引轻量版 |
| video.js + hotkeys + mobile-ui | filebrowser VideoPlayer.vue | 原生 <video controls> + preload=metadata 已够；video.js 引入皮肤/语言包/约 200KB 成本，媒体优先场景收益低 |
| epubjs / vue-reader EPUB 阅读器 | filebrowser Preview.vue | 重依赖 + 只对 EPUB 有效；dufs-solid 已有 ComicReader，若做电子书可另议 |
| tus-js-client 分块上传 | filebrowser api/tus.ts | dufs 无 tus 端点；服务端协议是 PUT/PATCH append（官方 README API 一节），断点续传必须用 tabler-web/官方同款 PATCH 方案 |
| 服务端用户偏好（viewMode/排序/日期格式持久化） | filebrowser users.update | dufs 无用户数据库；用 localStorage + URL 参数（tabler-web 方案）即可，且隐私更轻 |
| 命令执行 Shell（enableExec） | filebrowser | 官方安全警告明确该功能漏洞丛生（#5199），绝不搬；dufs 本身也无此能力 |
| 自包含 JWT 会话模型 | filebrowser auth | 官方警告不可吊销（#5216）；dufs 用 HTTP auth + ?tokengen 查询 token，保持现状 |
| 二维码分享弹窗 | filebrowser views/Share.vue | 依赖 share 权限体系；dufs-solid 场景「复制直链」已够，二维码可作可选玩具 |
| Sidebar 磁盘用量进度条 | filebrowser Sidebar.vue | dufs 无 usage API；目录子项数（tabler-web 方案）是唯一能算的量 |
| 服务端递归预检（fetchAll）做上传冲突扫描 | filebrowser utils/upload.ts | dufs 无 recursive listing 端点（只有 ?simple/?json 单层）；冲突检测退化为「HEAD 目标存在性 + 覆盖/跳过」弹窗 |
| 跨目录 Copy（Ctrl+C/V 语义） | filebrowser clipboard | dufs 无服务端 copy（仅 MOVE）；复制=下载再上传的 hack 既不原子也费流量，不建议 |
| Vue/Pinia 组件体系（stores、hovers 弹窗栈） | filebrowser 前端 | 框架绑定；dufs-solid 用 Svelte 5 runes stores，借鉴的是交互语义而非代码 |
| prompt()/confirm() 原生对话框 | dufs 官方 / tabler-web（新建、移动） | 官方前端全用原生对话框（assets/index.js setupNewFolder 等），体验差；dufs-solid 已有 dialogs，维持现状 |
| iframe 全页预览（IFRAME_FORMATS） | dufs 官方 setupEditorPage | 无权限隔离语义（无 sandbox 时可直接导航）；tabler-web 按类型分别渲染 <img>/<video>/<audio>/<object> 更可控 |
| 多选下载为 zip 服务端打包 | filebrowser ?files=a,b&algo=zip | dufs 只支持单目录 ?zip；多选下载只能逐项（tabler-web 方案） |
| 移动端底部多选操作条 | filebrowser FileListing.vue:31-84 | dufs-solid 已有长按选择；底部操作条对漫画场景可做可不做，优先级低 |

不建议事项的共同点：要么是「重依赖/框架绑定」、要么是「dufs 服务端能力不支持所以落地成本高」、要么是「安全模型问题」。交互设计可以抄，协议栈必须留在 dufs 能力圈内。

---

## 附：证据 URL 清单

1. dufs-tabler-web 本地文件（行号见正文）：/tmp/dufs-tabler-web/assets/index.js（1537 行）、assets/index.html（82 行）、assets/index.css（1084 行）、README.md
2. filebrowser 仓库：https://github.com/filebrowser/filebrowser（README 归档警告 + 安全注意事项；docs/README.md 功能清单）
3. filebrowser 前端：https://github.com/filebrowser/filebrowser/tree/master/frontend/src（package.json 依赖清单；views/files/FileListing.vue、Preview.vue、Editor.vue；components/files/ListingItem.vue、VideoPlayer.vue、ExtendedImage.vue、CsvViewer.vue；components/Search.vue、Sidebar.vue、ContextMenu.vue；stores/file.ts、upload.ts、layout.ts；api/files.ts、api/tus.ts；utils/upload.ts、url.ts、constants.ts）
4. dufs 官方前端：https://github.com/sigoden/dufs/tree/master/assets（index.html、index.js）
5. dufs 能力边界：https://github.com/sigoden/dufs（README「Features」「API」；--allow-* 参数）

---

（整体结论一句话：媒体优先的 dufs-solid 应优先搬 filebrowser 的「预览画廊 + 增量渲染 + 键盘选择」与 tabler-web 的「外部播放器菜单 + PATCH 断点续传队列 + 权限驱动 UI」，避开一切重依赖与 dufs 不支持的协议。）
