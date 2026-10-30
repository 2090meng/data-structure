/**
 * test.js — 纯逻辑自测脚本（不涉及 DOM / 渲染）。
 *
 * 只引入 structures 与 core 中的核心类，验证数组的赋值覆盖、插入后移、
 * 删除前移、以及越界时的防御性报错。运行方式：node tests/test.js
 */
import { MemoryModel } from '../js/core/MemoryModel.js';
import { ArrayDS } from '../js/structures/ArrayDS.js';
import { StackDS } from '../js/structures/StackDS.js';
import { QueueDS } from '../js/structures/QueueDS.js';
import { CommandParser } from '../js/core/CommandParser.js';
import { applySteps } from './helpers/steps.js';

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

/** 读取数组当前有效区间内的值。 */
function readAll(arr, mem) {
  return arr.slots.slice(0, arr.length).map((b) => mem.read(b.id));
}

/** 构造一个已填入 vals 的数组（容量默认 10）。 */
function makeArray(vals, capacity = 10) {
  const mem = new MemoryModel();
  const arr = new ArrayDS(mem, capacity);
  for (const v of vals) applySteps(mem, arr.planInsert(arr.length + 1, v)); // 位序 len+1 = 表尾追加
  return { mem, arr };
}

// ---------- 用例 A：同一位置连续赋值，后者覆盖前者（位序 1 起始） ----------
console.log('\n用例 A：同一位置连续赋值（后者覆盖前者）');
{
  const { mem, arr } = makeArray([10, 20, 30]);
  applySteps(mem, arr.planSet(2, 99)); // 第 2 个元素 = 物理下标 1
  applySteps(mem, arr.planSet(2, 77));
  const vals = readAll(arr, mem);
  console.log('  结果：', JSON.stringify(vals));
  assert('下标 1 最终为后值 77', vals[1] === 77, '实际 ' + vals[1]);
  assert('长度保持不变（3）', arr.length === 3, '实际 ' + arr.length);
}

// ---------- 用例 B：中间插入，元素正确后移（位序 1 起始） ----------
console.log('\n用例 B：在第 3 个位置（下标 2）插入 99，元素后移');
{
  const { mem, arr } = makeArray([10, 20, 30, 40, 50]);
  applySteps(mem, arr.planInsert(3, 99));
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
console.log('\n用例 C：删除第 2 个元素（下标 1，值 20），元素前移');
{
  const { mem, arr } = makeArray([10, 20, 30, 40, 50]);
  applySteps(mem, arr.planDelete(2));
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
  assert('栈顶元素为最后入栈的 30（槽位 [2]）', mem.read(st.slots[2].id) === 30);
  assert('top 指向下一个空位（3）', st.top === 3, '实际 ' + st.top);
  assert('空栈时 top == 0', new StackDS(new MemoryModel(), 4).top === 0);

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

// ---------- 用例 F：循环队列（rear 指向下一个空位，牺牲一个单元判满） ----------
console.log('\n用例 F：循环队列的入队 / 出队（FIFO + 环形槽位 + 牺牲一个单元）');
{
  const mem = new MemoryModel();
  const q = new QueueDS(mem, 4); // MaxSize = 4，最多存 3 个

  const order = () => {
    const out = [];
    for (let k = 0; k < q.length; k++) out.push(mem.read(q.slots[(q.front + k) % q.capacity].id));
    return out;
  };

  assert('初始 front == rear == 0（队空）', q.front === 0 && q.rear === 0, `front=${q.front}, rear=${q.rear}`);

  applySteps(mem, q.planEnqueue(1));
  applySteps(mem, q.planEnqueue(2));
  applySteps(mem, q.planEnqueue(3));
  console.log('  入队 1,2,3：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('队列长度 3（MaxSize-1）', q.length === 3, '实际 ' + q.length);
  assert('rear 指向队尾的下一个空位（3）', q.rear === 3, '实际 ' + q.rear);
  assert('从队头到队尾顺序为 [1,2,3]', JSON.stringify(order()) === JSON.stringify([1, 2, 3]), JSON.stringify(order()));

  applySteps(mem, q.planDequeue());
  console.log('  出队一次：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('出队 1 后长度变为 2', q.length === 2, '实际 ' + q.length);
  assert('front 后移到槽位 1', q.front === 1, '实际 ' + q.front);
  assert('原队头槽位已清空', mem.read(q.slots[0].id) === null);

  applySteps(mem, q.planEnqueue(4));
  console.log('  再入队 4：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('4 写入槽位 3', mem.read(q.slots[3].id) === 4);
  assert('rear 绕回 0', q.rear === 0, '实际 ' + q.rear);
  assert('环形顺序为 [2,3,4]', JSON.stringify(order()) === JSON.stringify([2, 3, 4]), JSON.stringify(order()));

  applySteps(mem, q.planDequeue());
  applySteps(mem, q.planEnqueue(5));
  console.log('  出队 2 后再入队 5：', JSON.stringify(order()), 'front =', q.front, 'rear =', q.rear);
  assert('5 绕回写入槽位 0', mem.read(q.slots[0].id) === 5);
  assert('环形顺序为 [3,4,5]', JSON.stringify(order()) === JSON.stringify([3, 4, 5]), JSON.stringify(order()));
  assert('队满时 rear+1 绕回 == front', ((q.rear + 1) % q.capacity) === q.front);

  console.log('  再入队 6（队列满）：', JSON.stringify(order()));
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

// ---------- 用例 H：数组位序（1 起始）与 C 物理下标（0 起始） ----------
console.log('\n用例 H：insert/remove 用位序（1 起始），arr[i] 用物理下标（0 起始）');
{
  const mem = new MemoryModel();
  const arr = new ArrayDS(mem, 6);
  const parsed = CommandParser.parse('int arr[6] = {10, 20, 30};\ninsert(arr, 1, 99);\nremove(arr, 1);');
  arr.setInitialLength(parsed.declaration.values.length);
  const r = CommandParser.buildSteps(arr, parsed.commands, parsed.declaration);
  applySteps(mem, r.steps);
  console.log('  结果：', JSON.stringify(readAll(arr, mem)), 'errors =', r.errors.length);
  assert('insert(arr,1,99) 插到表头、remove(arr,1) 再删掉，最终仍为 [10,20,30]',
    JSON.stringify(readAll(arr, mem)) === JSON.stringify([10, 20, 30]), JSON.stringify(readAll(arr, mem)));
  assert('位序操作无错误', r.errors.length === 0, JSON.stringify(r.errors));

  // arr[i] 是 C 物理下标：arr[0] 修改的是第 1 个元素（位序 1）
  const p2 = CommandParser.parse('int arr[6] = {10, 20, 30};\nset(0, 77);');
  const r2 = CommandParser.buildSteps(arr, p2.commands, p2.declaration);
  applySteps(mem, r2.steps);
  assert('arr[0] / set(0) 修改的是第 1 个元素（位序 1）', readAll(arr, mem)[0] === 77, JSON.stringify(readAll(arr, mem)));

  // arr[0] 在 len=0 时应越界
  const empty = new MemoryModel();
  const arr2 = new ArrayDS(empty, 4);
  const p3 = CommandParser.parse('set(0, 1);');
  const r3 = CommandParser.buildSteps(arr2, p3.commands, null);
  assert('C 下标 0 在空数组时越界报错', r3.errors.length > 0, JSON.stringify(r3.errors));
}

// ---------- 汇总 ----------
console.log('\n===== 测试完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
