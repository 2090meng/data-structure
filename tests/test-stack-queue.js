/**
 * test-stack-queue.js — 栈 / 队列 全面自动化自检。
 *
 * 运行：node tests/test-stack-queue.js
 *
 * 覆盖：
 *   A 栈：连续压入 10/20/30 后弹出一次（后进先出）
 *   B 栈：空栈连续 pop 两次的防御
 *   C 栈：容量 5 时压入第 6 个元素的防御
 *   D 队列：连续入队 1/2/3 后出队一次（先进先出）
 *   E 队列：空队列出队的防御
 *   F 队列：多次入队出队后的“假溢出”验证（循环队列指针是否绕回）
 *   G UI：渲染布局 / 指针标注 / 值消失 / 日志联动
 *   H 队列：代码模式“入队 → 出队 → 再入队”时的规划期 front 同步（防覆盖）
 *   I 队列：指针错乱（槽位已被占用）时的防覆盖拦截
 *
 * G 部分用极轻量的“假 DOM”驱动【真实的】Renderer 与 Animator，
 * 因此无需浏览器即可验证真实的渲染与日志代码路径。
 */
import { MemoryModel } from '../js/core/MemoryModel.js';
import { StackDS } from '../js/structures/StackDS.js';
import { QueueDS } from '../js/structures/QueueDS.js';
import { Renderer } from '../js/render/Renderer.js';
import { Animator } from '../js/animation/Animator.js';
import { CommandParser } from '../js/core/CommandParser.js';
import { STEP } from '../js/core/Step.js';
import { FakeEl, installFakeDOM, walk, texts, valueTextAt } from './helpers/fake-dom.js';
import { applySteps } from './helpers/steps.js';

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

// ---------- 假 DOM 与执行辅助（tests/helpers 共享） ----------
installFakeDOM();

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
  assertEq('A-4 栈顶指针 top（指向下一个空位）', st.top, 2);
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
  assertEq('G-3 栈顶指针标注 top = 3（指向下一个空位）', texts(svg, 'mem-ptr'), ['top = 3 →']);
  assertEq('G-4 日志含“入栈”记录', logs.some((l) => /入栈/.test(String(l))), true);

  const logCountBefore = logs.length;
  animator.loadSteps(st.planPop());
  await animator.playAll();

  assertEq('G-5 出栈后该方块的值消失（显示 ∅）', valueTextAt(svg, renderer.positions[st.slots[2].id]), ['∅']);
  assertEq('G-6 出栈后 top 指针回退到 2', texts(svg, 'mem-ptr'), ['top = 2 →']);
  assertEq('G-7 出栈产生新日志', logs.length > logCountBefore, true);
  assertEq('G-8 日志含“出栈”记录', logs.some((l) => /出栈/.test(String(l))), true);
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

  assertEq('G-10 队列指针标注为 front = 0 / rear = 3（rear 指向下一个空位）', texts(svg, 'mem-ptr'), ['▲ front = 0', '▲ rear = 3']);
  assertEq('G-11 日志含“入队”记录', logs.some((l) => /入队/.test(String(l))), true);

  animator.loadSteps(q.planDequeue());
  await animator.playAll();

  assertEq('G-12 出队后队头方块的值消失（显示 ∅）', valueTextAt(svg, renderer.positions[q.slots[0].id]), ['∅']);
  assertEq('G-13 出队后 front 指针后移到 1', texts(svg, 'mem-ptr')[0], '▲ front = 1');
  assertEq('G-14 日志含“出队”记录', logs.some((l) => /出队/.test(String(l))), true);
  assertEq('G-15 剩余元素渲染正确', [valueTextAt(svg, renderer.positions[q.slots[1].id]), valueTextAt(svg, renderer.positions[q.slots[2].id])], [['2'], ['3']]);
}

// ============================================================
// 4. 队列指针与防覆盖（回归用例）
// ============================================================
console.log('\n【用例 H】代码模式：入队 40 → 出队 10 → 再入队 50/60（不得覆盖 40）');
{
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

  const code = [
    'int q[6] = {10, 20, 30};',
    'enqueue(q, 40);',
    'dequeue(q);',
    'enqueue(q, 50);',
    'enqueue(q, 60);',
  ].join('\n');
  const parsed = CommandParser.parse(code);
  q.setInitialLength(parsed.declaration.values.length);
  const built = CommandParser.buildSteps(q, parsed.commands, parsed.declaration);

  animator.loadSteps(built.steps);
  await animator.playAll();

  const slots = q.slots.map((b) => mem.read(b.id));
  assertEq('H-1 规划无错误', built.errors.map((e) => e.msg.zh), []);
  assertEq('H-2 槽位内容（40 未被 50 覆盖）', slots, [null, 20, 30, 40, 50, 60]);
  assertEq('H-3 队内顺序', queueValues(q, mem), [20, 30, 40, 50, 60]);
  assertEq('H-4 front / rear / 元素个数（rear 绕回 0）', [q.front, q.rear, q.length], [1, 0, 5]);
  assertEq('H-5 50 写入槽位 [4] 而非覆盖 [3]', mem.read(q.slots[4].id), 50);
  assertEq('H-6 rear 始终在 0..MaxSize-1 内', q.rear >= 0 && q.rear < q.capacity, true);
  assertEq('H-7 出队日志含 Q.front 式子与 rear', logs.some((l) => /Q\.front = \(Q\.front \+ 1\) % 6 → 1，元素个数 = 3（rear = 4）/.test(String(l))), true);
  assertEq('H-8 入队日志含 Q.rear 式子与 front', logs.some((l) => /Q\.rear = \(Q\.rear \+ 1\) % 6 → 5，元素个数 = 4（front = 1）/.test(String(l))), true);
  assertEq('H-9 画布指针标注同步', texts(svg, 'mem-ptr'), ['▲ front = 1', '▲ rear = 0']);
  assertEq('H-10 槽位 [3] 仍渲染为 40', valueTextAt(svg, renderer.positions[q.slots[3].id]), ['40']);
}

