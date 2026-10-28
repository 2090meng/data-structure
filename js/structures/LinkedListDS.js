/**
 * LinkedListDS.js — 单链表（带头结点，链式存储）。
 *
 * 语义按考研教材（严蔚敏《数据结构》C 语言版）：
 *   L 为头指针，指向【头结点】（头结点的数据域不使用，只为统一插入/删除操作）。
 *   第 i 个元素由 head->next 起沿 next 指针依次可达，位序 i 从 1 开始。
 *   插入（在第 i 个位置前插）：
 *       p = GetElem(L, i-1);
 *       s = (LinkNode)malloc(sizeof(LNode));
 *       s->data = e;
 *       s->next = p->next;   // ① 先让新结点指向原第 i 个结点
 *       p->next = s;         // ② 再让前驱结点指向新结点（顺序不可交换）
 *   删除第 i 个结点：
 *       p = GetElem(L, i-1);  q = p->next;
 *       p->next = q->next;
 *       e = q->data;  free(q);
 *   查找：p = L->next; while (p && p->data != e) p = p->next;
 *
 * 链式存储的每个结点单独 malloc（memory.allocateOne），相邻结点之间留有空隙，
 * 因此地址【不连续】——这正是与顺序表最本质的差别。
 *
 * 与 ArrayDS / StackDS 一样只是“规划器”：plan* 只产出 Step 数组，不直接改画面。
 * 其中“挂链”动作放在 STEP.META 的 run/undo 回调里，动画执行到那一步才真正生效，
 * 这样“先 s->next = p->next、再 p->next = s”的先后顺序在画面上可见。
 */
import { STEP, makeStep } from '../core/Step.js';
import { MemoryModel } from '../core/MemoryModel.js';

// 相邻结点之间预留的空闲单元数（轮流取值，制造“地址不连续”的效果）
const GAPS = [2, 3, 4];

