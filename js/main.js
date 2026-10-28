/**
 * main.js — 应用入口 / 控制器。
 *
 * 职责：绑定界面事件，把用户输入转成操作指令，
 * 串联「数据结构层 → 动画层 → 渲染层」三部分，并维护日志与语言状态。
 */
import { i18n } from './i18n.js';
import { MemoryModel } from './core/MemoryModel.js';
import { Renderer } from './render/Renderer.js';
import { Animator } from './animation/Animator.js';
import { ArrayDS } from './structures/ArrayDS.js';
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
let array = new ArrayDS(memory, 8); // 默认数组，容量 8

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
  indexField.style.display = op === 'search' ? 'none' : 'flex';
}

/** 解析整数输入。 */
function parseIntValue(input) {
  const n = Number(input.value);
  return Number.isFinite(n) && input.value.trim() !== '' ? n : null;
}

// ---------- 5. 重置 ----------
function resetAll(capacity = 8) {
  animator.reset();                     // 中断播放、清空队列
  memory = new MemoryModel();           // 重建内存
  array = new ArrayDS(memory, capacity); // 重建数组结构（容量可被代码声明覆盖）
  animator.memory = memory;             // 让动画引擎指向新内存
  renderer.render(memory);              // 重绘
  clearLog();
}

// ---------- 6. 执行操作 ----------
function execute() {
  try {
  animator.reset(); // 清掉上一次未播完的步骤

  // 清除上一次查找留下的绿色命中标记
  for (const b of memory.blocks.values()) b.hit = false;

  const op = opSelect.value;
  let steps = [];

  if (op === 'insert') {
    const index = parseIntValue(indexInput);
    const value = parseIntValue(valueInput);
    if (index === null || value === null) return addLog({ zh: '请输入合法的下标和值', en: 'Invalid index or value' });
    if (index < 0 || index > array.length || array.length >= array.capacity) {
      return addLog({ zh: `下标须在 0~${array.length} 之间且数组未满`, en: `Index must be in 0~${array.length} and array not full` });
    }
    steps = array.planInsert(index, value);
  } else if (op === 'delete') {
    const index = parseIntValue(indexInput);
    if (index === null) return addLog({ zh: '请输入合法的下标', en: 'Invalid index' });
    if (index < 0 || index >= array.length) {
      return addLog({ zh: `下标须在 0~${array.length - 1} 之间`, en: `Index must be in 0~${array.length - 1}` });
    }
    steps = array.planDelete(index);
  } else if (op === 'set') {
    const index = parseIntValue(indexInput);
    const value = parseIntValue(valueInput);
    if (index === null || value === null) return addLog({ zh: '请输入合法的下标和值', en: 'Invalid index or value' });
    if (index < 0 || index >= array.length) {
      return addLog({ zh: `下标须在 0~${array.length - 1} 之间`, en: `Index must be in 0~${array.length - 1}` });
    }
    steps = array.planSet(index, value);
  } else if (op === 'search') {
    const value = parseIntValue(valueInput);
    if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
    steps = array.planSearch(value);
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

// ---------- 6.5 代码驱动模式 ----------

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

/** 解析并装载代码，生成动画步骤（每次从初始数组状态开始运行）。 */
function runCode() {
  try {
  syncCodeView();

  // 先清洗 + 跨行模式识别：把 for 循环实现的数组移位识别为 insert / remove。
  const cleaned = Preprocessor.extract(codeInput.value);

  const { commands, declaration, truncated } = CommandParser.parse(cleaned.output);

  // 声明决定容量（默认 8，且不小于初始化元素个数）
  const capacity = declaration ? Math.max(declaration.capacity, declaration.values.length, 1) : 8;
  resetAll(capacity);

  if (cleaned.ignoredCount > 0) {
    addLog({ zh: `已忽略 ${cleaned.ignoredCount} 条无关语句`, en: `Ignored ${cleaned.ignoredCount} irrelevant statement(s)` });
  }
  if (cleaned.truncated || truncated) {
    addLog({ zh: `指令过多，仅提取前 ${CommandParser.MAX_COMMANDS} 条`, en: `Too many commands, only the first ${CommandParser.MAX_COMMANDS} were used` }, true);
  }

  const { steps, errors } = CommandParser.buildSteps(array, commands, declaration);
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

// ---------- 7. 事件绑定 ----------
executeBtn.addEventListener('click', execute);
stepBtn.addEventListener('click', () => animator.stepOnce());
playBtn.addEventListener('click', () => animator.playAll());
resetBtn.addEventListener('click', () => resetAll());
runCodeBtn.addEventListener('click', runCode);
extractBtn.addEventListener('click', extractCode);
codeInput.addEventListener('input', syncCodeView);
opSelect.addEventListener('change', syncFields);
langSelect.addEventListener('change', () => i18n.setLang(langSelect.value));
speedSelect.addEventListener('change', () => animator.setSpeed(SPEED_MAP[speedSelect.value]));

// ---------- 8. 初始渲染 ----------
// 预填一段 C 风格示例代码：演示数组初始化 + 下标插入（右移）+ 下标删除（左移）
codeInput.value = `#include <stdio.h>

int main() {
    // 1. 初始化一个容量为 8 的数组，目前有 5 个有效元素
    int arr[8] = {10, 20, 30, 40, 50};
    int length = 5;
    int capacity = 8;

    // 操作 1：在下标 2 的位置插入元素 99
    for (int i = length; i > 2; i--) {
        arr[i] = arr[i - 1]; // 从后往前挪，腾出空间
    }
    arr[2] = 99;
    length++; // 长度加 1

    // 操作 2：删除下标 1 的元素（即 20）
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
}`;
syncFields();
syncCodeView();
animator.setSpeed(SPEED_MAP[speedSelect.value]);
renderer.render(memory);