console.log('\n【用例 I】队列：指针错乱（目标槽位已被占用）时必须拦截，不能覆盖');
{
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 6);
  for (const v of [10, 20, 30]) applySteps(mem, q.planEnqueue(v));

  // 人为制造“指针错乱”：槽位 [3] 已有数据，但 length 仍为 3（下次入队正好指向 [3]）
  mem.write(q.slots[3].id, 99);

  const err = q.enqueueError();
  const steps = q.planEnqueue(40);
  applySteps(mem, steps);

  assertEq('I-1 检测到槽位被占用并拦截', err !== null, true);
  assertEq('I-2 报错文案提示会覆盖数据', err ? /覆盖数据/.test(err.zh) : false, true);
  assertEq('I-3 不产生入队步骤（不写入）', steps.length, 0);
  assertEq('I-4 槽位 [3] 原值 99 未被覆盖', mem.read(q.slots[3].id), 99);
  assertEq('I-5 元素个数未变', q.length, 3);

  // 队满时仍应报“队列已满”，且提示循环队列可先出队
  const memFull = new MemoryModel();
  const qFull = new QueueDS(memFull, 2);
  applySteps(memFull, qFull.planEnqueue(1));
  applySteps(memFull, qFull.planEnqueue(2));
  const fullErr = qFull.enqueueError();
  assertEq('I-6 队满报错含 front / rear', fullErr ? /队列已满.*front/.test(fullErr.zh) : false, true);
}

// ============================================================
// 5. 教材语义：步骤顺序与指针标注
// ============================================================
console.log('\n【用例 J】教材语义：入栈先写数据再 top++；出栈先 top-- 再取；入队先写再 rear++；出队先取再 front++');
{
  const mem = new MemoryModel();
  const st = new StackDS(mem, 8);
  const pushTypes = st.planPush(10).map((s) => s.type);
  applySteps(mem, st.planPush(10));
  applySteps(mem, st.planPush(20));
  const popSteps = st.planPop();
  const popTypes = popSteps.map((s) => s.type);
  applySteps(mem, popSteps);

  assertEq('J-1 入栈步骤：先 SET_VALUE 再 META（top++）', pushTypes, [STEP.SET_VALUE, STEP.META]);
  assertEq('J-2 出栈步骤顺序：META（top--）先于 CLEAR_VALUE（取数据）',
    popTypes.indexOf(STEP.META) < popTypes.indexOf(STEP.CLEAR_VALUE), true);
  assertEq('J-3 出栈后 top 下移一位', st.top, 1);
  assertEq('J-4 出栈后元素个数减一', st.length, 1);

  const memQ = new MemoryModel();
  const q = new QueueDS(memQ, 6);
  const enqTypes = q.planEnqueue(1).map((s) => s.type);
  const deqTypes = q.planDequeue(1, memQ, 0).map((s) => s.type);
  assertEq('J-5 入队步骤：先 SET_VALUE 再 META（rear++）', enqTypes, [STEP.SET_VALUE, STEP.META]);
  assertEq('J-6 出队步骤顺序：CLEAR_VALUE（取 e）先于 META（front++）',
    deqTypes.indexOf(STEP.CLEAR_VALUE) < deqTypes.indexOf(STEP.META), true);

  // 队满：牺牲一个单元，(rear+1)%MaxSize == front，两个指针分别停在相邻槽位
  const memFull = new MemoryModel();
  const qFull = new QueueDS(memFull, 3); // 最多存 2 个
  for (const v of [1, 2]) applySteps(memFull, qFull.planEnqueue(v));
  assertEq('J-7 队满判据 (rear+1)%MaxSize == front', ((qFull.rear + 1) % qFull.capacity) === qFull.front, true);
  assertEq('J-8 队满时 front 与 rear 不重合', qFull.front !== qFull.rear, true);

  // 队空：front == rear，两个指针落在同一个空槽位上，标注必须错开
  const memEmpty = new MemoryModel();
  const qEmpty = new QueueDS(memEmpty, 4);
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  renderer.setViewProvider(() => qEmpty.view());
  renderer.render(memEmpty);

  const ptrs = [];
  walk(svg, (e) => {
    if (e.tag === 'text' && String(e.attrs.class || '').split(' ').includes('mem-ptr')) ptrs.push(e);
  });
  assertEq('J-9 队空时 front == rear 指向同一槽位', qEmpty.front === qEmpty.rear, true);
  assertEq('J-10 队空时两个指针标注错开（y 不同）', ptrs.length === 2 && ptrs[0].attrs.y !== ptrs[1].attrs.y, true);
}

// ---------- 汇总 ----------
console.log('\n===== 自检完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