export class LinkedListDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} maxNodes 数据结点个数上限（演示用，防止无限增长）
   */
  constructor(memory, maxNodes = 8) {
    this.kind = 'linked';
    this.memory = memory;
    this.maxNodes = Math.max(1, maxNodes);

    // 头结点：单独分配，数据域不使用
    this.head = memory.allocateOne(GAPS[0]);
    this.head.meta.label = '头结点';

    this.chain = [];                    // 数据结点 id，按逻辑顺序（第 1 个 -> 最后 1 个）
    this.next = new Map([[this.head.id, null]]); // 结点 id -> 后继 id（null 表示 NULL）
    this.length = 0;
    this._gapTurn = 1;
  }

  /** 规划期上下文：代码模式连续规划多行时，plan* 共享它来推演链表形态。 */
  planningContext() {
    return { chain: this.chain.slice(), length: this.length };
  }

  /** 分配一个新结点（地址与已有结点不连续）。 */
  _allocNode() {
    const b = this.memory.allocateOne(GAPS[this._gapTurn % GAPS.length]);
    this._gapTurn++;
    return b;
  }

  /** 结点地址文本（NULL 表示空指针）。 */
  _addr(id) {
    const b = id ? this.memory.getBlock(id) : null;
    return b ? MemoryModel.formatAddress(b.address) : 'NULL';
  }

  /** 第 pos 个结点的前驱：pos == 1 时前驱是头结点。 */
  _prevOf(pos, chain) {
    return pos === 1 ? this.head.id : chain[pos - 2];
  }

  // ---------- 防御性校验：不合法时返回双语错误消息，合法返回 null ----------

  /** 插入前校验：位序 1..len+1，且未超过演示上限。 */
  insertError(pos, len = this.length) {
    if (!Number.isInteger(pos) || pos < 1 || pos > len + 1) {
      return {
        zh: `错误：插入位序 ${pos} 越界（应为 1..${len + 1}）`,
        en: `Error: insert position ${pos} out of range (1..${len + 1})`,
      };
    }
    if (len >= this.maxNodes) {
      return {
        zh: `错误：结点数已达演示上限 ${this.maxNodes}，无法继续插入`,
        en: `Error: node limit ${this.maxNodes} reached, cannot insert`,
      };
    }
    return null;
  }

  /** 删除前校验：非空且位序 1..len。 */
  deleteError(pos, len = this.length) {
    if (len <= 0) {
      return { zh: '错误：链表为空，无法删除', en: 'Error: the linked list is empty, cannot delete' };
    }
    if (!Number.isInteger(pos) || pos < 1 || pos > len) {
      return {
        zh: `错误：删除位序 ${pos} 越界（应为 1..${len}）`,
        en: `Error: delete position ${pos} out of range (1..${len})`,
      };
    }
    return null;
  }

  /** 查找前校验：空表无法查找。 */
  searchError(len = this.length) {
    if (len <= 0) {
      return { zh: '错误：链表为空，无法查找', en: 'Error: the linked list is empty, nothing to search' };
    }
    return null;
  }

  // ---------- 规划 ----------

  /**
   * 规划：在第 pos 个位置前插入 value（位序 1..len+1）。
   * @param {object|null} ctx 规划期上下文（代码模式传入，会就地推进其 chain）
   */
  planInsert(pos, value, len = this.length, mem = this.memory, ctx = null) {
    const state = ctx || { chain: this.chain.slice(), length: this.length };
    const chain = state.chain;
    if (this.insertError(pos, chain.length)) return [];

    const prevId = this._prevOf(pos, chain);
    const qId = pos <= chain.length ? chain[pos - 1] : null;
    const node = this._allocNode();
    node.meta.label = '新结点';
    const steps = [];

    // ① p = GetElem(L, i-1)
    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: prevId }, {
        zh: `p = GetElem(L, ${pos - 1})：${pos === 1 ? 'p 指向头结点' : `p 指向第 ${pos - 1} 个结点`}（${this._addr(prevId)}）`,
        en: `p = GetElem(L, ${pos - 1}): ${pos === 1 ? 'p is the head node' : `p points to node ${pos - 1}`} (${this._addr(prevId)})`,
      })
    );

    // ② s = malloc(...); s->data = e
    steps.push(
      makeStep(STEP.SET_VALUE, { block: node.id, value }, {
        zh: `s = (LinkNode)malloc(sizeof(LNode))；s->data = ${value}（新结点 ${MemoryModel.formatAddress(node.address)}）`,
        en: `s = malloc(...); s->data = ${value} (new node at ${MemoryModel.formatAddress(node.address)})`,
      })
    );

    // ③ s->next = p->next（先挂后链）
    steps.push(
      makeStep(STEP.META, {
        run: () => { this.next.set(node.id, qId); },
        undo: () => { this.next.delete(node.id); },
      }, {
        zh: `s->next = p->next（指向 ${qId ? this._addr(qId) : 'NULL'}）`,
        en: `s->next = p->next (points to ${qId ? this._addr(qId) : 'NULL'})`,
      })
    );

    // ④ p->next = s（前驱指向新结点，新结点正式入链）
    steps.push(
      makeStep(STEP.META, {
        run: () => {
          this.next.set(prevId, node.id);
          this.chain.splice(pos - 1, 0, node.id);
          this.length++;
        },
        undo: () => {
          this.next.set(prevId, qId);
          const i = this.chain.indexOf(node.id);
          if (i >= 0) this.chain.splice(i, 1);
          this.length--;
        },
      }, {
        zh: `p->next = s：新结点成为第 ${pos} 个结点，元素个数 = ${chain.length + 1}`,
        en: `p->next = s: the new node becomes element ${pos}, size = ${chain.length + 1}`,
      })
    );

    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: prevId }));

    // 推进规划期状态（只有传入 ctx 时才影响后续指令的规划）
    chain.splice(pos - 1, 0, node.id);
    state.length = chain.length;
    return steps;
  }

  /**
   * 规划：删除第 pos 个结点（位序 1..len）。
   * 被删除的结点只“摘链”，内存并不回收（灰显在行尾），这与教材 free(q) 的语义一致：
   * 结点脱离链表后不再有指针可达，但其内存块仍然存在。
   */
  planDelete(pos, len = this.length, mem = this.memory, ctx = null) {
    const state = ctx || { chain: this.chain.slice(), length: this.length };
    const chain = state.chain;
    if (this.deleteError(pos, chain.length)) return [];

    const prevId = this._prevOf(pos, chain);
    const id = chain[pos - 1];
    const nextId = pos < chain.length ? chain[pos] : null;
    const block = this.memory.getBlock(id);
    const v = mem.read(id);
    const steps = [];

    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: prevId }, {
        zh: `p = GetElem(L, ${pos - 1})：${pos === 1 ? 'p 指向头结点' : `p 指向第 ${pos - 1} 个结点`}（${this._addr(prevId)}）`,
        en: `p = GetElem(L, ${pos - 1}): ${pos === 1 ? 'p is the head node' : `p points to node ${pos - 1}`} (${this._addr(prevId)})`,
      })
    );
    steps.push(
      makeStep(STEP.HIGHLIGHT, { block: id }, {
        zh: `q = p->next：待删除的第 ${pos} 个结点（${this._addr(id)}，data = ${v}）`,
        en: `q = p->next: node ${pos} to delete (${this._addr(id)}, data = ${v})`,
      })
    );

    // ① p->next = q->next（摘下被删结点）
    steps.push(
      makeStep(STEP.META, {
        run: () => { this.next.set(prevId, nextId); },
        undo: () => { this.next.set(prevId, id); },
      }, {
        zh: `p->next = q->next（指向 ${nextId ? this._addr(nextId) : 'NULL'}），第 ${pos} 个结点被摘链`,
        en: `p->next = q->next (points to ${nextId ? this._addr(nextId) : 'NULL'}), node ${pos} unlinked`,
      })
    );

    // ② e = q->data; free(q)
    steps.push(
      makeStep(STEP.META, {
        run: () => {
          const i = this.chain.indexOf(id);
          if (i >= 0) this.chain.splice(i, 1);
          this.next.delete(id);
          if (block) block.meta.freed = true;
          this.length--;
        },
        undo: () => {
          this.next.set(prevId, id);
          this.next.set(id, nextId);
          this.chain.splice(pos - 1, 0, id);
          if (block) block.meta.freed = false;
          this.length++;
        },
      }, {
        zh: `e = q->data = ${v}；free(q)：元素个数 = ${chain.length - 1}（该结点内存未回收，灰显在行尾）`,
        en: `e = q->data = ${v}; free(q): size = ${chain.length - 1} (node memory kept, shown greyed at the end)`,
      })
    );

    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: prevId }));
    steps.push(makeStep(STEP.UNHIGHLIGHT, { block: id }));

    chain.splice(pos - 1, 1);
    state.length = chain.length;
    return steps;
  }

  /** 规划：沿 next 指针逐个比较查找 value。 */
  planSearch(value, len = this.length, mem = this.memory, ctx = null) {
    const chain = (ctx || { chain: this.chain }).chain;
    const steps = [];
    for (let i = 0; i < chain.length; i++) {
      const id = chain[i];
      const cur = mem.read(id);
      steps.push(
        makeStep(STEP.COMPARE, { block: id }, {
          zh: `p = p->next（第 ${i + 1} 个结点 ${this._addr(id)}）：data = ${cur}，与目标 ${value} 比较`,
          en: `p = p->next (node ${i + 1} at ${this._addr(id)}): data = ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: id, found: true }, {
            zh: `在第 ${i + 1} 个结点（${this._addr(id)}）找到目标值 ${value}`,
            en: `Found ${value} at node ${i + 1} (${this._addr(id)})`,
          })
        );
        return steps;
      }
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: false }, {
        zh: `p 走到 NULL 仍未找到目标值 ${value}`,
        en: `p reached NULL; value ${value} not found`,
      })
    );
    return steps;
  }

  /**
   * 渲染视图描述：
   *   头结点在最左，随后按【逻辑顺序】排列各个数据结点（next 指针依次右指）；
   *   已删除结点与尚未挂链的新结点排在行尾，用于体现“内存未回收 / 还未链接”。
   */
  view() {
    const label = (id) => (this.next.has(id) ? this._addr(this.next.get(id)) : 'NULL');
    const nodes = [];
    const headNext = this.next.get(this.head.id) ?? null;
    nodes.push({
      blockId: this.head.id,
      nextId: headNext,
      nextLabel: label(this.head.id),
      label: '头结点',
      freed: false,
    });

    this.chain.forEach((id, i) => {
      const nx = this.next.get(id) ?? null;
      nodes.push({
        blockId: id,
        nextId: nx,
        nextLabel: label(id),
        label: `第 ${i + 1} 个结点`,
        freed: false,
      });
    });

    // 其余已分配块：被删除的结点（freed）或刚 malloc 还未挂链的新结点
    const inChain = new Set(this.chain);
    for (const b of this.memory.getAllocatedBlocks()) {
      if (b.id === this.head.id || inChain.has(b.id)) continue;
      const freed = !!b.meta.freed;
      nodes.push({
        blockId: b.id,
        nextId: freed ? null : (this.next.get(b.id) ?? null),
        nextLabel: freed ? '—' : label(b.id),
        label: freed ? '已删除（未回收）' : '新结点 s',
        freed,
      });
    }

    return {
      layout: 'linked',
      title: 'Linked List / 单链表',
      nodes,
      pointers: [{ blockId: this.head.id, label: 'head' }],
    };
  }
}
