# 数据结构内存动态演示 — 项目上下文与开发标准

> 本文件是项目的“上下文锚点”：新会话、新协作者（含 AI 助手）开始工作前，先读这一份即可恢复项目状态、教学口径与开发约定。
> 维护原则：架构、语义口径、界面约定发生变化时，同步更新本文件。
> 最后更新：2026-10-30

---

## 1. 项目定位

纯前端教学演示工具，面向考研 408 / 严蔚敏《数据结构》（C 语言版）的经典语义，把**内存块、地址、指针、元素移动**按步骤画出来。

- 无后端、无数据库、无构建工具、无依赖、无 `package.json`
- 原生 HTML + CSS + ES Module JavaScript
- 支持五种结构：数组 / 单链表 / 栈 / 循环队列 / 二叉树
- 双端界面：电脑端工作台 + 手机端 App 式单列布局
- 附带微信小程序 `web-view` 容器工程

非目标：不做真实 C 编译、不做算法题判题、不追求动画炫技；一切以“步骤可解释、语义符合教材”为优先。

---

## 2. 运行与测试

### 2.1 运行网页

ES Module 不能用 `file://` 直接打开（浏览器会拦截模块加载），需要本地静态服务器：

```powershell
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000/
```

也可以用 VS Code 的 Live Server 等任意静态服务器。

### 2.2 运行自检

四套 Node 自检脚本，直接运行（当前环境 Node v24，自动识别 ESM）：

```powershell
node tests/test.js
node tests/test-stack-queue.js
node tests/test-linked.js
node tests/test-binarytree.js
```

| 脚本 | 覆盖范围 | 当前结果 |
| --- | --- | --- |
| `tests/test.js` | 数组基础、栈/队列基础、代码模式、越界防御 | 42 PASS / 0 FAIL |
| `tests/test-stack-queue.js` | 栈/队列的教材语义、环形槽位、代码模式 | 73 PASS / 0 FAIL |
| `tests/test-linked.js` | 单链表插入/删除/查找、头插/尾插/建表、渲染、代码模式 | 136 PASS / 0 FAIL |
| `tests/test-binarytree.js` | 二叉树建树/删除/遍历/查找、树布局、真实动画回放 | 116 PASS / 0 FAIL |

自检脚本的特点：

- 自带 `FakeEl` 假 DOM，不依赖浏览器
- 使用**真实** `Renderer` 与 `Animator`（`setSpeed(0)` + `await playAll()`），能验证“动画播完后画面与内存一致”
- 修改任何结构层代码后，四套脚本必须全绿才算完成

---

## 3. 目录结构与职责

```
index.html                 页面骨架：应用栏、结构标签、舞台、停靠区、抽屉、手机栏、设备选择页
css/style.css              设计令牌 + 布局 + 组件 + SVG 样式 + 响应式
js/main.js                 应用入口 / 控制器：DOM、结构切换、执行、代码模式、外壳交互
js/i18n.js                 动态文案双语取值
js/core/Step.js            Step 契约与 makeStep
js/core/MemoryModel.js     抽象内存：块、地址分配、读写、快照/恢复
js/core/CommandParser.js   代码模式解析器（C 风格伪代码 → 指令 → Step）
js/core/Preprocessor.js    完整 C 代码的白名单提取与 for 移位模式识别
js/animation/Animator.js   动画引擎：装载、单步、自动播放、撤销、回滚
js/render/Renderer.js      SVG 渲染器：网格/竖排/链表/树四种布局
js/structures/ArrayDS.js       数组（连续内存）
js/structures/LinkedListDS.js  单链表（带头结点，地址不连续）
js/structures/StackDS.js       顺序栈
js/structures/QueueDS.js       循环队列
js/structures/BinaryTreeDS.js  二叉链表
tests/test*.js             四套 Node 自检
docs/architecture.md       本文件：架构与开发标准
README.md                  项目简介与运行说明
miniprogram/               微信小程序 web-view 容器工程
```

---

## 4. 架构与数据流

### 4.1 三层分工（必须遵守）

```
用户操作 / 代码
      │
      ▼
结构层 plan*       只“规划”：读取当前状态，产出 Step 数组
      │           不直接改内存、不碰画面
      ▼
Animator           唯一真正推进状态的地方：逐步消费 Step
      │           修改 MemoryModel → 调 Renderer 重绘 → 写日志 / 高亮代码行
      ▼
Renderer           只读 memory + structure.view()，纯绘制
```

