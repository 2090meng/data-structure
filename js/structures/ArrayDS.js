/**
 * ArrayDS.js — 数组数据结构（连续内存分配）。
 *
 * 本类是一个“规划器”：`plan*` 方法只读取当前内存状态、产出一个 Step 数组，
 * 不直接修改画面，也不立即修改内存——真正的状态推进由 Animator 逐步完成。
 *
 * 数组在内存中占用一段【连续地址】的槽位：
 *   [0]   [1]   [2]  ...
 *  0x1000 0x1004 0x1008  （每槽 4 字节）
 * 插入 / 删除会引起元素在连续区间内整体移动。
 */
import { STEP, makeStep } from '../core/Step.js';

export class ArrayDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} capacity 数组容量（预分配的连续槽位数）
   */
  constructor(memory, capacity = 8) {
    this.memory = memory;
    this.capacity = capacity;
    // 一次性连续分配 capacity 个槽位，地址连续
    this.slots = memory.allocateContiguous(capacity);
    this.length = 0; // 当前已存储的元素个数

    // 给每个槽位打上下标标签，渲染时显示在块下方
    this.slots.forEach((b, i) => {
      b.meta.label = '[' + i + ']';
    });
  }

  /** 规划：在 index 位置插入 value。 */
  planInsert(index, value) {
    const steps = [];
    if (index < 0 || index > this.length || this.length >= this.capacity) {
      return steps; // 非法：由 main 层先做校验
    }

    // 从尾部开始，把 [index, length-1] 的元素逐个向后移一位
    for (let i = this.length - 1; i >= index; i--) {
      const from = this.slots[i].id;
      const to = this.slots[i + 1].id;
      const moved = this.memory.read(from);
      steps.push(
        makeStep(STEP.MOVE_VALUE, { from, to }, {
          zh: `将元素 ${moved} 从下标 ${i} 后移到下标 ${i + 1}`,
          en: `Move element ${moved} from index ${i} to index ${i + 1}`,
        })
      );
    }

    // 在新位置写入新值
    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[index].id, value }, {
        zh: `在下标 ${index} 写入新元素 ${value}`,
        en: `Write new element ${value} at index ${index}`,
      })
    );

    // 元数据更新：元素个数 +1（动画执行到此处才生效）
    steps.push(makeStep(STEP.META, { run: () => { this.length++; } }));

    return steps;
  }

  /** 规划：删除 index 位置的元素。 */
  planDelete(index) {
    const steps = [];
    if (index < 0 || index >= this.length) return steps;

    // 把 [index+1, length-1] 的元素依次向前移动一位覆盖被删元素
    for (let i = index; i < this.length - 1; i++) {
      const from = this.slots[i + 1].id;
      const to = this.slots[i].id;
      const moved = this.memory.read(from);
      steps.push(
        makeStep(STEP.MOVE_VALUE, { from, to }, {
          zh: `将元素 ${moved} 从下标 ${i + 1} 前移到下标 ${i}`,
          en: `Move element ${moved} from index ${i + 1} to index ${i}`,
        })
      );
    }

    // 清空尾部多余槽位
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: this.slots[this.length - 1].id }, {
        zh: `清除下标 ${this.length - 1}（元素已前移）`,
        en: `Clear index ${this.length - 1}`,
      })
    );

    // 元数据更新：元素个数 -1
    steps.push(makeStep(STEP.META, { run: () => { this.length--; } }));

    return steps;
  }

  /** 规划：查找 value，返回逐个比较的步骤序列。 */
  planSearch(value) {
    const steps = [];
    for (let i = 0; i < this.length; i++) {
      const id = this.slots[i].id;
      const cur = this.memory.read(id);
      steps.push(
        makeStep(STEP.COMPARE, { block: id }, {
          zh: `比较下标 ${i}：当前值 ${cur} 与目标 ${value}`,
          en: `Compare index ${i}: ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: id, found: true }, {
            zh: `在下标 ${i} 找到目标值 ${value}`,
            en: `Found value ${value} at index ${i}`,
          })
        );
        return steps;
      }
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: false }, {
        zh: `未找到目标值 ${value}`,
        en: `Value ${value} not found`,
      })
    );
    return steps;
  }
}