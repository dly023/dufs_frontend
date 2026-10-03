# material-assets vs dufs-solid 对照报告

> 调研日期：2026-10-03
> 对照对象：[material-assets](https://github.com/TransparentLC/dufs-material-assets)（Vue 3 + Vuetify）→ dufs-solid（Svelte 5 + Vite）
> material-assets 路径：`/Users/admin/Downloads/dufs-material-assets-master`
> dufs-solid 路径：`/Users/admin/dufs-solid`

---

## 1. material-assets 总览

### 技术栈

| 层面 | 选型 |
|------|------|
| 框架 | Vue 3 (Composition API, `<script setup>`) |
| UI 库 | Vuetify 3 (Material Design, `<v-*>`) |
| 路由 | vue-router 4 |
| i18n | petite-vue-i18n |
| 构建 | Vite 7 + `vite-plugin-vue` + `vite-plugin-vuetify` + `lightningcss` |
| Markdown | marked + marked-highlight |
| 代码高亮 | PrismJS（~25 种语言，已 inline 字体） |
| 数学公式 | https://i.upmath.me/ 远程 SVG API |
| 音视频元数据 | jsmediatags（本地 `mami-chan/` 封装，Fetch + arrayBuffer 解析 ID3/MP4） |
| 图标 | Material Design Icons (`@mdi/js`) — SVG 通过 Vuetify 渲染 |
| 压缩 | terser（aggressive unsafe options） |

### 文件布局

```
src/
  main.js             ← 入口，挂载 Vue app、Marked、Prism、plugin 注册
  app.vue             ← 根组件（v-app-bar + v-main + router-view + footer）
  common.js           ← 全局工具：ext图标颜色、格式函数、预览区类型集合
  vuetify.js          ← Vuetify 配置（图标别名、主题色、MDI 图标）
  router.js           ← 单路由 /:path(.*)* → filelist.vue
  i18n.js             ← 四语言（en/zh-CN/zh-HK/zh-TW）
  uploader.js         ← Uploader 类（Semaphore 并发控制、XHR 进度）
  marked-renderer.js  ← Marked 自定义渲染器（LaTeX 数学公式、行号代码块）
  mami-chan/          ← 内联 jsmediatags（ID3/MP4 元数据读取器）
  components/
    filelist.vue      ← **唯一组件**——1537 行，所有功能集于一身
  plugins/
    dialog.js/vue     ← 全局弹窗插件（alert/confirm/prompt + Promise 版）
    snackbar.js/vue   ← 全局 Toast 插件（success/info/error/warning）
```

### API 交互

- 全部通过 `dufsfetch()` 封装（检查 status ≥ 400 抛错、自动 toast）
- Upload 用 XHR（支持进度），其它所有操作用 `fetch`
- 鉴权：仅调用 `CHECKAUTH` / `LOGOUT` 非标准 method（Vite dev proxy 对这些不友好）
- Token 下载链接：`GET <path>?tokengen` → `?token=...` 复制到剪贴板

---

## 2. 逐功能对照表

### 2.1 浏览/视图

| 功能 | material-assets | dufs-solid | 差距 / 借鉴点 |
|------|-----------------|------------|---------------|
| **文件列表** | 表格视图（v-table + thead/tbody），每行图标+名称+时间+大小+操作列 | 三种视图：Gallery（分区卡片）、Grid（方形网格）、List（紧凑表格） | dufs-solid 多视图远超。material-assets 的表头可点排序（名称/时间/大小），且分页可选 |
| | filelist.vue template | GalleryView.svelte + GridView.svelte + ListView.svelte | |
| **排序** | 点击列头循环：表头名→升→降→默认 | 点击列头：升→降，再点回到 name asc | dufs-solid 更合理，不丢方向 |
| | filelist.vue | stores/prefs.svelte.ts (toggleSort) | |
| **分页** | 可选（config.limit），v-pagination 翻页，长按可跳页 | 前 N 条 + 滚动 nearEnd 哨兵「加载更多」 | dufs-solid 渐进加载对大目录更友好 |
| **目录树** | 无 | 左侧栏可展开/折叠目录树，懒加载、自动定位当前目录、窄屏抽屉 | dufs-solid 独有 |

### 2.2 预览

| 格式 | material-assets | dufs-solid | 差距 |
|------|-----------------|------------|------|
| **图片** | `<img>` 在 v-dialog 内，仅居中显示 | ImageStage.svelte 全屏 lightbox：缩放1-8x、旋转、拖拽翻页、全屏 API、邻近预取、闲时淡出工具条、动画过渡 | dufs-solid 远超 |
| **视频** | `<video>` 标签 | 倍速4档、字幕自动转换(SRT→VTT)+首选、继续播放位置、Media Session | dufs-solid 更丰富 |
| **音频** | 顺序/随机/循环、jsmediatags 标题/艺术家/专辑/封面、Media Session | 顺序/单曲/随机模式、封面自动检测、LS 持久化播放模式 | 功能相当，material-assets 有元数据展示 |
| **PDF** | `<embed>` 嵌入浏览器 PDF 查看器 | 同 | 相同 |
| **Markdown** | marked + Prism 高亮 + 远程 LaTeX 数学公式图片 | marked + DOMPurify 清洗 + markdownEnhance | material-assets 有 LaTeX，dufs-solid 有安全清洗 |
| **文本/代码** | PrismJS 25+语言高亮+行号 | 自研三解析器(code/csv/json)+CSV表格+日志级别色标+编码检测+截断指示 | material-assets 语言多；dufs-solid 有 CSV/日志特色 |
| **JSON/JSONL** | 无专门支持 | 专用 JSONL 预览：紧凑/展开、行号、逐行语法高亮、无效行标记 | dufs-solid 独有 |
| **字体** | 动态 @font-face + 字号/字重滑杆 + 斜体 | 可变轴滑杆+fvar、cmap覆盖率分桶、瀑布流7档、字符表+缺字标记、深/浅纸色 | dufs-solid 远超 |
| **README** | 仅 README.md/txt + 展开 | 6级匹配链(readme.md>说明.md>license>任意.md>任意.txt)、多文档切换 | dufs-solid 匹配更灵活 |

### 2.3 上传

| 功能 | material-assets | dufs-solid | 差距 |
|------|-----------------|------------|------|
| 基本上传 | PUT 并发 5 | PUT 并发 3 | 相当 |
| 拖拽上传 | 支持递归目录 | 支持递归目录 | 相当 |
| 上传管理 | 浮动菜单列表+进度/速度/取消 | 独立面板+环形进度+取消/重试/全部取消/清除完成 | dufs-solid 更完整 |

### 2.4 文件操作

| 功能 | material-assets | dufs-solid | 差距 |
|------|-----------------|------------|------|
| 新建文件夹 | MKCOL + 重名校验 | MKCOL + prompt | 相同 |
| 新建文件 | 注释掉(v-if=false)，TODO | 无 | 两者都没实现 |
| **删除** | DELETE + 确认框 | **回收站**：MOVE→.trash/ + localStorage + 撤销 toast + 恢复/清空 | dufs-solid 远超 |
| **移动/重命名** | MOVE header | MOVE + **撤销 toast** | dufs-solid 有撤销 |
| 编辑文件 | textarea + 保存 + 换行切换 | textarea + **编码检测告警** + ⌘S | dufs-solid 更贴心 |
| **多选** | 无 | checkbox + Shift/⌘ + 全选，目录头变选择栏 | dufs-solid 独有 |
| **右键菜单** | 无 | 完整右键菜单：预览/阅读/编辑/下载/复制免密链接/重命名/移动/删除 | dufs-solid 独有 |

### 2.5 搜索

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|**本地过滤**|无|即时前端过滤（filter.svelte.ts）|dufs-solid 独有|
|**服务端搜索**|?json&q=|支持「此目录」和「全站」两种范围|dufs-solid 范围更多|

### 2.6 鉴权

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|登录|CHECKAUTH 触发浏览器 Basic 弹窗|Authorization header + 登录弹窗（非原生）+ 返回用户名|dufs-solid UX 好，不受浏览器拦截|
|登出|LOGOUT 非标准 method|清除本地凭据|dufs-solid 更可靠|
|**持久化**|无|sessionStorage 持久化，刷新仍登录|dufs-solid 独有|
|**受保护图片**|直链→401|fetchBlobUrl() 带 header→blob URL + LRU 缓存+revoke|dufs-solid 独有|
|**token下载链接**|tokengen → 手复制|tokengen + 自动拦截所有<a download>替换href|dufs-solid 更自动化|

### 2.7 分享/链接

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|复制链接|仅带 token 的下载链接|普通链接/路径/token 链接/二维码分享 (qrcode 库)|dufs-solid 更丰富|

### 2.8 快捷键

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|快捷键|无|/搜索、⌘K命令面板、⌫返回上级、R刷新、Space预览、Del回收站、←→翻页、F全屏、?帮助、Esc逐层退出|dufs-solid 独有|

### 2.9 移动端适配

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|响应式|Vuetify 断点|自研三档断点(820/640/420px)、侧栏抽屉+遮罩、手机 Toast 底部|设计理念不同但效果相当|
|触摸|基本|长按选择、点击加选|dufs-solid 更完善|

### 2.10 主题/设计系统

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|主题|light/dark + 自定义 theme color|system/light/dark/oled 四种|dufs-solid 多 OLED|
|**自定义配置**|标题/LOGO/背景/页脚/毛玻璃/分页等全部可覆盖|无自定义入口|material-assets 独有|
|毛玻璃|appbar/filelist/readme/preview 都支持 backdrop-filter|无|material-assets 视觉效果更华丽|
|页脚|自动 Powered by dufs & dufs-material-assets|无|material-assets 独有|
|设计令牌|Vuetify 主题色|完整 OKLCH 色板、4px 栅格、字阶、圆角、阴影、动画时长、easing 曲线|dufs-solid 系统更细致|
|图标|MDI 100+ SVG 图标|自研 Lucide 风格 60+ SVG 图标，零依赖|dufs-solid 零外部依赖|
|动效|Vuetify 内置过渡|View Transitions API (hero变形、主题圆形展开)、compositor-only、reduced-motion 支持|dufs-solid 更现代|
|代码高亮|PrismJS 25+语言|自研三解析器 + 日志级别色标|dufs-solid 更轻量|

### 2.11 i18n

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|语言|en/zh-CN/zh-HK/zh-TW|仅中文|material-assets 已有完整 i18n，dufs-solid 下一步计划|

### 2.12 构建部署

|功能|material-assets|dufs-solid|差距|
|---|---|---|---|
|after-build|替换 href/src 为 __ASSETS_PREFIX__|同上 + favicon 缓存号 + __INITIAL_DATA__ try/catch 保护|dufs-solid 更健壮|
|嵌入构建|支持 DUFS_EMBED_FILENAME 环境变量|无|material-assets 支持嵌入 dufs 二进制|

---

## 3. 值得移植的具体细节

### 3.1 material-assets → dufs-solid 可以借鉴的

1. **音频元数据读取**（`mami-chan/index.js`，内联 jsmediatags）
   - dufs-solid 的 AudioPlayer 缺少元数据展示（标题、艺术家、专辑、封面）
   - 可以提取其 Fetch + ArrayBuffer 解析逻辑，转为纯前端 ID3/MP4 标签读取
   - 文件：`/Users/admin/Downloads/dufs-material-assets-master/src/mami-chan/index.js`

2. **自定义配置接口**（`window.__DUFS_MATERIAL_CONFIG__`）
   - 标题/LOGO/背景/页脚/主题色/毛玻璃/分页的可覆盖配置
   - dufs-solid 目前没有提供任何自定义入口
   - 入口：`app.vue` L15-30, `filelist.vue` glassmorphism computed

3. **数学公式渲染**（`marked-renderer.js` 远程 API）
   - `$...$` 和 `$$...$$` 内联/块级 LaTeX 通过 `https://i.upmath.me/svg/` 渲染
   - 文件：`/Users/admin/Downloads/dufs-material-assets-master/src/marked-renderer.js`

4. **原版「新建文件」**（`filelist.vue` L1450-1470 createFile 方法）
   - 虽然目前注释掉了，但逻辑是完整的：HEAD 检查存在 → PUT 创建
   - 文件：`/Users/admin/Downloads/dufs-material-assets-master/src/components/filelist.vue` L1450-1470

5. **登录时显示用户名**（`app.vue` / `filelist.vue` 顶栏）
   - material-assets 在顶栏右侧显示用户名/登录按钮
   - dufs-solid 以头像首字母显示，材料设计的用户图标风格可以参考

6. **页脚**（`app.vue` 自动 Powered by dufs + 自定义 Markdown）
   - 简单的"由 XXX 强力驱动"信息，dufs-solid 可以加上

### 3.2 dufs-solid 已超越、material-assets 可以学习的功能

1. **回收站机制**（`stores/trash.svelte.ts` + `actions/files.ts`）
   - MOVE 到 `.trash/` + localStorage 索引 + 撤销 toast

2. **目录树侧栏**（`shell/Sidebar.svelte`）
   - 懒加载展开、自动定位、窄屏抽屉

3. **View Transitions 动效**（`lib/motion.ts`）
   - Hero 变形、主题圆形展开、缩略图→大图过渡

4. **受保护目录图片**（`fetchBlobUrl` + LRU）

5. **自动 token 链接拦截**（`lib/dufs/authLinks.ts`）

6. **三位视图切换**（Gallery/Grid/List）

7. **条漫阅读器**（`ComicReader.svelte`，递归发现子目录图片）

---

## 4. 明确不建议搬的东西

### 4.1 Vuetify 体系（技术栈绑定的）

- ❌ `v-table`/`v-card`/`v-dialog`/`v-btn` 等 Vuetify 组件——dufs-solid 已有自研控制系统（`controls.css`）
- ❌ `vuetify.js` 中 100+ MDI 图标映射——dufs-solid 的零依赖图标系统更轻量
- ❌ Vuetify 主题（`useTheme`、`$vuetify.theme`）——dufs-solid 的 CSS 自定义属性 + OKLCH 色板更直接
- ❌ `vite-plugin-vuetify` + vite-plugin-html 构建时注入——dufs-solid 用 `after-build.js` 直接替换

### 4.2 重量级依赖

- ❌ PrismJS + 25 行组件导入（`prismjs` + 语言组件 ~100KB）——dufs-solid 自研三解析器（~13KB）更针对性
- ❌ `@mdi/js` 全套图标导入（`vuetify.js` 导入了 100+ 图标组件）——dufs-solid 60+ inline SVG 图标够了
- ❌ `petite-vue-i18n`——暂时 i18n 非必要

### 4.3 耦合设计

- ❌ **单组件 1537 行**（`filelist.vue`）——dufs-solid 已拆分为 20+ 独立组件/视图，按此重构得不偿失
- ❌ 远程 LaTeX API（https://i.upmath.me/）——可能下线或限流，需自行部署或本地渲染
- ❌ terser unsafe 压缩选项（`unsafe_*`）——对于 dufs 前端这种规模收益极低且不可靠
- ❌ 非标准 HTTP method（`CHECKAUTH`/`LOGOUT`）——dufs-solid 已用标准 `Authorization` header 替代

---

## 5. 总结

|维度|material-assets 优势|dufs-solid 优势|打平|
|---|---|---|---|
|技术栈|成熟生态（Vuetify）|零外部依赖、自研设计系统|—|
|特征覆盖|自定义配置、i18n、数学公式|回收站、多视图、目录树、缩略图认证、条漫、快捷键|音频播放、PDF、图片预览|
|代码组织|单组件 1537 行|模块化，组件/视图/store/action 分离|—|
|构建|支持嵌入 dufs 二进制|after-build 更健壮|—|
|移动端|Vuetify 响应式|自研断点 + 抽屉导航|—|
|动效|Vuetify 内置过渡|View Transitions + hero morph|—|

### 对 dufs-solid 下一步的建议（优先级从高到低）

1. **音频封面/元数据** → 提取 material-assets 的 `mami-chan` 读取逻辑
2. **自定义配置入口**（标题/LOGO/页脚/毛玻璃）→ 对接 `window.__DUFS_MATERIAL_CONFIG__` 风格
3. **数学公式渲染** → 可选的 `marked` 扩展
4. **i18n 英文**（HANDOFF 已列为下一步）
5. **新建文件** → 复制 material-assets 的 `createFile` (HEAD + PUT) 逻辑
