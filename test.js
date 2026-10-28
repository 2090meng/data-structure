/**
 * test.js — 纯逻辑自测脚本（不涉及 DOM / 渲染）。
 *
 * 只引入 structures 与 core 中的核心类，验证数组的赋值覆盖、插入后移、
 * 删除前移、以及越界时的防御性报错。运行方式：node test.js
 */
import { MemoryModel } from './js/core/MemoryModel.js';
import { ArrayDS } from './js/structures/ArrayDS.js';
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

// ---------- 汇总 ----------
console.log('\n===== 测试完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