关键推论：

- `plan*` 必须是**幂等规划**，可以在动画尚未执行时连续调用（代码模式一次规划多行）
- 结构形态变化（如链表挂链、数组 length++、栈 top++）放在 `STEP.META` 的 `run` 里，动画执行到那一步才生效
- 每个 `META` 应同时提供 `undo`，否则「上一步」无法回退

### 4.2 Step 契约（`js/core/Step.js`）

```js
makeStep(type, payload, text)  // text: { zh, en } | null
```

| 类型 | payload | 语义 |
| --- | --- | --- |
| `ALLOCATE` | 批量分配信息 | 构造结构时分配内存块 |
| `HIGHLIGHT` | `{ block }` | 高亮某块 |
| `UNHIGHLIGHT` | `{ block }` | 取消高亮 |
| `MOVE_VALUE` | `{ from, to }` | 值从 from 飞到 to（数组移位） |
| `SWAP` | `{ a, b }` | 交换两块的值 |
| `SET_VALUE` | `{ block, value }` | 写入值 |
| `CLEAR_VALUE` | `{ block }` | 清空值 |
| `COMPARE` | `{ block, value }` | 查找比较（高亮） |
| `RESULT` | `{ block, found }` | 查找结果（命中变绿） |
| `META` | `{ run, undo }` | 结构元数据/指针变化 |

### 4.3 撤销与回滚

- `Animator.history` 记录每一步执行前的内存快照 + 该步，用于「上一步」
- `loadSteps` 保存装载前的整体快照，动画异常时 `_recover()` 回滚
- `reset()` 递增 `generation`，让进行中的异步执行作废，避免“上一轮动画继续改内存”
- 切换结构 / 重置 / 重新运行代码，都必须先 `animator.reset()`

### 4.4 代码模式规划上下文

`CommandParser.buildSteps` 对链表、二叉树调用 `structure.planningContext()`，得到可变的规划期形态（`ctx`）：

- 链表：`{ chain, length }`，`plan*` 就地推进 `chain` / `next`
- 二叉树：`{ byIndex, rootIndex }`，`plan*` 就地推进映射

同时用 `sim`（块 id → 值）模拟内存，避免连续规划时读到尚未写入的旧值。
队列额外维护“规划期 `front`”，否则出队后的再次入队会写回旧槽位。

新增“形态会变”的结构时，必须提供 `planningContext()` 并让 `plan*` 接受 `ctx` 参数。

---

## 5. 全局硬性约定

### 5.1 教学语义（不可随意更改）

- 位序统一**从 1 开始**（严蔚敏教材口径）
- 数组物理下标从 0 开始，仅用于 `arr[i] = v` 这类代码；日志同时标注“第 i 个元素 / 下标 i-1”
- 单链表**带头结点**，第 1 个数据结点在头结点之后
- 栈 `top` 指向**栈顶元素的下一个空位**
- 循环队列**牺牲一个单元**判满：`(rear + 1) % MaxSize == front`
- 二叉树按**层序编号**：根为 1，第 i 号左孩子 2i、右孩子 2i+1
- 删除操作只把块标记 `meta.freed = true` 灰显，地址空间**不回收**（教学需要）

### 5.2 双语（强制）

- 所有面向用户的文案必须是 `{ zh, en }`，禁止只写一种语言
- HTML 静态文案：成对使用 `<span class="zh">` / `<span class="en">`，由 `body.lang-zh` / `body.lang-en` 控制显隐
- JS 动态文案：用 `i18n.t(text)` 按当前语言取值
- 日志、错误、Toast/alert、代码高亮说明、抽屉文案，全部遵守

### 5.3 防御性校验

- 结构层提供 `*Error(...)` 方法：非法时返回 `{ zh, en }`，合法返回 `null`，**不抛异常**
- UI 层用 `addLog(err, true)` 输出红色错误，不弹异常
- 代码模式错误由 `buildSteps` 收集为 `{ line, msg: { zh, en } }`，逐条打到日志
- 绝不静默截断；容量/上限触发时必须给出明确提示（如“多余的 N 个值已忽略”）

### 5.4 不回归

