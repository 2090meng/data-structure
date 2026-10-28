/**
 * test-stack-queue.js — 栈 / 队列 全面自动化自检。
 *
 * 运行：node test-stack-queue.js
 *
 * 覆盖：
 *   A 栈：连续压入 10/20/30 后弹出一次（后进先出）
 *   B 栈：空栈连续 pop 两次的防御
 *   C 栈：容量 5 时压入第 6 个元素的防御
 *   D 队列：连续入队 1/2/3 后出队一次（先进先出）
 *   E 队列：空队列出队的防御
 *   F 队列：多次入队出队后的“假溢出”验证（循环队列指针是否绕回）
 *   G UI：渲染布局 / 指针标注 / 值消失 / 日志联动
 *
 * G 部分用极轻量的“假 DOM”驱动【真实的】Renderer 与 Animator，
 * 因此无需浏览器即可验证真实的渲染与日志代码路径。
 */
import { MemoryModel } from './js/core/MemoryModel.js';
import { StackDS } from './js/structures/StackDS.js';
import { QueueDS } from './js/structures/QueueDS.js';
import { Renderer } from './js/render/Renderer.js';
import { Animator } from './js/animation/Animator.js';
import { STEP } from './js/core/Step.js';

// ---------- 断言工具：同时打印预期结果与实际结果 ----------
let pass = 0;
let fail = 0;

function assertEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name}`);
  console.log(`         预期: ${JSON.stringify(expected)}`);
  console.log(`         实际: ${JSON.stringify(actual)}`);
}

// ---------- 假 DOM（只实现 Renderer 用到的几个方法） ----------
class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.textContent = '';
    this.style = {};
    this.parent = null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
  remove() { if (this.parent) this.parent.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  get clientWidth() { return 1280; }
}
globalThis.document = { createElementNS: (_ns, tag) => new FakeEl(tag) };

function walk(el, cb) {
  cb(el);
  for (const c of el.children) walk(c, cb);
}

/** 取出画布中某类文字（如 mem-ptr 指针标注）。 */
function texts(svg, cls) {
  const out = [];
  walk(svg, (e) => {
    if (e.tag === 'text' && String(e.attrs.class || '').split(' ').includes(cls)) {
      out.push(e.textContent);
    }
  });
  return out;
}

/** 取出某个块中心显示的值文字（'30' 或 '∅'）。 */
function valueTextAt(svg, pos) {
  const out = [];
  if (!pos) return out;
  walk(svg, (e) => {
    if (e.tag !== 'text') return;
    if (Number(e.attrs.x) !== pos.cx || Number(e.attrs.y) !== pos.cy) return;
    const cls = String(e.attrs.class || '');
    if (cls === 'mem-value' || cls === 'mem-empty') out.push(e.textContent);
  });
  return out;
}

// ---------- 执行辅助：与 Animator 保持一致地演进内存 ----------
function applySteps(mem, steps) {
  for (const s of steps) {
    const p = s.payload || {};
    switch (s.type) {
      case STEP.MOVE_VALUE: {
        const v = mem.read(p.from);
        mem.clear(p.from);
        mem.write(p.to, v);
        break;
      }
      case STEP.SET_VALUE:
        mem.write(p.block, p.value);
        break;
      case STEP.CLEAR_VALUE:
        mem.clear(p.block);
        break;
      case STEP.SWAP: {
        const va = mem.read(p.a);
        const vb = mem.read(p.b);
        mem.write(p.a, vb);
        mem.write(p.b, va);
        break;
      }
      case STEP.META:
        if (typeof p.run === 'function') p.run();
        break;
      default:
        break;
    }
  }
}

/** 栈内元素（栈底 -> 栈顶）。 */
function stackValues(st, mem) {
  return st.slots.slice(0, st.length).map((b) => mem.read(b.id));
}

/** 队列内元素（队头 -> 队尾，按环形顺序）。 */
function queueValues(q, mem) {
  const out = [];
  for (let k = 0; k < q.length; k++) {
    out.push(mem.read(q.slots[(q.front + k) % q.capacity].id));
  }
  return out;
}

// ============================================================
// 1. 栈测试
// ============================================================
console.log('\n【用例 A】栈：依次压入 10、20、30 后弹出一次（后进先出）');
{
  const mem = new MemoryModel();
  const st = new StackDS(mem, 8);
  for (const v of [10, 20, 30]) applySteps(mem, st.planPush(v));

  const popped = mem.read(st.slots[st.length - 1].id);
  applySteps(mem, st.planPop());

  assertEq('A-1 弹出的值', popped, 30);
  assertEq('A-2 栈内剩余元素', stackValues(st, mem), [10, 20]);
  assertEq('A-3 元素个数', st.length, 2);
  assertEq('A-4 栈顶下标', st.top, 1);
}

console.log('\n【用例 B】栈：对空栈连续 pop 两次（防御 + 不崩溃）');
{
  const mem = new MemoryModel();
  const st = new StackDS(mem, 8);

  // 第一次 pop：应被防御拦截
  const err1 = st.popError();
  const steps1 = st.planPop();
  applySteps(mem, steps1);

  // 第二次 pop：仍然为空，必须再次被拦截
  const err2 = st.popError();
  const steps2 = st.planPop();
  applySteps(mem, steps2);

  assertEq('B-1 第一次 pop 触发防御', err1 !== null, true);
  assertEq('B-2 第一次报错文案', err1 && err1.zh, '错误：栈为空，无法弹出');
  assertEq('B-3 空栈 pop 不产生动画步骤', steps1.length, 0);
  assertEq('B-4 第二次 pop 仍触发防御', err2 !== null, true);
  assertEq('B-5 第二次报错文案', err2 && err2.zh, '错误：栈为空，无法弹出');
  assertEq('B-6 两次后长度仍为 0（未崩溃）', st.length, 0);
  assertEq('B-7 内存中无任何值被写入', stackValues(st, mem), []);
}

console.log('\n【用例 C】栈：容量 5，压入第 6 个元素时被拦截');
{
  const mem = new MemoryModel();
  const st = new StackDS(mem, 5);
  let blockedAt = null;
  let blockedMsg = null;

  for (let i = 1; i <= 6; i++) {
    const err = st.pushError();
    if (err) {
      blockedAt = i;
      blockedMsg = err.zh;
      break;
    }
    applySteps(mem, st.planPush(i * 10));
  }

  assertEq('C-1 第 6 个元素被拦截', blockedAt, 6);
  assertEq('C-2 拦截报错文案', blockedMsg, '错误：栈已满，无法压入（容量 5）');
  assertEq('C-3 实际只存入 5 个', st.length, 5);
  assertEq('C-4 栈内内容', stackValues(st, mem), [10, 20, 30, 40, 50]);
  assertEq('C-5 栈满时 planPush 不产生步骤', st.planPush(60).length, 0);
}

// ============================================================
// 2. 队列测试
// ============================================================
console.log('\n【用例 D】队列：依次入队 1、2、3 后出队一次（先进先出）');
{
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 6);
  for (const v of [1, 2, 3]) applySteps(mem, q.planEnqueue(v));

  const popped = mem.read(q.slots[q.front].id);
  applySteps(mem, q.planDequeue());

  assertEq('D-1 出队的值', popped, 1);
  assertEq('D-2 队列内剩余元素', queueValues(q, mem), [2, 3]);
  assertEq('D-3 元素个数', q.length, 2);
  assertEq('D-4 队头指针后移', q.front, 1);
  assertEq('D-5 原队头槽位已清空', mem.read(q.slots[0].id), null);
}

console.log('\n【用例 E】队列：空队列执行 dequeue（防御）');
{
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 4);

  const err = q.dequeueError();
  const steps = q.planDequeue();
  applySteps(mem, steps);

  assertEq('E-1 空队列出队触发防御', err !== null, true);
  assertEq('E-2 报错文案', err && err.zh, '错误：队列为空，无法出队');
  assertEq('E-3 不产生动画步骤', steps.length, 0);
  assertEq('E-4 长度仍为 0', q.length, 0);
  assertEq('E-5 队头指针未乱动', q.front, 0);
}

console.log('\n【用例 F】队列：多轮入队/出队验证假溢出（循环队列指针绕回）');
{
  const mem = new MemoryModel();
  const cap = 3;
  const q = new QueueDS(mem, cap);

  const outOrder = [];
  let maxRear = -1;
  let maxFront = -1;
  let wrapped = false;
  let prevRear = q.rear;

  // 容量只有 3，却连续做 10 轮“入队 + 出队”：普通数组队列会假溢出，循环队列应正常
  for (let round = 0; round < 10; round++) {
    const v = round + 1;
    if (!q.enqueueError()) applySteps(mem, q.planEnqueue(v));
    maxRear = Math.max(maxRear, q.rear);
    maxFront = Math.max(maxFront, q.front);
    if (q.rear < prevRear) wrapped = true;
    prevRear = q.rear;

    const out = mem.read(q.slots[q.front].id);
    if (!q.dequeueError()) applySteps(mem, q.planDequeue());
    outOrder.push(out);
    maxRear = Math.max(maxRear, q.rear);
    maxFront = Math.max(maxFront, q.front);
  }

  assertEq('F-1 队尾指针始终未超出容量（< 3）', maxRear < cap, true);
  assertEq('F-2 队头指针始终未超出容量（< 3）', maxFront < cap, true);
  assertEq('F-3 指针发生过绕回（循环队列而非假溢出）', wrapped, true);
  assertEq('F-4 10 轮出队顺序仍为 1..10（FIFO 未错乱）', outOrder, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assertEq('F-5 结束后队列为空', q.length, 0);
  assertEq('F-6 13 次操作后仍可继续入队', q.enqueueError(), null);
}

// ============================================================
// 3. UI 渲染与日志联动（真实 Renderer + Animator + 假 DOM）
// ============================================================
console.log('\n【用例 G】UI 渲染与日志联动');
{
  // ---- 栈：压栈时新的方块出现在顶部，出栈时该方块值变为空 ----
  const mem = new MemoryModel();
  const st = new StackDS(mem, 8);
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  const logs = [];
  const animator = new Animator(
    mem,
    renderer,
    (t) => logs.push(t && t.zh),
    () => {},
    (m) => logs.push('ERR: ' + m),
    () => {}
  );
  animator.setSpeed(0);
  renderer.setViewProvider(() => st.view());

  for (const v of [10, 20, 30]) {
    if (st.pushError()) break;
    animator.loadSteps(st.planPush(v));
    await animator.playAll();
  }

  const posTop = renderer.positions[st.slots[2].id];
  const posBottom = renderer.positions[st.slots[0].id];
  assertEq('G-1 栈是竖排：栈顶方块画在栈底方块上方', posTop.cy < posBottom.cy, true);
  assertEq('G-2 压栈后顶部出现数值 30 的方块', valueTextAt(svg, posTop), ['30']);
  assertEq('G-3 栈顶指针标注 top = 2', texts(svg, 'mem-ptr'), ['top = 2 →']);
  assertEq('G-4 日志含“入栈”记录', logs.some((l) => /入栈/.test(String(l))), true);

  const logCountBefore = logs.length;
  animator.loadSteps(st.planPop());
  await animator.playAll();

  assertEq('G-5 出栈后该方块的值消失（显示 ∅）', valueTextAt(svg, renderer.positions[st.slots[2].id]), ['∅']);
  assertEq('G-6 出栈后 top 指针回退到 1', texts(svg, 'mem-ptr'), ['top = 1 →']);
  assertEq('G-7 出栈产生新日志', logs.length > logCountBefore, true);
  assertEq('G-8 日志含“弹出”记录', logs.some((l) => /弹出/.test(String(l))), true);
  assertEq('G-9 栈内剩余值渲染正确', [valueTextAt(svg, renderer.positions[st.slots[0].id]), valueTextAt(svg, renderer.positions[st.slots[1].id])], [['10'], ['20']]);
}

{
  // ---- 队列：出队时队头方块的值消失，front 指针后移 ----
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 6);
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  const logs = [];
  const animator = new Animator(
    mem,
    renderer,
    (t) => logs.push(t && t.zh),
    () => {},
    (m) => logs.push('ERR: ' + m),
    () => {}
  );
  animator.setSpeed(0);
  renderer.setViewProvider(() => q.view());

  for (const v of [1, 2, 3]) {
    if (q.enqueueError()) break;
    animator.loadSteps(q.planEnqueue(v));
    await animator.playAll();
  }

  assertEq('G-10 队列指针标注为 front = 0 / rear = 2', texts(svg, 'mem-ptr'), ['▲ front = 0', '▲ rear = 2']);
  assertEq('G-11 日志含“入队”记录', logs.some((l) => /入队/.test(String(l))), true);

  animator.loadSteps(q.planDequeue());
  await animator.playAll();

  assertEq('G-12 出队后队头方块的值消失（显示 ∅）', valueTextAt(svg, renderer.positions[q.slots[0].id]), ['∅']);
  assertEq('G-13 出队后 front 指针后移到 1', texts(svg, 'mem-ptr')[0], '▲ front = 1');
  assertEq('G-14 日志含“出队”记录', logs.some((l) => /出队/.test(String(l))), true);
  assertEq('G-15 剩余元素渲染正确', [valueTextAt(svg, renderer.positions[q.slots[1].id]), valueTextAt(svg, renderer.positions[q.slots[2].id])], [['2'], ['3']]);
}

// ---------- 汇总 ----------
console.log('\n===== 自检完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
