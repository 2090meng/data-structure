/**
 * test.js — 纯逻辑自测脚本（不涉及 DOM / 渲染）。
 *
 * 只引入 structures 与 core 中的核心类，验证数组的赋值覆盖、插入后移、
 * 删除前移、以及越界时的防御性报错。运行方式：node test.js
 */
import { MemoryModel } from './js/core/MemoryModel.js';
import { ArrayDS } from './js/structures/ArrayDS.js';
import { StackDS } from './js/structures/StackDS.js';
import { QueueDS } from './js/structures/QueueDS.js';
import { CommandParser } from './js/core/CommandParser.js';
import { STEP } from './js/core/Step.js';

let pass = 0;
let fail = 0;

function assert(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log('  [PASS] ' + name);
  } else {
    fail++;
    console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : ''));
  }
}

/** 在无渲染环境下“执行”一组 Step，只演进内存与结构状态。 */
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

/** 读取数组当前有效区间内的值。 */
function readAll(arr, mem) {
  return arr.slots.slice(0, arr.length).map((b) => mem.read(b.id));
}

/** 构造一个已填入 vals 的数组（容量默认 10）。 */
function makeArray(vals, capacity = 10) {
  const mem = new MemoryModel();
  const arr = new ArrayDS(mem, capacity);
  for (const v of vals) applySteps(mem, arr.planInsert(arr.length, v));
  return { mem, arr };
}

// ---------- 用例 A：同一下标连续赋值，后者覆盖前者 ----------
console.log('\n用例 A：同一下标连续赋值（后者覆盖前者）');
{
  const { mem, arr } = makeArray([10, 20, 30]);
  applySteps(mem, arr.planSet(1, 99));
  applySteps(mem, arr.planSet(1, 77));
  const vals = readAll(arr, mem);
  console.log('  结果：', JSON.stringify(vals));
  assert('下标 1 最终为后值 77', vals[1] === 77, '实际 ' + vals[1]);
  assert('长度保持不变（3）', arr.length === 3, '实际 ' + arr.length);
}

// ---------- 用例 B：中间插入，元素正确后移 ----------
console.log('\n用例 B：在下标 2 插入 99，元素后移');
{
  const { mem, arr } = makeArray([10, 20, 30, 40, 50]);
  applySteps(mem, arr.planInsert(2, 99));
  const vals = readAll(arr, mem);
  console.log('  结果：', JSON.stringify(vals));
  assert(
    '内容为 [10,20,99,30,40,50]',
    JSON.stringify(vals) === JSON.stringify([10, 20, 99, 30, 40, 50]),
    JSON.stringify(vals)
  );
  assert('长度变为 6', arr.length === 6, '实际 ' + arr.length);
}

// ---------- 用例 C：删除中间元素，后方元素前移覆盖 ----------
console.log('\n用例 C：删除下标 1（值 20），元素前移');
{
  const { mem, arr } = makeArray([10, 20, 30, 40, 50]);
  applySteps(mem, arr.planDelete(1));
  const vals = readAll(arr, mem);
  console.log('  结果：', JSON.stringify(vals));
  assert(
    '内容为 [10,30,40,50]',
    JSON.stringify(vals) === JSON.stringify([10, 30, 40, 50]),
    JSON.stringify(vals)
  );
  assert('长度变为 4', arr.length === 4, '实际 ' + arr.length);
}

// ---------- 用例 D：越界插入触发防御性报错 ----------
console.log('\n用例 D：越界插入的防御性报错');
{
  const { arr } = makeArray([10, 20, 30, 40, 50]);

  const parsedFar = CommandParser.parse('insert(15, 10);');
  const far = CommandParser.buildSteps(arr, parsedFar.commands, null);
  console.log('  越界报错：', JSON.stringify(far.errors));
  assert(
    '下标 15 越界时报错',
    Array.isArray(far.errors) && far.errors.length > 0 && /错误/.test(far.errors[0].msg.zh),
    JSON.stringify(far.errors)
  );

  const parsedNeg = CommandParser.parse('insert(-1, 10);');
  const neg = CommandParser.buildSteps(arr, parsedNeg.commands, null);
  console.log('  负数报错：', JSON.stringify(neg.errors));
  assert(
    '负数下标时报错',
    Array.isArray(neg.errors) && neg.errors.length > 0 && /错误/.test(neg.errors[0].msg.zh),
    JSON.stringify(neg.errors)
  );

  assert('ArrayDS.planInsert 越界时不产生步骤', arr.planInsert(15, 10).length === 0);
}

