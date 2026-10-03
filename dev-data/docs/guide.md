# 使用指南

dufs 媒体前端的说明文档。这一段是较长的中文段落，用来检查行高与换行是否舒适：在宽屏下一行不宜过长，在窄屏下也不应出现奇怪的断行或者孤字。English words mixed in should wrap naturally too.

## 快速开始

1. 启动 dufs：`dufs ./data --allow-all`
2. 打开浏览器访问 <http://127.0.0.1:5000>
3. 按 <kbd>⌘</kbd> + <kbd>K</kbd> 打开命令面板
   - 嵌套列表第二层
     - 第三层

### 配置示例

```json
{ "port": 5000, "auth": ["admin:secret@/:rw"], "allowSearch": true, "ratio": 0.75, "tls": null }
```

```bash
# 启动并在后台运行
dufs /data --port 5000 --allow-all --assets ./dist &
echo "started on $PORT"
```

```ts
export function greet(name: string): string {
  // a comment
  return `hello, ${name}`;
}
```

## 待办

- [x] 画廊视图
- [x] 条漫阅读
- [ ] 虚拟滚动
- [ ] ~~旧的 Solid 版本~~

## 对照表

| 视图 | 适用场景 | 文件数 | 默认 |
| :--- | :---: | ---: | :---: |
| 画廊 | 图片、漫画 | 1500 | ✓ |
| 网格 | 混合文件 | 300 |  |
| 列表 | 文档、代码，以及需要按大小或修改时间排序、并且列很多的超宽表格内容 | 12 |  |

## 链接与图片

- 相对文件：[示例 JSON](./sample.json)，[事件日志](events.jsonl)
- 相对目录：[照片](../photos/)
- 本页锚点：[跳到待办](#待办)
- 外部链接：[dufs on GitHub](https://github.com/sigoden/dufs)

![一张相对路径的图片](../photos/shot-01.png)

> 引用：好的工具应该在你需要时出现，在你不需要时安静。
>
> —— 第二段引用

<details>
<summary>展开更多细节</summary>

这里是折叠的内容，支持 **加粗**、*斜体* 和 `行内代码`。

</details>

---

最后一段。