- 已完成的功能不得因重构而退化
- 每次改动后跑完四套测试（42 / 73 / 136 / 116）
- 测试失败先判断是代码 bug 还是断言过期，不允许直接改断言“凑绿”

### 5.5 提交与推送

- **只有用户明确说「提交并推送」时才执行 `git commit` / `git push`**；未说时只改代码
- 提交信息用英文 Conventional Commits：`feat:` / `fix:` / `refactor:`
- 当前环境是 PowerShell 5：不支持 `&&`、不支持 heredoc；用多条 `-m`：

```powershell
git add <具体文件>
git commit -m "feat: ..." -m "细节说明"
git push origin main
```

- 只 `git add` 具体文件，不用 `git add -A`
- 远程：`https://github.com/2090meng/data-structure.git`（`origin`，分支 `main`）

---

## 6. 各结构语义标准

### 6.1 数组（`ArrayDS`）

- 容量默认 8，构造时一次性 `allocateContiguous(capacity)`，地址从 `0x1000` 起、每槽 4 字节连续
- 槽位标签固定显示物理下标 `[0] .. [n-1]`
- 方法：`planSet / planSwap / planInsert / planDelete / planSearch`
- 插入：位序 `1..length+1`，从后往前 `MOVE_VALUE` 腾位；表满时报错
- 删除：位序 `1..length`，从前往后 `MOVE_VALUE` 覆盖
- 代码模式：`int arr[N] = {...}`、`arr[i] = v`（物理下标）、`insert(arr, i, v)`、`insert(arr, v)`、`remove/delete(arr, i)`、`search(arr, v)`

### 6.2 单链表（`LinkedListDS`）

- 带头结点；数据结点 `allocateOne(GAPS[...])`，`GAPS = [2,3,4]` 轮换，地址不连续
- `chain` 存数据结点 id（逻辑顺序），`next: Map<id, id|null>`；`length` 不含头结点
- 默认上限 `maxNodes = 8`

核心指针语义：

```c
// 按位序插入（p = GetElem(L, i-1)）
s->next = p->next;
p->next = s;

// 头插法（O(1)，新结点成为第 1 个）
s->next = L->next;
L->next = s;

// 尾插法（O(n)）
p = L;
while (p->next) p = p->next;
s->next = NULL;
p->next = s;

// 删除第 i 个
p = GetElem(L, i-1);
q = p->next;
p->next = q->next;
free(q);          // 画面只灰显，不回收
```

- `planInsert(pos, value)`：`pos ∈ 1..len+1`
- `planInsertHead(value)` / `planInsertTail(value)`：只需值，受 `maxNodes` 限制
- `planDelete(pos)`：`pos ∈ 1..len`
- `planSearch(value)`：沿 `next` 逐个比较
- `planBuildHead(values)`：结果与输入**相反**（3→2→1）
- `planBuildTail(values)`：用尾指针 `r` 保持输入顺序（1→2→3）
- 代码模式声明 `int L[N] = {...}`：按**尾插法**逐个建结点，`N` 不限制建表个数，实际上限是 `maxNodes`

### 6.3 栈（`StackDS`）

- 默认 `capacity = 8`，`slots` 连续分配，竖排渲染（栈底在下）
- `length` 即 `S.top`：空栈 0，栈满 `capacity`
- 入栈：先 `SET_VALUE` 写 `data[top]`，再 `META top++`
- 出栈：先 `HIGHLIGHT`，再 `META top--`，再 `CLEAR_VALUE`（读取值并清空），最后取消高亮
- `planPeek` 只读，不改变内容
- 空栈出栈 / 栈满入栈由 `popError` / `pushError` 拦截
- 代码模式：`push(s, v)`、`pop(s)`，简写 `push(v)` / `pop()`

### 6.4 循环队列（`QueueDS`）

- 默认容量 6 个槽位（可用 5 个元素）；`maxSize = capacity - 1`
- `front` 指向队头元素；`rear = (front + length) % capacity` 指向队尾的下一个空位
- 队空：`front == rear`；队满：`(rear + 1) % capacity == front`
- 入队：写 `Q.data[rear]`，再 `META rear = (rear+1)%N; length++`
- 出队：高亮队头 → 清空 → `META front = (front+1)%N; length--`
- `planFront` 只读
- 代码模式：`enqueue(q, v)`、`dequeue(q)`，简写 `enqueue(v)` / `dequeue()`
- 声明初始化值超过 `maxSize` 时，多余值忽略并明确提示