// ---------- 用例 E：栈后进先出（push / pop） ----------
console.log('\n用例 E：栈的入栈 / 出栈（LIFO）');
{
  const mem = new MemoryModel();
  const st = new StackDS(mem, 4);

  applySteps(mem, st.planPush(10));
  applySteps(mem, st.planPush(20));
  applySteps(mem, st.planPush(30));
  console.log('  入栈三次后：', JSON.stringify(readAll(st, mem)), 'top =', st.top);
  assert('入栈后元素个数为 3', st.length === 3, '实际 ' + st.length);
  assert('栈顶为最后入栈的 30', mem.read(st.slots[2].id) === 30);
  assert('栈顶下标为 2', st.top === 2, '实际 ' + st.top);

  applySteps(mem, st.planPop());
  console.log('  出栈一次后：', JSON.stringify(readAll(st, mem)), 'top =', st.top);
  assert('出栈后元素个数为 2', st.length === 2, '实际 ' + st.length);
  assert('新栈顶为 20', mem.read(st.slots[1].id) === 20);
  assert('已弹出的槽位被清空', mem.read(st.slots[2].id) === null);

  assert('空栈出栈不产生步骤', st.planPop(0).length === 0);

  applySteps(mem, st.planPush(40));
  applySteps(mem, st.planPush(50));
  applySteps(mem, st.planPush(60));
  console.log('  填满 4 个后：', JSON.stringify(readAll(st, mem)));
  assert('栈满（4 个）后不再入栈', st.planPush(70, st.length).length === 0);
}

// ---------- 用例 F：循环队列（队尾入队 / 队头出队 + 槽位绕回） ----------
console.log('\n用例 F：循环队列的入队 / 出队（FIFO + 环形槽位）');
{
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 3);

  const order = () => {
    const out = [];
    for (let k = 0; k < q.length; k++) out.push(mem.read(q.slots[(q.front + k) % q.capacity].id));
    return out;
  };

  applySteps(mem, q.planEnqueue(1));
  applySteps(mem, q.planEnqueue(2));
  applySteps(mem, q.planEnqueue(3));
  console.log('  入队 1,2,3：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('队列长度 3', q.length === 3, '实际 ' + q.length);
  assert('从队头到队尾顺序为 [1,2,3]', JSON.stringify(order()) === JSON.stringify([1, 2, 3]), JSON.stringify(order()));

  applySteps(mem, q.planDequeue());
  console.log('  出队一次：', JSON.stringify(order()), 'front =', q.front);
  assert('出队 1 后长度变为 2', q.length === 2, '实际 ' + q.length);
  assert('front 后移到槽位 1', q.front === 1, '实际 ' + q.front);
  assert('原队头槽位已清空', mem.read(q.slots[0].id) === null);

  applySteps(mem, q.planEnqueue(4));
  console.log('  再入队 4：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('新元素绕回写入槽位 0', mem.read(q.slots[0].id) === 4);
  assert('环形顺序为 [2,3,4]', JSON.stringify(order()) === JSON.stringify([2, 3, 4]), JSON.stringify(order()));

  applySteps(mem, q.planEnqueue(5));
  console.log('  再入队 5（队列满）：', JSON.stringify(order()));
  assert('队列满后不再入队', q.planEnqueue(9, q.length).length === 0);
}

// ---------- 用例 G：代码模式下的栈 / 队列指令 ----------
console.log('\n用例 G：代码模式的 push / pop / enqueue / dequeue');
{
  // 栈：int st[6] = {1,2}; push(3); pop();  -> 最终 [1,2]
  const memS = new MemoryModel();
  const st = new StackDS(memS, 6);
  const ps = CommandParser.parse('int st[6] = {1, 2};\npush(st, 3);\npop(st);');
  st.setInitialLength(ps.declaration.values.length);
  const rs = CommandParser.buildSteps(st, ps.commands, ps.declaration);
  applySteps(memS, rs.steps);
  console.log('  栈结果：', JSON.stringify(readAll(st, memS)), 'errors =', rs.errors.length);
  assert('栈代码模式最终为 [1,2]', JSON.stringify(readAll(st, memS)) === JSON.stringify([1, 2]), JSON.stringify(readAll(st, memS)));
  assert('栈代码模式无错误', rs.errors.length === 0, JSON.stringify(rs.errors));

  // 队列：int q[4] = {1,2}; enqueue(3); dequeue();  -> 最终 [2,3]，front = 1
  const memQ = new MemoryModel();
  const q = new QueueDS(memQ, 4);
  const pq = CommandParser.parse('int q[4] = {1, 2};\nenqueue(q, 3);\ndequeue(q);');
  q.setInitialLength(pq.declaration.values.length);
  const rq = CommandParser.buildSteps(q, pq.commands, pq.declaration);
  applySteps(memQ, rq.steps);
  const qOrder = [];
  for (let k = 0; k < q.length; k++) qOrder.push(memQ.read(q.slots[(q.front + k) % q.capacity].id));
  console.log('  队列结果：', JSON.stringify(qOrder), 'front =', q.front, 'errors =', rq.errors.length);
  assert('队列代码模式最终为 [2,3]', JSON.stringify(qOrder) === JSON.stringify([2, 3]), JSON.stringify(qOrder));
  assert('队列代码模式 front 为 1', q.front === 1, '实际 ' + q.front);
  assert('队列代码模式无错误', rq.errors.length === 0, JSON.stringify(rq.errors));

  // 栈上按下标赋值应被拦下并报错
  const pBad = CommandParser.parse('set(1, 99);');
  const rBad = CommandParser.buildSteps(st, pBad.commands, null);
  assert('栈不支持按下标赋值（有报错）', rBad.errors.length > 0, JSON.stringify(rBad.errors));
}

// ---------- 汇总 ----------
console.log('\n===== 测试完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
