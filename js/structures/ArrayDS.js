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
 *
 * 位序按考研教材（严蔚敏《数据结构》C 语言版）：**从 1 开始**。
 *   插入位置 i 取值 1..length+1（第 length+1 个位置表示表尾追加）；
 *   删除 / 修改位置 i 取值 1..length。
 * 位序 i 对应物理下标 i-1，画布上的槽位标签仍显示物理下标 [0..n-1]，
 * 日志会同时给出“第 i 个元素”和“下标 i-1”，避免两种编号混淆。
 *
 * plan* 方法支持可选参数 len / mem：
 *   len —— 该次规划应假设的“当前元素个数”（代码模式连续规划多行时使用）；
 *   mem —— 读取元素值的数据源（代码模式用模拟内存，避免读到旧值）。
 * 单次操作可省略，默认使用 this.length / this.memory。
 */
import { STEP, makeStep } from '../core/Step.js';

export class ArrayDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} capacity 数组容量（预分配的连续槽位数）
   */
  constructor(memory, capacity = 8) {
    this.kind = 'array';
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

  /** 代码模式声明初始化后，同步元素个数。 */
  setInitialLength(n) {
    this.length = Math.max(0, Math.min(n, this.capacity));
  }

  /** 渲染视图描述：默认网格布局，无额外指针。 */
  view() {
    return { layout: 'grid', title: 'Memory / 内存', pointers: [] };
  }

  /** 规划：把第 pos 个元素（位序，1 起始）的值改写为 value（长度不变）。 */
  planSet(pos, value, len = this.length) {
    const steps = [];
    const index = pos - 1;
    if (index < 0 || index >= len) return steps;
    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[index].id, value }, {
        zh: `修改第 ${pos} 个元素（下标 ${index}）为 ${value}`,
        en: `Set element ${pos} (index ${index}) to ${value}`,
      })
    );
    return steps;
  }

  /** 规划：交换第 posA 与第 posB 个元素（位序，1 起始）。 */
  planSwap(posA, posB, len = this.length) {
    const steps = [];
    const indexA = posA - 1;
    const indexB = posB - 1;
    if (indexA === indexB || indexA < 0 || indexA >= len || indexB < 0 || indexB >= len) {
      return steps;
    }
    steps.push(
      makeStep(STEP.SWAP, { a: this.slots[indexA].id, b: this.slots[indexB].id }, {
        zh: `交换第 ${posA} 个（下标 ${indexA}）与第 ${posB} 个（下标 ${indexB}）元素`,
        en: `Swap element ${posA} (index ${indexA}) and element ${posB} (index ${indexB})`,
      })
    );
    return steps;
  }

  /** 规划：在第 pos 个位置插入 value（位序，1..length+1）。 */
  planInsert(pos, value, len = this.length, mem = this.memory) {
    const steps = [];
    const index = pos - 1;
    if (index < 0 || index > len || len >= this.capacity) {
      return steps; // 非法：由 main 层先做校验
    }

    // 从尾部开始，把 [index, len-1] 的元素逐个向后移一位
    for (let i = len - 1; i >= index; i--) {
      const from = this.slots[i].id;
      const to = this.slots[i + 1].id;
      const moved = mem.read(from);
      steps.push(
        makeStep(STEP.MOVE_VALUE, { from, to }, {
          zh: `将第 ${i + 1} 个元素 ${moved}（下标 ${i}）后移到下标 ${i + 1}`,
          en: `Move element ${i + 1} (${moved}) from index ${i} to index ${i + 1}`,
        })
      );
    }

    // 在新位置写入新值
    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[index].id, value }, {
        zh: `在第 ${pos} 个位置（下标 ${index}）写入新元素 ${value}`,
        en: `Write new element ${value} at position ${pos} (index ${index})`,
      })
    );

    // 元数据更新：元素个数 +1（动画执行到此处才生效）
    steps.push(makeStep(STEP.META, { run: () => { this.length++; }, undo: () => { this.length--; } }));

    return steps;
  }

  /** 规划：删除第 pos 个元素（位序，1..length）。 */
  planDelete(pos, len = this.length, mem = this.memory) {
    const steps = [];
    const index = pos - 1;
    if (index < 0 || index >= len) return steps;

    // 把 [index+1, len-1] 的元素依次向前移动一位覆盖被删元素
    for (let i = index; i < len - 1; i++) {
      const from = this.slots[i + 1].id;
      const to = this.slots[i].id;
      const moved = mem.read(from);
      steps.push(
        makeStep(STEP.MOVE_VALUE, { from, to }, {
          zh: `将第 ${i + 2} 个元素 ${moved}（下标 ${i + 1}）前移到下标 ${i}`,
          en: `Move element ${i + 2} (${moved}) from index ${i + 1} to index ${i}`,
        })
      );
    }

    // 清空尾部多余槽位
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: this.slots[len - 1].id }, {
        zh: `清除下标 ${len - 1}（元素已前移）`,
        en: `Clear index ${len - 1}`,
      })
    );

    // 元数据更新：元素个数 -1
    steps.push(makeStep(STEP.META, { run: () => { this.length--; }, undo: () => { this.length++; } }));

    return steps;
  }

  /** 规划：查找 value，返回逐个比较的步骤序列。 */
  planSearch(value, len = this.length, mem = this.memory) {
    const steps = [];
    for (let i = 0; i < len; i++) {
      const id = this.slots[i].id;
      const cur = mem.read(id);
      steps.push(
        makeStep(STEP.COMPARE, { block: id }, {
          zh: `比较第 ${i + 1} 个元素（下标 ${i}）：当前值 ${cur} 与目标 ${value}`,
          en: `Compare element ${i + 1} (index ${i}): ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: id, found: true }, {
            zh: `在第 ${i + 1} 个位置（下标 ${i}）找到目标值 ${value}`,
            en: `Found ${value} at element ${i + 1} (index ${i})`,
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