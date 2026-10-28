/**
 * StackDS.js — 栈（顺序栈，连续内存分配）。
 *
 * 栈只在【栈顶】操作，后进先出（LIFO）：
 *   slots[0] 是栈底，slots[length-1] 是栈顶，未使用的槽位保持空值。
 *
 * 与 ArrayDS 一样只是“规划器”：plan* 只产出 Step 数组，不直接改画面，
 * 真正的内存推进由 Animator 逐步完成。为了能被代码模式复用，
 * 这里同时提供 planInsert / planDelete 两个“下标接口”（仅在栈顶时有效）。
 */
import { STEP, makeStep } from '../core/Step.js';

export class StackDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} capacity 栈容量（预分配的连续槽位数）
   */
  constructor(memory, capacity = 8) {
    this.kind = 'stack';
    this.memory = memory;
    this.capacity = capacity;
    this.slots = memory.allocateContiguous(capacity);
    this.length = 0; // 栈中元素个数，栈顶下标 = length - 1

    this.slots.forEach((b, i) => {
      b.meta.label = '[' + i + ']';
    });
  }

  /** 栈顶下标（空栈为 -1）。 */
  get top() {
    return this.length - 1;
  }

  /** 代码模式声明初始化后，同步元素个数（栈底固定从 0 开始）。 */
  setInitialLength(n) {
    this.length = Math.max(0, Math.min(n, this.capacity));
  }

  // ---------- 防御性校验：不合法时返回双语错误消息，合法返回 null ----------

  /** 入栈前校验：栈满则拦截。 */
  pushError(len = this.length) {
    if (len >= this.capacity) {
      return {
        zh: `错误：栈已满，无法压入（容量 ${this.capacity}）`,
        en: `Error: the stack is full, cannot push (capacity ${this.capacity})`,
      };
    }
    return null;
  }

  /** 出栈前校验：空栈则拦截。 */
  popError(len = this.length) {
    if (len <= 0) {
      return { zh: '错误：栈为空，无法弹出', en: 'Error: the stack is empty, cannot pop' };
    }
    return null;
  }

  /** 取栈顶前校验：空栈则拦截。 */
  peekError(len = this.length) {
    if (len <= 0) {
      return { zh: '错误：栈为空，没有栈顶元素', en: 'Error: the stack is empty, no top element' };
    }
    return null;
  }

  /** 规划：入栈——把 value 写到 slots[length]，然后元素个数 +1。 */
  planPush(value, len = this.length, mem = this.memory) {
    const steps = [];
    if (len < 0 || len >= this.capacity) return steps; // 栈满：由调用方报错

    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[len].id, value }, {
        zh: `入栈：把 ${value} 压入栈顶（槽位 [${len}]）`,
        en: `Push ${value} onto the stack top (slot [${len}])`,
      })
    );
    steps.push(makeStep(STEP.META, { run: () => { this.length++; }, undo: () => { this.length--; } }));
    return steps;
  }

  /** 规划：出栈——先高亮栈顶，再清空它，最后元素个数 -1。 */
  planPop(len = this.length, mem = this.memory) {
    const steps = [];
    if (len <= 0) return steps; // 空栈：由调用方报错

    const idx = len - 1;
    const id = this.slots[idx].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `出栈：栈顶为 ${v}（槽位 [${idx}]）`,
        en: `Pop: stack top is ${v} (slot [${idx}])`,
      })
    );
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: id }, {
        zh: `元素 ${v} 已从栈顶弹出`,
        en: `Element ${v} popped from the top`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
    steps.push(makeStep(STEP.META, { run: () => { this.length--; }, undo: () => { this.length++; } }));
    return steps;
  }

  /** 规划：取栈顶（只读，不改变栈内容）。 */
  planPeek(len = this.length, mem = this.memory) {
    const steps = [];
    if (len <= 0) return steps;

    const idx = len - 1;
    const id = this.slots[idx].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `取栈顶：槽位 [${idx}] 的值为 ${v}`,
        en: `Peek: value at slot [${idx}] is ${v}`,
      })
    );
    steps.push(
      makeStep(STEP.RESULT, { block: id, found: true }, {
        zh: `栈顶元素是 ${v}`,
        en: `Stack top is ${v}`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
    return steps;
  }

  /** 规划：从栈顶向栈底查找 value。 */
  planSearch(value, len = this.length, mem = this.memory) {
    const steps = [];
    for (let i = len - 1; i >= 0; i--) {
      const id = this.slots[i].id;
      const cur = mem.read(id);
      steps.push(
        makeStep(STEP.COMPARE, { block: id }, {
          zh: `比较槽位 [${i}]：当前值 ${cur} 与目标 ${value}`,
          en: `Compare slot [${i}]: ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: id, found: true }, {
            zh: `在槽位 [${i}] 找到目标值 ${value}`,
            en: `Found ${value} at slot [${i}]`,
          })
        );
        return steps;
      }
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: false }, {
        zh: `栈中未找到目标值 ${value}`,
        en: `Value ${value} not found in the stack`,
      })
    );
    return steps;
  }

  /** 代码模式兼容：只有“在栈顶插入”（index === 元素个数）才等价于入栈。 */
  planInsert(index, value, len = this.length, mem = this.memory) {
    if (index !== len) return [];
    return this.planPush(value, len, mem);
  }

  /** 代码模式兼容：只有“删除栈顶”（index === 元素个数-1）才等价于出栈。 */
  planDelete(index, len = this.length, mem = this.memory) {
    if (index !== len - 1) return [];
    return this.planPop(len, mem);
  }

  /** 渲染视图描述：竖排（栈底在下），并标示栈顶指针 top。 */
  view() {
    const idx = Math.max(0, Math.min(this.length - 1, this.slots.length - 1));
    return {
      layout: 'column',
      title: 'Stack / 栈',
      pointers: [{ blockId: this.slots[idx].id, label: 'top = ' + this.top }],
    };
  }
}
