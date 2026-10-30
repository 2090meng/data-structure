# 数据结构内存动态演示

一个面向考研 408 / 严蔚敏《数据结构》（C 语言版）的纯前端教学工具。它把数组、链表、栈、队列、二叉树的**内存块、地址、指针和元素移动**按教材语义逐步画出来，帮助理解“代码执行时内存到底发生了什么”。

无后端、无构建工具、无第三方依赖，直接用浏览器运行。

## 功能亮点

- **五种数据结构**：数组、带头结点的单链表、顺序栈、循环队列、二叉链表。
- **教材语义**：位序从 1 开始；栈顶 `top` 指向下一个空位；循环队列牺牲一个单元判满；链表结点地址不连续；二叉树按层序编号。
- **逐步动画**：每次操作拆成可解释的步骤，支持单步、自动播放、上一步和速度调节。
- **代码驱动**：输入 C 风格伪代码或粘贴完整 C 代码，自动提取有效指令、逐行高亮执行。
- **链表专项**：支持头插法、尾插法，以及 `buildHead` / `buildTail` 建表，直观看到结果顺序的差异。
- **中英双语**：界面和日志均可切换中文 / English。
- **双端适配**：进入前可选择电脑端或手机端；手机端为 App 式单列布局，适配微信内置浏览器。
- **小程序容器**：附带微信小程序 `web-view` 工程骨架。
- **自动化自检**：四套 Node 脚本覆盖结构语义、渲染布局、动画回放与代码模式。

## 如何运行

ES Module 不能通过 `file://` 直接打开，需要本地静态服务器：

```powershell
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。

也可以用 VS Code 的 Live Server 等任意静态服务器。

进入页面后先在设备选择页选择「电脑端」或「手机端」，之后可用右上角「切换设备」重新选择。

## 运行测试

需要 Node.js（当前环境为 v24，可直接运行 ESM）：

```powershell
node tests/test.js
node tests/test-stack-queue.js
node tests/test-linked.js
node tests/test-binarytree.js
```

| 脚本 | 覆盖范围 | 当前结果 |
| --- | --- | --- |
| `tests/test.js` | 数组基础、栈/队列基础、代码模式、越界防御 | 42 PASS / 0 FAIL |
| `tests/test-stack-queue.js` | 栈/队列教材语义、环形槽位、代码模式 | 73 PASS / 0 FAIL |
| `tests/test-linked.js` | 单链表增删查、头插/尾插/建表、渲染、代码模式 | 136 PASS / 0 FAIL |
| `tests/test-binarytree.js` | 二叉树建树/删除/遍历/查找、树布局、真实动画回放 | 116 PASS / 0 FAIL |

## 目录结构

```
index.html              页面入口
css/style.css           主题、布局与 SVG 样式
js/main.js              应用控制器
js/core/                内存模型、Step 契约、代码解析与预处理
js/animation/           动画引擎
js/render/              SVG 渲染器
js/structures/          五种数据结构
tests/                  Node 自检脚本
docs/architecture.md    架构、教学口径与开发标准
miniprogram/            微信小程序 web-view 容器
```

## 微信小程序

`miniprogram/` 采用「移动网页 + `web-view`」方案，小程序只作为容器。

上线前需要：

1. 将网页部署到已备案的 https 域名；
2. 修改 `miniprogram/pages/index/index.js` 中的 `WEB_URL`；
3. 在微信公众平台配置业务域名并放置校验文件。

注意：个人主体小程序不支持配置业务域名，无法使用 `web-view`。

## 更多文档

- [架构与开发标准](docs/architecture.md)：分层架构、Step 契约、各结构语义、指令速查、界面规范、扩展清单与已知限制。
