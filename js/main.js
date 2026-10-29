/**
 * main.js — 应用入口 / 控制器。
 *
 * 职责：绑定界面事件，把用户输入转成操作指令，
 * 串联「数据结构层 → 动画层 → 渲染层」三部分，并维护日志与语言状态。
 *
 * 当前支持四种结构：数组 Array / 链表 Linked List / 栈 Stack / 队列 Queue。
 * 切换结构会重建内存与结构对象，操作项（下拉框）随之动态变化。
 */
import { i18n } from './i18n.js';
import { MemoryModel } from './core/MemoryModel.js';
import { Renderer } from './render/Renderer.js';
import { Animator } from './animation/Animator.js';
import { ArrayDS } from './structures/ArrayDS.js';
import { LinkedListDS } from './structures/LinkedListDS.js';
import { BinaryTreeDS } from './structures/BinaryTreeDS.js';
import { StackDS } from './structures/StackDS.js';
import { QueueDS } from './structures/QueueDS.js';
import { CommandParser } from './core/CommandParser.js';
import { Preprocessor } from './core/Preprocessor.js';

// ---------- 1. 初始化语言 ----------
i18n.setLang('zh');
document.body.classList.add('lang-zh');

// ---------- 2. 获取 DOM 元素 ----------
const svg = document.getElementById('memory-svg');
const structureSelect = document.getElementById('structure-select');
const opSelect = document.getElementById('op-select');
const indexInput = document.getElementById('index-input');
const valueInput = document.getElementById('value-input');
const indexField = document.getElementById('index-field');
const valueField = document.getElementById('value-field');
const executeBtn = document.getElementById('execute-btn');
const stepBtn = document.getElementById('step-btn');
const stepBackBtn = document.getElementById('step-back-btn');
const playBtn = document.getElementById('play-btn');
const resetBtn = document.getElementById('reset-btn');
const langSelect = document.getElementById('lang-select');
const logList = document.getElementById('log-list');
const codeInput = document.getElementById('code-input');
const runCodeBtn = document.getElementById('run-code-btn');
const extractBtn = document.getElementById('extract-btn');
const codeView = document.getElementById('code-view');
const speedSelect = document.getElementById('speed-select');

// ---------- 3. 创建核心对象 ----------
let memory = new MemoryModel();
const renderer = new Renderer(svg);
let structure = null;       // 当前数据结构对象（ArrayDS / StackDS / QueueDS）
let structKind = 'array';   // 当前结构类型

const animator = new Animator(
  memory,
  renderer,
  (text) => addLog(text),
  (line) => setActiveLine(line),
  (msg) => addLog({ zh: '执行出错：' + msg, en: 'Error: ' + msg }, true),
  (busy) => setBusy(busy)
);

// 速度档位（毫秒）→ 与 HTML 中 speed-select 的 option value 对应
const SPEED_MAP = { slow: 800, normal: 400, fast: 100, instant: 0 };

// 各结构的默认容量
const DEFAULT_CAPACITY = { array: 8, linked: 8, stack: 8, queue: 6, binarytree: 15 };

// 各结构支持的操作项（value -> 中英标签）
const OPS = {
  array: [
    ['insert', '插入 Insert'],
    ['delete', '删除 Delete'],
    ['set', '修改/赋值 Set'],
    ['search', '查找 Search'],
  ],
  linked: [
    ['insert', '插入 Insert'],
    ['insertHead', '头插法 Head Insert'],
    ['insertTail', '尾插法 Tail Insert'],
    ['delete', '删除 Delete'],
    ['search', '查找 Search'],
  ],
  stack: [
    ['push', '入栈 Push'],
    ['pop', '出栈 Pop'],
    ['peek', '取栈顶 Peek'],
    ['search', '查找 Search'],
  ],
  queue: [
    ['enqueue', '入队 Enqueue'],
    ['dequeue', '出队 Dequeue'],
    ['front', '查看队头 Front'],
    ['search', '查找 Search'],
  ],
  binarytree: [
    ['insertLeft', '插入左孩子 Insert Left'],
    ['insertRight', '插入右孩子 Insert Right'],
    ['delete', '删除子树 Delete'],
    ['search', '查找 Search'],
    ['preorder', '先序遍历 Preorder'],
    ['inorder', '中序遍历 Inorder'],
    ['postorder', '后序遍历 Postorder'],
    ['levelorder', '层次遍历 Level-order'],
  ],
};

