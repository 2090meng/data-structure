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
const codeView = document.getElementById('code-view');

// ---------- 3. 创建核心对象 ----------
let memory = new MemoryModel();
const renderer = new Renderer(svg);
let array = new ArrayDS(memory, 8); // 默认数组，容量 8

const animator = new Animator(memory, renderer, (text) => addLog(text), (line) => setActiveLine(line));

// ---------- 4. 工具函数 ----------
/** 向日志区追加一条步骤说明（自动按当前语言翻译）。 */
function addLog(text) {
  if (!text) return;
  const li = document.createElement('li');
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
function resetAll() {
  animator.reset();                     // 中断播放、清空队列
  memory = new MemoryModel();           // 重建内存
  array = new ArrayDS(memory, 8);       // 重建数组结构
  animator.memory = memory;             // 让动画引擎指向新内存
  renderer.render(memory);              // 重绘
  clearLog();
}

// ---------- 6. 执行操作 ----------
function execute() {
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
  resetAll();                 // 每次都以初始状态运行，保证结果确定
  syncCodeView();

  const { commands, errors } = CommandParser.parse(codeInput.value);
  if (errors.length) {
    for (const e of errors) {
      addLog({ zh: `第 ${e.line} 行语法错误：${e.text}`, en: `Syntax error at line ${e.line}: ${e.text}` });
    }
    animator.reset();
    setActiveLine(null);
    return;
  }

  const { steps, errors: runErrors } = CommandParser.buildSteps(array, commands);
  for (const e of runErrors) addLog(e.msg);
  if (!steps.length) {
    if (!runErrors.length) addLog({ zh: '没有可执行的指令', en: 'No executable commands' });
    animator.reset();
    setActiveLine(null);
    return;
  }

  animator.loadSteps(steps);
  renderer.render(memory);
}

// ---------- 7. 事件绑定 ----------
executeBtn.addEventListener('click', execute);
stepBtn.addEventListener('click', () => animator.stepOnce());
playBtn.addEventListener('click', () => animator.playAll());
resetBtn.addEventListener('click', resetAll);
runCodeBtn.addEventListener('click', runCode);
codeInput.addEventListener('input', syncCodeView);
opSelect.addEventListener('change', syncFields);
langSelect.addEventListener('change', () => i18n.setLang(langSelect.value));

// ---------- 8. 初始渲染 ----------
// 预填一段示例代码，方便第一次直接点击「运行代码」体验
codeInput.value = [
  '// 示例：数组操作伪代码',
  'insert(arr, 0, 10);',
  'insert(arr, 1, 20);',
  'arr[0] = 99;',
  'insert(arr, 5);',
  'search(arr, 20);',
  'remove(arr, 1);',
].join('\n');
syncFields();
syncCodeView();
renderer.render(memory);