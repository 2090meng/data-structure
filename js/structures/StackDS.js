/**
 * StackDS.js — 栈（顺序栈，连续内存分配）。
 *
 * 语义按考研教材（严蔚敏《数据结构》C 语言版）：
 *   S.top 指向【栈顶元素的下一个位置】（即下一个空槽位），初值 S.top = 0。
 *   入栈：S.data[S.top] = x; S.top++;   —— 先录入数据，再让栈顶指针上移
 *   出栈：S.top--; e = S.data[S.top];   —— 先让栈顶指针下移，再取出数据
 *   栈空：S.top == 0；栈满：S.top == MaxSize
 *   slots[0] 是栈底，slots[length-1] 是最上面的元素，length 与 S.top 数值相同。
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
    this.length = 0; // 栈中元素个数；S.top 指向下一个空位，数值上等于 length

    this.slots.forEach((b, i) => {
      b.meta.label = '[' + i + ']';
    });
  }

  /** 栈顶指针 S.top：指向栈顶元素的下一个位置（空栈为 0，栈满为 capacity）。 */
  get top() {
    return this.length;
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

  /** 规划：入栈——教材 `S.data[S.top] = x; S.top++`（先写数据，指针再上移）。 */
  planPush(value, len = this.length, mem = this.memory) {
    const steps = [];
    if (len < 0 || len >= this.capacity) return steps; // 栈满：由调用方报错

    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[len].id, value }, {
        zh: `入栈：S.data[S.top] = ${value}（S.top = ${len}，先录入数据）`,
        en: `Push: S.data[S.top] = ${value} (S.top = ${len}, store data first)`,
      })
    );
    steps.push(
      makeStep(STEP.META, { run: () => { this.length++; }, undo: () => { this.length--; } }, {
        zh: `S.top++ → S.top = ${len + 1}（栈顶指针移到下一个地址）`,
        en: `S.top++ → S.top = ${len + 1} (top pointer moves to the next address)`,
      })
    );
    return steps;
  }

  /** 规划：出栈——教材 `S.top--; e = S.data[S.top]`（指针先下移，再取数据）。 */
  planPop(len = this.length, mem = this.memory) {
    const steps = [];
    if (len <= 0) return steps; // 空栈：由调用方报错

    const idx = len - 1;
    const id = this.slots[idx].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `出栈：S.top--（${len} → ${idx}），准备取出 S.data[${idx}]`,
        en: `Pop: S.top-- (${len} → ${idx}), about to read S.data[${idx}]`,
      })
    );
    steps.push(
      makeStep(STEP.META, { run: () => { this.length--; }, undo: () => { this.length++; } }, {
        zh: `S.top-- → S.top = ${idx}（栈顶指针先下移）`,
        en: `S.top-- → S.top = ${idx} (top pointer moves down first)`,
      })
    );
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: id }, {
        zh: `e = S.data[${idx}] = ${v}，元素 ${v} 已出栈`,
        en: `e = S.data[${idx}] = ${v}; element ${v} popped`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
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
        zh: `取栈顶：e = S.data[S.top-1] = S.data[${idx}] = ${v}`,
        en: `Peek: e = S.data[S.top-1] = S.data[${idx}] = ${v}`,
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

  /** 代码模式兼容：位序 index 恰好是栈顶的下一个位置（len+1）时等价于入栈。 */
  planInsert(index, value, len = this.length, mem = this.memory) {
    if (index !== len + 1) return [];
    return this.planPush(value, len, mem);
  }

  /** 代码模式兼容：位序 index 恰好是栈顶元素（len）时等价于出栈。 */
  planDelete(index, len = this.length, mem = this.memory) {
    if (index !== len) return [];
    return this.planPop(len, mem);
  }

  /** 渲染视图描述：竖排（栈底在下），top 指向栈顶元素的下一个空槽位。 */
  view() {
    const idx = Math.max(0, Math.min(this.length, this.slots.length - 1));
    return {
      layout: 'column',
      title: 'Stack / 栈',
      pointers: [{ blockId: this.slots[idx].id, label: 'top = ' + this.top }],
    };
  }
}
