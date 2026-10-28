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

// ---------- 3. 创建核心对象 ----------
let memory = new MemoryModel();
const renderer = new Renderer(svg);
let array = new ArrayDS(memory, 8); // 默认数组，容量 8

const animator = new Animator(memory, renderer, (text) => addLog(text));

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
  } else if (op === 'search') {
    const value = parseIntValue(valueInput);
    if (value === null) return addLog({ zh: '请输入合法的查找值', en: 'Invalid value' });
    steps = array.planSearch(value);
  }

  if (!steps.length) return;

  clearLog();
  animator.loadSteps(steps);
  renderer.render(memory);
}

// ---------- 7. 事件绑定 ----------
executeBtn.addEventListener('click', execute);
stepBtn.addEventListener('click', () => animator.stepOnce());
playBtn.addEventListener('click', () => animator.playAll());
resetBtn.addEventListener('click', resetAll);
opSelect.addEventListener('change', syncFields);
langSelect.addEventListener('change', () => i18n.setLang(langSelect.value));

// ---------- 8. 初始渲染 ----------
syncFields();
renderer.render(memory);