### 6.5 二叉树（`BinaryTreeDS`）

- 二叉链表，结点单独分配，`GAPS = [2,3,4]` 轮换，地址不连续
- 默认上限 `maxNodes = 15`
- 层序编号：根 1；第 i 号左右孩子 2i / 2i+1
- 空树时插入首结点即为根；否则必须指明父结点编号与左/右
- 插入：`s = malloc; s->data = e; s->lchild = s->rchild = NULL; p->lchild = s;`
- 删除：删除以第 i 号为根的整棵子树，父指针置 `NULL`；结点灰显、内存不回收
- 遍历：先序 / 中序 / 后序 / 层次，逐个 `HIGHLIGHT` + 日志
- 查找：按先序比较
- 代码模式：`int T[N] = {...}` 按层序建树；`insertLeft(T, i, v)` / `insertRight(T, i, v)`；`remove(T, i)`；`preorder/inorder/postorder/levelorder(T)`；`search(T, v)`

---

## 7. 代码驱动模式

### 7.1 处理流程

```
codeInput
  → Preprocessor.extract()   白名单提取 + for 移位模式识别，过滤 #include/printf/return 等
  → CommandParser.parse()    逐行解析为指令（大小写不敏感，// 注释，; 分隔）
  → resetAll(capacity)       重建结构；capacity = max(声明容量, 初始化个数, 1)
  → CommandParser.buildSteps()  按 structure.kind 分派，连续规划成 Step[]
  → animator.loadSteps()     装载后由用户单步 / 自动播放
```

要点：

- 上限：`CommandParser.MAX_COMMANDS = 100`、`Preprocessor.MAX_EXTRACT = 100`，超出会提示“仅提取前 N 条”
- 无法识别的语句静默忽略并计数，不报错
- 代码模式每次运行都从初始状态开始（先 `resetAll`）
- 栈/队列用 `setInitialLength(声明值个数)` 同步初始长度；链表/二叉树在 `buildSteps` 里实际建结点
- 数组 `for` 循环实现的移位，由 `Preprocessor` 识别为 `insert` / `remove`；其余循环语义不模拟

### 7.2 指令速查

数组：

```c
int arr[10] = {10, 20, 5};   // 声明 + 初始化（容量 10）
int arr[10];                 // 仅声明容量
arr[1] = 20;                 // 修改物理下标 1（第 2 个元素）
insert(arr, 2, 5);           // 在第 2 个位置插入
insert(arr, 5);              // 表尾追加
remove(arr, 1);              // 删除第 1 个（delete 同义）
search(arr, 5);              // 查找
swap(1, 3);                  // 交换第 1、3 个元素（简写）
```

链表：

```c
int L[8] = {10, 20, 30};     // 尾插建表 10 → 20 → 30
insert(L, 1, 5);             // 插到头结点之后（成为第 1 个）
remove(L, 2);                // 删除第 2 个结点
insertHead(L, 5);            // 头插法
insertTail(L, 99);           // 尾插法
buildHead(L, 1, 2, 3);       // 建表，结果 3 → 2 → 1
buildTail(L, 1, 2, 3);       // 建表，结果 1 → 2 → 3
search(L, 30);
```

栈 / 队列：

```c
push(s, 7);    pop(s);
enqueue(q, 7); dequeue(q);
```

二叉树：

```c
int T[15] = {10, 20, 30};    // 按层序建树
insertLeft(T, 2, 5);         // 第 2 号结点挂左孩子
insertRight(T, 2, 6);        // 挂右孩子
remove(T, 2);                // 删除子树
preorder(T); inorder(T); postorder(T); levelorder(T);
search(T, 50);
```

简写（省略变量名）：`set(i, v)`、`swap(i, j)`、`insert(i, v)`、`insert(v)`、`remove(i)`、`search(v)`、`push(v)`、`pop()`、`enqueue(v)`、`dequeue()`、`insertHead(v)`、`insertTail(v)`、`buildHead(v1, v2, ...)`、`buildTail(v1, v2, ...)`。

---

## 8. 界面规范

### 8.1 布局形态