// 各结构的示例代码
const SAMPLES = {
  array: `#include <stdio.h>

int main() {
    // 1. 初始化一个容量为 8 的数组，目前有 5 个有效元素
    int arr[8] = {10, 20, 30, 40, 50};
    int length = 5;
    int capacity = 8;

    // 操作 1：在下标 2（即第 3 个位置）插入元素 99
    for (int i = length; i > 2; i--) {
        arr[i] = arr[i - 1]; // 从后往前挪，腾出空间
    }
    arr[2] = 99;
    length++; // 长度加 1

    // 操作 2：删除第 2 个元素（下标 1，即 20）
    for (int i = 1; i < length - 1; i++) {
        arr[i] = arr[i + 1]; // 从前往后挪，覆盖被删除的元素
    }
    length--; // 长度减 1

    // 打印最终结果（打印语句会被忽略）
    printf("最终数组内容: ");
    for (int i = 0; i < length; i++) {
        printf("%d ", arr[i]);
    }
    printf("\\n");

    return 0;
}`,
  linked: `#include <stdio.h>

int main() {
    // 单链表：带头结点，每个结点单独 malloc，地址不连续
    int L[8] = {10, 20, 30};   // 尾插法依次建立 10 -> 20 -> 30

    insertHead(L, 5);   // 头插法：s->next = L->next; L->next = s;  链表变 5 -> 10 -> 20 -> 30
    insertTail(L, 99);  // 尾插法：p 走到表尾；s->next = NULL; p->next = s;
    insert(L, 3, 88);   // 在第 3 个位置前插入 88
    remove(L, 2);       // 删除第 2 个结点：p->next = q->next; free(q);
    search(L, 30);      // p = p->next 逐个比较

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  stack: `#include <stdio.h>

int main() {
    // 顺序栈：MaxSize = 8，S.top 指向下一个空位，后进先出 LIFO
    int st[8] = {10, 20, 30};

    push(st, 40);   // S.data[S.top] = 40; S.top++（栈顶指针上移）
    push(st, 50);   // S.data[S.top] = 50; S.top++
    pop(st);        // S.top--; e = S.data[S.top]（弹出 50）
    push(st, 60);   // S.data[S.top] = 60; S.top++

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  queue: `#include <stdio.h>

int main() {
    // 循环队列：MaxSize = 7，牺牲一个单元判满，最多存 6 个元素
    int q[7] = {10, 20, 30};

    enqueue(q, 40);  // 入队：Q.data[Q.rear] = 40; Q.rear++
    dequeue(q);      // 出队：e = Q.data[Q.front]; Q.front++
    enqueue(q, 50);  // 入队 50
    enqueue(q, 60);  // 入队 60

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  binarytree: `#include <stdio.h>

int main() {
    // 二叉链表：每个结点单独 malloc，lchild / rchild 分别指向左右孩子
    // 初始化按层序序列建树：根 = 10，左孩子 20、右孩子 30，依此类推
    int T[15] = {10, 20, 30, 40, 50, 60, 70};

    insertLeft(T, 4, 80);   // 第 4 号结点（40）挂左孩子，成为第 8 号
    insertRight(T, 4, 90);  // 第 4 号结点（40）挂右孩子，成为第 9 号
    preorder(T);            // 先序遍历：根 → 左 → 右
    inorder(T);             // 中序遍历：左 → 根 → 右
    postorder(T);           // 后序遍历：左 → 右 → 根
    levelorder(T);          // 层次遍历：逐层从左到右
    search(T, 50);          // 先序查找
    remove(T, 2);           // 删除以第 2 号结点为根的整棵子树

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
};

// ---------- 4. 工具函数 ----------
/** 向日志区追加一条步骤说明（自动按当前语言翻译）。isError 为真时红色高亮。 */
function addLog(text, isError = false) {
  if (!text) return;
  const li = document.createElement('li');
  li.className = isError ? 'log-error' : '';
  const idx = document.createElement('span');
  idx.className = 'step-idx';
  idx.textContent = '[' + (logList.children.length + 1) + ']';
  li.appendChild(idx);
  li.appendChild(document.createTextNode(i18n.t(text)));
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

/** 清空日志。 */
function clearLog() {
  logList.innerHTML = '';
}

/** 动画忙碌时锁定按钮，防止连点导致状态错乱。 */
function setBusy(busy) {
  executeBtn.disabled = !!busy;
  runCodeBtn.disabled = !!busy;
  resetBtn.disabled = !!busy;
  stepBackBtn.disabled = !!busy;
}

/** 兜底错误处理：中断动画并输出红色错误日志。 */
function handleError(e) {
  animator.reset();
  try { renderer.render(memory); } catch (_) {}
  const msg = e && e.message ? e.message : String(e);
  addLog({ zh: '执行出错：' + msg, en: 'Error: ' + msg }, true);
}

/** 根据当前选择的操作类型，显示/隐藏对应输入项。 */
function syncFields() {
  const op = opSelect.value;
  const needIndex = op === 'insert' || op === 'delete' || op === 'set' || op === 'insertLeft' || op === 'insertRight';
  const needValue = op === 'insert' || op === 'set' || op === 'search' || op === 'push' || op === 'enqueue'
    || op === 'insertLeft' || op === 'insertRight' || op === 'insertHead' || op === 'insertTail';
  indexField.style.display = needIndex ? 'flex' : 'none';
  valueField.style.display = needValue ? 'flex' : 'none';
}

/** 解析整数输入（仅接受整数；空、非数字、小数一律返回 null）。 */
function parseIntValue(input) {
  const raw = input.value.trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

// ---------- 5. 结构构建 / 重置 ----------
function createStructure(kind, mem, capacity) {
  if (kind === 'linked') return new LinkedListDS(mem, capacity);
  if (kind === 'binarytree') return new BinaryTreeDS(mem, capacity);
  if (kind === 'stack') return new StackDS(mem, capacity);
  if (kind === 'queue') return new QueueDS(mem, capacity);
  return new ArrayDS(mem, capacity);
}

/** 重建内存与结构对象（不清理日志）。 */
function rebuild(kind, capacity) {
  structKind = kind;
  animator.reset();                      // 中断播放、清空队列
  memory = new MemoryModel();            // 重建内存
  structure = createStructure(kind, memory, capacity || DEFAULT_CAPACITY[kind] || 8);
  animator.memory = memory;              // 让动画引擎指向新内存
  renderer.setViewProvider(() => structure.view()); // 渲染层按结构决定布局与指针
  renderer.render(memory);
}

/** 重置为当前结构的初始状态（容量可被代码声明覆盖）。 */
function resetAll(capacity) {
  rebuild(structKind, capacity);
  clearLog();
  setActiveLine(null);
}

/** 按当前结构重建操作下拉框。 */
function syncOps() {
  const ops = OPS[structKind] || OPS.array;
  opSelect.innerHTML = '';
  for (const [value, label] of ops) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opSelect.appendChild(opt);
  }
  syncFields();
}

/** 切换数据结构：重建结构、刷新操作项与示例代码。 */
function switchStructure(kind) {
  rebuild(kind);
  syncOps();
  codeInput.value = SAMPLES[kind] || '';
  syncCodeView();
  clearLog();
  setActiveLine(null);
}

// ---------- 6. 执行操作 ----------
function execute() {
  try {
  animator.reset(); // 清掉上一次未播完的步骤

  // 清除上一次查找留下的绿色命中标记
  for (const b of memory.blocks.values()) b.hit = false;

  const op = opSelect.value;
  const index = parseIntValue(indexInput);
  const value = parseIntValue(valueInput);
  let steps = [];

  if (structKind === 'array') {
    if (op === 'insert') {
      if (index === null || value === null) return addLog({ zh: '请输入合法的位序和值', en: 'Invalid position or value' });
      if (index < 1 || index > structure.length + 1 || structure.length >= structure.capacity) {
        return addLog({ zh: `位序须在 1~${structure.length + 1} 之间且数组未满`, en: `Position must be in 1~${structure.length + 1} and array not full` });
      }
      steps = structure.planInsert(index, value);
    } else if (op === 'delete') {
      if (index === null) return addLog({ zh: '请输入合法的位序', en: 'Invalid position' });
      if (index < 1 || index > structure.length) {
        return addLog({ zh: `位序须在 1~${structure.length} 之间`, en: `Position must be in 1~${structure.length}` });
      }
      steps = structure.planDelete(index);
    } else if (op === 'set') {
      if (index === null || value === null) return addLog({ zh: '请输入合法的位序和值', en: 'Invalid position or value' });
      if (index < 1 || index > structure.length) {
        return addLog({ zh: `位序须在 1~${structure.length} 之间`, en: `Position must be in 1~${structure.length}` });
      }
      steps = structure.planSet(index, value);
    } else if (op === 'search') {
      if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
      if (structure.length === 0) return addLog({ zh: '数组为空，无法查找', en: 'The array is empty' });
      steps = structure.planSearch(value);
    }
  } else if (structKind === 'linked') {
    if (op === 'insert') {
      if (index === null || value === null) return addLog({ zh: '请输入合法的位序和值', en: 'Invalid position or value' });
      const err = structure.insertError(index);
      if (err) return addLog(err, true);
      steps = structure.planInsert(index, value);
    } else if (op === 'insertHead' || op === 'insertTail') {
      if (value === null) return addLog({ zh: '请输入合法的插入值', en: 'Invalid value' });
      const err = op === 'insertHead' ? structure.insertHeadError() : structure.insertTailError();
      if (err) return addLog(err, true);
      steps = op === 'insertHead' ? structure.planInsertHead(value) : structure.planInsertTail(value);
    } else if (op === 'delete') {
      if (index === null) return addLog({ zh: '请输入合法的位序', en: 'Invalid position' });
      const err = structure.deleteError(index);
      if (err) return addLog(err, true);
      steps = structure.planDelete(index);
    } else if (op === 'search') {
      if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
      const err = structure.searchError();
      if (err) return addLog(err, true);
      steps = structure.planSearch(value);
    }
  } else if (structKind === 'stack') {
    if (op === 'push') {
      if (value === null) return addLog({ zh: '请输入合法的入栈值', en: 'Invalid value' });
      const err = structure.pushError();
      if (err) return addLog(err, true);
      steps = structure.planPush(value);
    } else if (op === 'pop') {
      const err = structure.popError();
      if (err) return addLog(err, true);
      steps = structure.planPop();
    } else if (op === 'peek') {
      const err = structure.peekError();
      if (err) return addLog(err, true);
      steps = structure.planPeek();
    } else if (op === 'search') {
      if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
      if (structure.length === 0) return addLog({ zh: '栈为空，无法查找', en: 'The stack is empty' });
      steps = structure.planSearch(value);
    }
  } else if (structKind === 'queue') {
    if (op === 'enqueue') {
      if (value === null) return addLog({ zh: '请输入合法的入队值', en: 'Invalid value' });
      const err = structure.enqueueError();
      if (err) return addLog(err, true);
      steps = structure.planEnqueue(value);
    } else if (op === 'dequeue') {
      const err = structure.dequeueError();
      if (err) return addLog(err, true);
      steps = structure.planDequeue();
    } else if (op === 'front') {
      const err = structure.frontError();
      if (err) return addLog(err, true);
      steps = structure.planFront();
    } else if (op === 'search') {
      if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
      if (structure.length === 0) return addLog({ zh: '队列为空，无法查找', en: 'The queue is empty' });
      steps = structure.planSearch(value);
    }
  } else if (structKind === 'binarytree') {
    if (op === 'insertLeft' || op === 'insertRight') {
      if (index === null || value === null) return addLog({ zh: '请输入合法的父结点位序和值', en: 'Invalid parent index or value' });
      const side = op === 'insertLeft' ? 'L' : 'R';
      const err = structure.insertError(index, side);
      if (err) return addLog(err, true);
      steps = structure.planInsert(index, side, value);
    } else if (op === 'delete') {
      if (index === null) return addLog({ zh: '请输入合法的结点位序', en: 'Invalid node index' });
      const err = structure.deleteError(index);
      if (err) return addLog(err, true);
      steps = structure.planDelete(index);
    } else if (op === 'search') {
      if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
      const err = structure.searchError();
      if (err) return addLog(err, true);
      steps = structure.planSearch(value);
    } else if (op === 'preorder' || op === 'inorder' || op === 'postorder' || op === 'levelorder') {
      const err = structure.traversalError();
      if (err) return addLog(err, true);
      steps = structure['plan' + op.charAt(0).toUpperCase() + op.slice(1)]();
    }
  }

  if (!steps.length) return;

  clearLog();
  animator.loadSteps(steps);
  renderer.render(memory);
  animator.playAll(); // 立即运行动画，让输入结果直接显示在内存块上
  } catch (e) {
    handleError(e);
  }
}

// ---------- 7. 代码驱动模式 ----------

/** 把代码文本框内容镜像成带行号的代码视图（供执行时高亮）。 */
function syncCodeView() {
  const lines = codeInput.value.split('\n');
  codeView.innerHTML = '';
  lines.forEach((txt, i) => {
    const row = document.createElement('div');
    row.className = 'code-line';
    row.dataset.line = i + 1;
    const num = document.createElement('span');
    num.className = 'code-line__num';
    num.textContent = i + 1;
    const body = document.createElement('span');
    body.className = 'code-line__body';
    body.textContent = txt !== '' ? txt : ' ';
    row.appendChild(num);
    row.appendChild(body);
    codeView.appendChild(row);
  });
}

/** 高亮代码视图中的某一行（line 为 null 时清除高亮）。 */
function setActiveLine(line) {
  const rows = codeView.querySelectorAll('.code-line');
  rows.forEach((el) => {
    el.classList.toggle('active', line != null && Number(el.dataset.line) === line);
  });
  if (line != null) {
    const target = codeView.querySelector('.code-line[data-line="' + line + '"]');
    if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/** 解析并装载代码，生成动画步骤（每次从初始结构状态开始运行）。 */
function runCode() {
  try {
  syncCodeView();

  // 先清洗 + 跨行模式识别：把 for 循环实现的数组移位识别为 insert / remove。
  const cleaned = Preprocessor.extract(codeInput.value);

  const { commands, declaration, truncated } = CommandParser.parse(cleaned.output);

  // 声明决定容量（取结构默认容量，且不小于初始化元素个数）
  const baseCap = DEFAULT_CAPACITY[structKind] || 8;
  const capacity = declaration ? Math.max(declaration.capacity, declaration.values.length, 1) : baseCap;
  resetAll(capacity);
  // 代码模式从“声明初始化”开始：让结构内部元素个数与初始化真实写入的数量一致，
  // 后续插入/删除/入栈出队的 length++/-- 才能累积出正确结果。
  // 链表没有预分配槽位，初始化值会在 buildSteps 里按尾插法逐个建立结点，这里不处理。
  // 二叉树同理：初始化值在 buildSteps 里按层序逐个建立结点。
  if (declaration && structKind !== 'linked' && structKind !== 'binarytree') structure.setInitialLength(declaration.values.length);
  if (declaration && structKind === 'binarytree' && declaration.values.length > structure.maxNodes) {
    addLog({
      zh: `二叉树结点数达到演示上限 ${structure.maxNodes}，初始化时多余的 ${declaration.values.length - structure.maxNodes} 个值已忽略`,
      en: `Binary tree node limit ${structure.maxNodes} reached; ${declaration.values.length - structure.maxNodes} extra initial value(s) ignored`,
    }, true);
  }

  // 循环队列牺牲一个单元，初始化值超过 MaxSize-1 时多余部分会被忽略，这里明确提示。
  if (declaration && structKind === 'queue' && declaration.values.length > structure.maxSize) {
    addLog({
      zh: `循环队列牺牲一个单元，最多存 ${structure.maxSize} 个，初始化时多余的 ${declaration.values.length - structure.maxSize} 个值已忽略`,
      en: `Circular queue sacrifices one slot (max ${structure.maxSize}); ${declaration.values.length - structure.maxSize} extra initial value(s) ignored`,
    }, true);
  }

  if (cleaned.ignoredCount > 0) {
    addLog({ zh: `已忽略 ${cleaned.ignoredCount} 条无关语句`, en: `Ignored ${cleaned.ignoredCount} irrelevant statement(s)` });
  }
  if (cleaned.truncated || truncated) {
    addLog({ zh: `指令过多，仅提取前 ${CommandParser.MAX_COMMANDS} 条`, en: `Too many commands, only the first ${CommandParser.MAX_COMMANDS} were used` }, true);
  }

  const { steps, errors } = CommandParser.buildSteps(structure, commands, declaration);
  for (const e of errors) addLog(e.msg, true);
  if (!steps.length) {
    if (!errors.length) addLog({ zh: '没有可执行的指令', en: 'No executable commands' });
    animator.reset();
    setActiveLine(null);
    return;
  }

  animator.loadSteps(steps);
  renderer.render(memory);
  } catch (e) {
    handleError(e);
  }
}

/** 清洗并提取代码中的数据结构指令，替换回输入框并给出统计反馈。 */
function extractCode() {
  try {
  const { output, count, ignoredCount, truncated } = Preprocessor.extract(codeInput.value);

  if (count === 0) {
    alert(i18n.t({ zh: '未检测到有效的数据结构指令，请检查语法', en: 'No valid data-structure instruction found, please check the syntax' }));
    return;
  }

  codeInput.value = output;
  syncCodeView();

  const zhText = (truncated ? `指令过多，仅提取前 ${Preprocessor.MAX_EXTRACT} 条；` : '') + `已成功提取 ${count} 条有效指令，忽略 ${ignoredCount} 行无关代码`;
  const enText = (truncated ? `Too many, only first ${Preprocessor.MAX_EXTRACT} extracted; ` : '') + `Extracted ${count} valid instruction(s), ignored ${ignoredCount} irrelevant line(s)`;
  alert(i18n.t({ zh: zhText, en: enText }));
  } catch (e) {
    handleError(e);
  }
}

// ---------- 8. 事件绑定 ----------
executeBtn.addEventListener('click', execute);
stepBackBtn.addEventListener('click', () => animator.stepBack());
stepBtn.addEventListener('click', () => animator.stepOnce());
playBtn.addEventListener('click', () => animator.playAll());
resetBtn.addEventListener('click', () => resetAll());
runCodeBtn.addEventListener('click', runCode);
extractBtn.addEventListener('click', extractCode);
codeInput.addEventListener('input', syncCodeView);
opSelect.addEventListener('change', syncFields);
structureSelect.addEventListener('change', () => switchStructure(structureSelect.value));
langSelect.addEventListener('change', () => i18n.setLang(langSelect.value));
speedSelect.addEventListener('change', () => animator.setSpeed(SPEED_MAP[speedSelect.value]));

// ---------- 9. 初始渲染 ----------
rebuild(structKind);                     // 默认数组，容量 8
syncOps();
codeInput.value = SAMPLES.array;         // 预填 C 风格示例代码
syncCodeView();
animator.setSpeed(SPEED_MAP[speedSelect.value]);
renderer.render(memory);

// 手机上默认折叠「使用说明」，避免首屏被说明占满
const helpBox = document.querySelector('.panel__help');
if (helpBox && window.matchMedia('(max-width: 900px)').matches) {
  helpBox.open = false;
}
