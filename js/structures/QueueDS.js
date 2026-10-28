/**
 * QueueDS.js — 队列（循环队列，连续内存分配）。
 *
 * 语义按考研教材（严蔚敏《数据结构》C 语言版），采用【牺牲一个存储单元】判满：
 *   Q.front 指向队头元素；Q.rear 指向队尾元素的下一个位置（即下一个空位）。
 *   初始：Q.front = Q.rear = 0。
 *   入队：Q.data[Q.rear] = x; Q.rear = (Q.rear + 1) % MaxSize;
 *   出队：e = Q.data[Q.front]; Q.front = (Q.front + 1) % MaxSize;
 *   队空：Q.front == Q.rear；
 *   队满：(Q.rear + 1) % MaxSize == Q.front（最多存 MaxSize - 1 个元素）。
 *
 * 槽位环形使用：出队后空出的槽位会被后来的入队填上，front / rear 会“绕回去”，
 * 因而不存在普通数组队列的“假溢出”。
 * length 内部记录元素个数，rear = (front + length) % capacity，三者始终一致。
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

  /** 队尾指针 Q.rear：指向队尾元素的下一个位置（空队列与 full 时与 front 相同）。 */
  get rear() {
    return (this.front + this.length) % this.capacity;
  }

  /** 最大可存元素个数（牺牲一个单元：MaxSize - 1）。 */
  get maxSize() {
    return Math.max(0, this.capacity - 1);
  }

  /** 代码模式声明初始化后，同步元素个数（值从 0 号槽位开始依次填充）。 */
  setInitialLength(n) {
    this.length = Math.max(0, Math.min(n, this.maxSize));
    this.front = 0;
  }

  // ---------- 防御性校验：不合法时返回双语错误消息，合法返回 null ----------

  /**
   * 入队前校验：队满、或目标槽位已被占用（指针错乱）时拦截。
   * @param {number} len 规划期的元素个数（默认取当前真实值）
   * @param {number} front 规划期的队头槽位（默认取当前真实值）
   * @param {{read:(id:string)=>number|null}} mem 规划期的内存（默认取真实内存）
   */
  enqueueError(len = this.length, front = this.front, mem = this.memory) {
    // 教材判满：(Q.rear + 1) % MaxSize == Q.front，等价于元素个数 == MaxSize - 1。
    if (len >= this.maxSize) {
      const rear = (front + len) % this.capacity;
      return {
        zh: `错误：队列已满（(rear + 1) % MaxSize = ${(rear + 1) % this.capacity} == front = ${front}，最多存 ${this.maxSize} 个），无法入队`,
        en: `Error: the queue is full ((rear + 1) % MaxSize == front = ${front}, capacity ${this.maxSize}), cannot enqueue`,
      };
    }

    // 防覆盖：目标槽位若仍有有效元素，说明 front/length 指针与实际数据不一致。
    const slot = (front + len) % this.capacity;
    const occupied = mem.read(this.slots[slot].id);
    if (occupied !== null && occupied !== undefined) {
      return {
        zh: `错误：队尾槽位 [${slot}] 仍存有 ${occupied}，继续入队会覆盖数据（front = ${front}，元素 ${len}，指针状态错乱）`,
        en: `Error: slot [${slot}] still holds ${occupied}; enqueue would overwrite data (front = ${front}, length ${len})`,
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

  /**
   * 规划：入队——写入队尾的下一个空槽位，然后元素个数 +1。
   *
   * 注意：`front` 必须允许由调用方传入“规划期的队头下标”。
   * 代码模式会一次性规划多行指令，此时队列真实的 front 还没随动画更新，
   * 若直接用 this.front，出队后的下一次入队就会写回旧槽位、覆盖已有元素。
   */
  planEnqueue(value, len = this.length, mem = this.memory, front = this.front) {
    const steps = [];
    if (this.enqueueError(len, front, mem)) return steps; // 队满或槽位被占用：由调用方报错

    const slot = (front + len) % this.capacity;
    const nextRear = (slot + 1) % this.capacity;
    steps.push(
      makeStep(STEP.SET_VALUE, { block: this.slots[slot].id, value }, {
        zh: `入队：Q.data[Q.rear] = ${value}（Q.rear = ${slot}，先存数据）`,
        en: `Enqueue: Q.data[Q.rear] = ${value} (Q.rear = ${slot}, store data first)`,
      })
    );
    steps.push(
      makeStep(STEP.META, { run: () => { this.length++; }, undo: () => { this.length--; } }, {
        zh: `Q.rear = (Q.rear + 1) % ${this.capacity} → ${nextRear}，元素个数 = ${len + 1}（front = ${front}）`,
        en: `Q.rear = (Q.rear + 1) % ${this.capacity} → ${nextRear}, size = ${len + 1} (front = ${front})`,
      })
    );
    return steps;
  }

  /** 规划：出队——高亮队头并清空，然后 front 后移一位、元素个数 -1。 */
  planDequeue(len = this.length, mem = this.memory, front = this.front) {
    const steps = [];
    if (len <= 0) return steps; // 空队列：由调用方报错

    const slot = front;
    const id = this.slots[slot].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `出队：e = Q.data[Q.front] = Q.data[${slot}] = ${v}`,
        en: `Dequeue: e = Q.data[Q.front] = Q.data[${slot}] = ${v}`,
      })
    );
    steps.push(
      makeStep(STEP.CLEAR_VALUE, { block: id }, {
        zh: `元素 ${v} 已从队头出队`,
        en: `Element ${v} dequeued from the front`,
      })
    );

    const nextFront = (front + 1) % this.capacity;
    const nextLen = len - 1;
    steps.push(
      makeStep(STEP.META, {
        run: () => { this.front = (this.front + 1) % this.capacity; this.length--; },
        undo: () => { this.front = slot; this.length++; },
      }, {
        zh: `Q.front = (Q.front + 1) % ${this.capacity} → ${nextFront}，元素个数 = ${nextLen}（rear = ${(nextFront + nextLen) % this.capacity}）`,
        en: `Q.front = (Q.front + 1) % ${this.capacity} → ${nextFront}, size = ${nextLen} (rear = ${(nextFront + nextLen) % this.capacity})`,
      })
    );
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));
    return steps;
  }

  /** 规划：查看队头（只读，不改变队列内容）。 */
  planFront(len = this.length, mem = this.memory, front = this.front) {
    const steps = [];
    if (len <= 0) return steps;

    const slot = front;
    const id = this.slots[slot].id;
    const v = mem.read(id);

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `查看队头：e = Q.data[Q.front] = Q.data[${slot}] = ${v}`,
        en: `Front: e = Q.data[Q.front] = Q.data[${slot}] = ${v}`,
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
  planSearch(value, len = this.length, mem = this.memory, front = this.front) {
    const steps = [];
    for (let k = 0; k < len; k++) {
      const slot = (front + k) % this.capacity;
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
  planInsert(index, value, len = this.length, mem = this.memory, front = this.front) {
    if (index !== len) return [];
    return this.planEnqueue(value, len, mem, front);
  }

  /** 代码模式兼容：只有“删除队头”（index === 0）才等价于出队。 */
  planDelete(index, len = this.length, mem = this.memory, front = this.front) {
    if (index !== 0) return [];
    return this.planDequeue(len, mem, front);
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