| 形态 | 触发 | 结构 |
| --- | --- | --- |
| 电脑端 | `body.mode-desktop` | 顶部应用栏（品牌 + 结构标签 + 工具）→ 左侧窄操作栏 + 右侧主舞台（大画布 + 底部停靠区） |
| 手机端 | `body.mode-mobile` | 顶部结构标签换行 → 全宽画布 → 底部 4 按钮（操作/日志/代码/说明）→ 上滑 sheet |

- 设备选择页 `#entry.gate.is-open`：每次进入都显示，用户选“电脑端 / 手机端”；进入后可用右上角「切换设备」重新选择
- `setDevice(mode)` 会清掉桌面端拖拽留下的 `dock` 内联高度，并 `requestAnimationFrame` 后重绘、画布滚动复位

### 8.2 底部停靠区

- 高度 `clamp(250px, 32vh, 460px)`，`min-height: 140px`
- 分隔条 `#dock-resizer`：Pointer Events 拖拽（`setPointerCapture`），键盘 ↑/↓ 每次 24px
- 限制：最小 140px，最大为「舞台高度 − 240px」
- 日志字号 13.5px / 行高 1.8；代码 13.5px / 1.75

### 8.3 手机端细节

- 底部栏 `z-index: 41`；sheet 面板 `bottom: calc(50px + env(safe-area-inset-bottom))`，从按钮上方滑出
- sheet 最大高度 78vh；代码 sheet 固定 66vh 且纵向排列（输入 160px / 高亮 140px）
- 画布 `#memory-svg` 最小宽度 680px，宽结构需横向滚动（预留的交互设计）
- 打开 sheet 时 `body.sheet-open` + 遮罩 `#sheet-backdrop.is-open`；点遮罩 / Esc 关闭

### 8.4 主题与语言

- 深色默认；`body.theme-light` 覆盖令牌；主题写入 `localStorage['ds-theme']`
- 颜色统一走 CSS 变量（`--bg`、`--panel-bg`、`--border`、`--text`、`--accent`、`--alloc`、`--free`、`--highlight`、`--hit`、`--danger` 等），SVG 也跟随主题
- 语言：`body.lang-zh` / `body.lang-en`；顶部选择器与设备选择页选择器双向同步
- 语言与设备选择**不做持久化**：每次进入都询问设备，语言每次加载默认中文

### 8.5 新增结构时的界面接入点

1. `index.html`：顶部 `#structure-tabs` 增加 `<button data-structure="xxx">`；`#structure-select`（兼容用隐藏 select）补 `<option>`
2. `js/main.js`：`DEFAULT_CAPACITY`、`OPS`、`SAMPLES`、`STRUCT_NOTE` 各补一条
3. 说明抽屉可补对应“指令速查”段落（可选）

---

## 9. 新增数据结构的完整清单

以新增 `XxxDS` 为例，按顺序完成：

1. **结构层** `js/structures/XxxDS.js`
   - `this.kind = 'xxx'`
   - 构造时用 `allocateContiguous`（连续）或 `allocateOne`（不连续）
   - `*Error(...)` 返回双语错误或 `null`
   - `plan*` 只产出 Step；指针/元数据变化放入 `META { run, undo }`
   - `view()` 返回 `{ layout, title, pointers }`，`layout` 取值 `grid` / `column` / `linked` / `tree`
   - 形态会变的结构补 `planningContext()`
2. **入口** `js/main.js`
   - `import` 新类；`createStructure()` 增加分支
   - `DEFAULT_CAPACITY`、`OPS`、`SAMPLES`、`STRUCT_NOTE` 增加配置
   - `syncFields()` 的 `needIndex` / `needValue` 判断补充新操作
   - `execute()` 增加对应分支与参数校验
3. **代码模式** `js/core/CommandParser.js`
   - `_parseStmt` 增加指令语法（完整形式 + 简写）
   - `buildSteps` 增加 `case`，按 `kind` 分派
   - 能力边界要在注释与界面速查中写清楚
4. **预处理** `js/core/Preprocessor.js`
   - 若需要从完整 C 代码中提取新指令，补 `_PATTERNS`（`exact` 正则 + `fmt` 规范化）
5. **渲染** `js/render/Renderer.js`
   - 新布局时加 `LAYOUT_XXX` 常量与 `_renderXxx()`，在 `render()` 里按 `view.layout` 分派
   - 指针绘制沿用 `view.pointers`
6. **界面** `index.html` + `css/style.css`
   - 结构标签、说明、图例；如布局特殊再加样式
