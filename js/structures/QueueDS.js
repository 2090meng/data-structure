/**
 * QueueDS.js — 队列（循环队列，连续内存分配）。
 *
 * 队列只在【队尾】入队、在【队头】出队，先进先出（FIFO）。
 * 为了不搬动元素，这里用“循环队列”实现：
 *   front 记录队头槽位下标，length 记录元素个数，
 *   队尾元素槽位 rear = (front + length - 1) % capacity，
 *   下一个可写入槽位 = (front + length) % capacity。
 *
 * 槽位是环形使用的：出队后空出的槽位会被后来的入队填上，
 * 因此画面上的 front / rear 指针会“绕回去”。
 *
 * 与 ArrayDS 一样只是“规划器”：plan* 只产出 Step，不直接改画面。
 */
import { STEP, makeStep } from '../core/Step.js';

export class QueueDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} capacity 队列容量（环形槽位数）
   */
  constructor(memory, capacity = 8) {
    this.kind = 'queue';
    this.memory = memory;
    this.capacity = Math.max(1, capacity);
    this.slots = memory.allocateContiguous(this.capacity);
    this.length = 0; // 队列中的元素个数
    this.front = 0;  // 队头元素所在槽位下标

    this.slots.forEach((b, i) => {
      b.meta.label = '[' + i + ']';
    });
  }

  /** 队尾元素所在槽位（空队列时与 front 相同）。 */
  get rear() {
    return this.length === 0 ? this.front : (this.front + this.length - 1) % this.capacity;
  }

  /** 代码模式声明初始化后，同步元素个数（值从 0 号槽位开始依次填充）。 */
  setInitialLength(n) {
    this.length = Math.max(0, Math.min(n, this.capacity));
    this.front = 0;
  }

  // ---------- 防御性校验：不合法时返回双语错误消息，合法返回 null ----------

  /** 入队前校验：队满则拦截。 */
  enqueueError(len = this.length) {
    if (len >= this.capacity) {
      return {
        zh: `错误：队列已满，无法入队（容量 ${this.capacity}）`,
        en: `Error: the queue is full, cannot enqueue (capacity ${this.capacity})`,
      };
    }
    return null;
  }

  /** 出队前校验：空队列则拦截。 */
  dequeueError(len = this.length) {
    if (len <= 0) {
      return { zh: '错误：队列为空，无法出队', en: 'Error: the queue is empty, cannot dequeue' };
    }
    return null;
  }

  /** 查看队头前校验：空队列则拦截。 */
  frontError(len = this.length) {
    if (len <= 0) {
      return { zh: '错误：队列为空，没有队头元素', en: 'Error: the queue is empty, no front element' };
    }
    return null;
  }

  /** 规划：入队——写入队尾的下一个空槽位，然后元素个数 +1。 */
  planEnqueue(value, len = this.length, mem = this.memory) {
    const steps = [];
    if (len < 0 || len >= this.capacity) return steps; // 队满：由调用方报错

    const slot = (this.front + len) % this.capacity;
    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[slot].id, value }, {
        zh: `入队：把 ${value} 写入队尾槽位 [${slot}]`,
        en: `Enqueue ${value} into slot [${slot}] at the rear`,
      })
    );
    steps.push(makeStep(STEP.META, { run: () => { this.length++; }, undo: () => { this.length--; } }));
    return steps;
  }

  /** 规划：出队——高亮队头并清空，然后 front 后移一位、元素个数 -1。 */
  planDequeue(len = this.length, mem = this.memory) {
    const steps = [];
    if (len <= 0) return steps; // 空队列：由调用方报错

    const slot = this.front;
    const id = this.slots[slot].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `出队：队头为 ${v}（槽位 [${slot}]）`,
        en: `Dequeue: queue front is ${v} (slot [${slot}])`,
      })
    );
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: id }, {
        zh: `元素 ${v} 已从队头出队`,
        en: `Element ${v} dequeued from the front`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
    steps.push(
      makeStep(STEP.META, {
        run: () => { this.front = (this.front + 1) % this.capacity; this.length--; },
        undo: () => { this.front = slot; this.length++; },
      })
    );
    return steps;
  }

  /** 规划：查看队头（只读，不改变队列内容）。 */
  planFront(len = this.length, mem = this.memory) {
    const steps = [];
    if (len <= 0) return steps;

    const slot = this.front;
    const id = this.slots[slot].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `查看队头：槽位 [${slot}] 的值为 ${v}`,
        en: `Front: value at slot [${slot}] is ${v}`,
      })
    );
    steps.push(
      makeStep(STEP.RESULT, { block: id, found: true }, {
        zh: `队头元素是 ${v}`,
        en: `Queue front is ${v}`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
    return steps;
  }

  /** 规划：从队头到队尾（环形顺序）查找 value。 */
  planSearch(value, len = this.length, mem = this.memory) {
    const steps = [];
    for (let k = 0; k < len; k++) {
      const slot = (this.front + k) % this.capacity;
      const id = this.slots[slot].id;
      const cur = mem.read(id);
      steps.push(
        makeStep(STEP.COMPARE, { block: id }, {
          zh: `比较第 ${k} 个元素：槽位 [${slot}] 当前值 ${cur} 与目标 ${value}`,
          en: `Compare element ${k}: slot [${slot}] ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: id, found: true }, {
            zh: `在槽位 [${slot}] 找到目标值 ${value}`,
            en: `Found ${value} at slot [${slot}]`,
          })
        );
        return steps;
      }
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: false }, {
        zh: `队列中未找到目标值 ${value}`,
        en: `Value ${value} not found in the queue`,
      })
    );
    return steps;
  }

  /** 代码模式兼容：只有“在队尾追加”（index === 元素个数）才等价于入队。 */
  planInsert(index, value, len = this.length, mem = this.memory) {
    if (index !== len) return [];
    return this.planEnqueue(value, len, mem);
  }

  /** 代码模式兼容：只有“删除队头”（index === 0）才等价于出队。 */
  planDelete(index, len = this.length, mem = this.memory) {
    if (index !== 0) return [];
    return this.planDequeue(len, mem);
  }

  /** 渲染视图描述：横排环形槽位，标出 front / rear 指针。 */
  view() {
    return {
      layout: 'grid',
      title: 'Queue / 队列',
      pointers: [
        { blockId: this.slots[this.front].id, label: 'front = ' + this.front },
        { blockId: this.slots[this.rear].id, label: 'rear = ' + this.rear },
      ],
    };
  }
}