7. **测试** `tests/test-xxx.js`
   - 结构语义、步骤/日志顺序、防御分支、代码模式、预处理提取、真实动画回放（`setSpeed(0)`）
8. **文档** 更新本文件第 6、7 节与测试表

---

## 10. 微信小程序（`miniprogram/`）

方案：**移动网页 + `web-view`**，小程序只做容器，页面本体仍是仓库根目录的静态网页。

- `project.config.json`：`appid` 目前是 `touristappid`（游客模式），正式发布需替换为真实 AppID
- `pages/index/index.wxml`：`<web-view src="{{url}}"></web-view>`
- `pages/index/index.js`：`WEB_URL` 必须改成**已备案的 https 地址**（不能是 localhost / 内网 IP / 未备案域名）

上线前提：

1. 把网页部署到已备案的 https 域名
2. 微信公众平台 → 设置 → 业务域名，添加该域名，并把校验文件放到域名根目录
3. 个人主体小程序**不支持配置业务域名**，因此无法使用 `web-view`（需企业/组织主体）

手机端页面已按小程序内置浏览器的窄屏与安全区适配（`env(safe-area-inset-bottom)`、底部 4 按钮布局）。

---

## 11. 测试约定

- 使用真实 `Renderer` / `Animator`，不用 mock
- 常用工具：`FakeEl`、`assertEq`、`applySteps`
- 动画验证用 `animator.setSpeed(0)` + `await animator.playAll()`
- 断言要同时覆盖“数据结构内部状态”和“画面块数/连线/指针”
- 新增功能必须新增用例；修复 bug 必须留下防回归用例

---

## 12. 已知限制与后续可做项

已知限制（当前设计取舍，不是 bug）：

1. 删除只灰显不回收内存（地址只增不减），重置会重建内存
2. 代码模式不是编译器：不模拟 `for` / `while` / 函数调用的真实控制流；仅白名单指令 + 特定数组移位模式识别
3. 元素值仅支持整数
4. 容量/上限固定：数组 8、链表 8 结点、栈 8、队列 6 槽（可用 5）、二叉树 15 结点；数组/栈/队列的容量可被 `int x[N]` 声明覆盖，链表/二叉树的结点上限不可覆盖
5. 手机端画布最小宽 680px，宽结构需横向滚动
6. 矮窗口（如 641×432）需要滚动才能看全左栏与日志
7. 语言、设备选择不持久化
8. 小程序 `web-view` 受备案域名与主体类型限制

可做但需先确认：

- 小程序 `WEB_URL` 替换为真实备案域名、配置业务域名、真机验证
- 撤销/重做栈的持久化或导出
- 更多结构（串、图、排序过程等）
- 移动端真机（微信内置浏览器）细节调优

---

## 13. 协作约定（用户偏好）

- 用户通常在确认效果后才说「提交并推送」；**未说就不提交**
- 用户要求“有问题就问”，涉及产品取舍（布局、交互、端形态）时先问再做
- 界面文案保持中文为主、可切英文；代码注释用中文
- 用户反馈中的既有决定：
  - 设备选择：**每次进入都询问**
  - 手机布局：**App 式单列**
  - 小程序方式：**移动网页 + web-view**
  - 底部日志/代码区要足够大，可拖拽调整
- 完成任务后的固定动作：跑四套测试 → 报告结果 → 等用户确认 →（用户说提交并推送）→ 提交推送

---

## 14. 变更记录（截至 2026-10-30）

```
211d4aa feat: add device picker and a mobile layout for WeChat web-view
31568c9 fix: enlarge the bottom log and code dock
c3161dd refactor: redesign the UI into a workbench layout
e464092 feat: add head and tail insertion for the singly linked list
2d3800c feat: add binary tree with linked representation and tree layout
4eeb4cf feat: add singly linked list with head node and chain-style rendering
4725fd9 feat: add responsive layout for tablets and phones
32b6efc refactor: align stack/queue semantics with 408 textbook conventions
167f4cf feat: add stack and queue with vertical/horizontal rendering
415720b feat: add step-back undo and logic test script
c6141ae feat: add shorthand commands and swap animation
4839af3 feat: recognize C-style array shift insert/remove in code parser
```

远程 `origin/main` 已同步到 `211d4aa`；本文件（`docs/architecture.md`）与 `README.md`、`tests/` 目录为本次整理新增，尚未提交。
