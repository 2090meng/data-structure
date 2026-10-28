/**
 * BinaryTreeDS.js — 二叉树（二叉链表存储）。
 *
 * 语义按考研教材（严蔚敏《数据结构》C 语言版）：
 *   二叉链表结点：
 *       typedef struct BiTNode {
 *           ElemType data;
 *           struct BiTNode *lchild, *rchild;
 *       } BiTNode, *BiTree;
 *   每个结点单独 malloc（memory.allocateOne），相邻结点之间留有空隙，
 *   因此地址【不连续】。
 *
 *   结点用【层序编号】定位，与教材顺序存储的编号一致：
 *       根为第 1 号，第 i 号结点的左孩子为 2i、右孩子为 2i+1。
 *   空树时插入首个结点即为根；此后插入必须指明父结点位序与左/右。
 *   插入：s = malloc; s->data = e; s->lchild = s->rchild = NULL; p->lchild = s;
 *   删除：删除以第 i 号结点为根的整棵子树，父结点对应指针置 NULL；
 *         结点内存并不回收（灰显在画面下方），与 free 后“内存块仍存在”的语义一致。
 *   遍历：先序（根左右）、中序（左根右）、后序（左右根）、层次（逐层从左到右）。
 *
 * 与其它结构一样只是“规划器”：plan* 只产出 Step 数组，不直接改画面。
 * “挂链 / 摘链”放在 STEP.META 的 run/undo 里，动画执行到那一步才真正生效，
 * 这样“先写入 s->data，再 p->lchild = s”的先后顺序在画面上可见。
 */
import { STEP, makeStep } from '../core/Step.js';
import { MemoryModel } from '../core/MemoryModel.js';

// 相邻结点之间预留的空闲单元数（轮流取值，制造“地址不连续”的效果）
const GAPS = [2, 3, 4];

// 遍历名称（用于日志文案）
const ORDER_NAMES = {
  preorder: { zh: '先序遍历', en: 'Preorder traversal' },
  inorder: { zh: '中序遍历', en: 'Inorder traversal' },
  postorder: { zh: '后序遍历', en: 'Postorder traversal' },
  levelorder: { zh: '层次遍历', en: 'Level-order traversal' },
};

export class BinaryTreeDS {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {number} maxNodes 结点个数上限（演示用，防止无限增长）
   */
  constructor(memory, maxNodes = 15) {
    this.kind = 'binarytree';
    this.memory = memory;
    this.maxNodes = Math.max(1, maxNodes);

    /**
     * 层序编号 -> 结点记录 { id, index, left, right, parent }
     * id 为内存块 id；left / right / parent 均为层序编号（null 表示空）。
     */
    this.byIndex = new Map();
    this.rootIndex = null; // 根结点编号（空树为 null）
    this._gapTurn = 0;
  }

  /** 规划期上下文：代码模式连续规划多行时，plan* 共享它来推演树形态。 */
  planningContext() {
    const byIndex = new Map();
    for (const [i, n] of this.byIndex) byIndex.set(i, { ...n });
    return { byIndex, rootIndex: this.rootIndex };
  }

  /** 分配一个新结点（地址与已有结点不连续）。 */
  _allocNode() {
    const b = this.memory.allocateOne(GAPS[this._gapTurn % GAPS.length]);
    this._gapTurn++;
    b.meta.label = '新结点';
    return b;
  }

  /** 结点地址文本。 */
  _addr(id) {
    const b = id ? this.memory.getBlock(id) : null;
    return b ? MemoryModel.formatAddress(b.address) : 'NULL';
  }

  /** 父结点记录中指向 childIndex 的是左指针还是右指针。 */
  _sideOf(parent, childIndex) {
    if (!parent) return null;
    if (parent.left === childIndex) return 'left';
    if (parent.right === childIndex) return 'right';
    return null;
  }

  /** 收集以 index 为根的子树编号（含根）。 */
  _subtreeIndices(index, state) {
    const out = [];
    const stack = [index];
    while (stack.length) {
      const i = stack.pop();
      const n = state.byIndex.get(i);
      if (!n) continue;
      out.push(i);
      if (n.left != null) stack.push(n.left);
      if (n.right != null) stack.push(n.right);
    }
    return out;
  }

  /** 按遍历方式返回编号序列。 */
  _order(state, mode) {
    const out = [];
    if (mode === 'levelorder') {
      const q = state.rootIndex != null ? [state.rootIndex] : [];
      while (q.length) {
        const i = q.shift();
        const n = state.byIndex.get(i);
        if (!n) continue;
        out.push(i);
        if (n.left != null) q.push(n.left);
        if (n.right != null) q.push(n.right);
      }
      return out;
    }

    const visit = (i) => {
      const n = state.byIndex.get(i);
      if (!n) return;
      if (mode === 'preorder') {
        out.push(i);
        visit(n.left);
        visit(n.right);
      } else if (mode === 'inorder') {
        visit(n.left);
        out.push(i);
        visit(n.right);
      } else {
        visit(n.left);
        visit(n.right);
        out.push(i);
      }
    };
    if (state.rootIndex != null) visit(state.rootIndex);
    return out;
  }

  // ---------- 防御性校验：不合法时返回双语错误消息，合法返回 null ----------

  /** 插入前校验：空树只能建根；否则父结点必须存在且对应孩子位置为空。 */
  insertError(index, side, state = null) {
    const st = state || { byIndex: this.byIndex, rootIndex: this.rootIndex };
    if (!Number.isInteger(index) || index < 1) {
      return {
        zh: `错误：结点位序 ${index} 非法（应为从 1 开始的整数）`,
        en: `Error: invalid node index ${index} (must be an integer >= 1)`,
      };
    }
    if (st.byIndex.size >= this.maxNodes) {
      return {
        zh: `错误：结点数已达演示上限 ${this.maxNodes}，无法继续插入`,
        en: `Error: node limit ${this.maxNodes} reached, cannot insert`,
      };
    }
    if (st.rootIndex === null) {
      if (index !== 1) {
        return {
          zh: `错误：空树只能建立根结点（位序 1），当前为 ${index}`,
          en: `Error: an empty tree only accepts the root at index 1, got ${index}`,
        };
      }
      return null;
    }

    const parent = st.byIndex.get(index);
    if (!parent) {
      return {
        zh: `错误：第 ${index} 号结点不存在，无法插入孩子`,
        en: `Error: node ${index} does not exist, cannot attach a child`,
      };
    }
    const s = side === 'R' ? 'R' : 'L';
    const slot = s === 'L' ? parent.left : parent.right;
    if (slot != null) {
      return {
        zh: `错误：第 ${index} 号结点已有${s === 'L' ? '左' : '右'}孩子（第 ${slot} 号）`,
        en: `Error: node ${index} already has a ${s === 'L' ? 'left' : 'right'} child (node ${slot})`,
      };
    }
    const child = s === 'L' ? index * 2 : index * 2 + 1;
    if (st.byIndex.has(child)) {
      return {
        zh: `错误：第 ${child} 号位置已被占用`,
        en: `Error: node position ${child} is already occupied`,
      };
    }
    return null;
  }

  /** 删除前校验：非空且该编号存在。 */
  deleteError(index, state = null) {
    const st = state || { byIndex: this.byIndex, rootIndex: this.rootIndex };
    if (st.rootIndex === null) {
      return { zh: '错误：二叉树为空，无法删除', en: 'Error: the binary tree is empty, cannot delete' };
    }
    if (!Number.isInteger(index) || index < 1 || !st.byIndex.has(index)) {
      return {
        zh: `错误：第 ${index} 号结点不存在`,
        en: `Error: node ${index} does not exist`,
      };
    }
    return null;
  }

  /** 查找前校验：空树无法查找。 */
  searchError(state = null) {
    const st = state || { byIndex: this.byIndex, rootIndex: this.rootIndex };
    if (st.rootIndex === null) {
      return { zh: '错误：二叉树为空，无法查找', en: 'Error: the binary tree is empty, nothing to search' };
    }
    return null;
  }

  /** 遍历前校验：空树没有可访问的结点。 */
  traversalError(state = null) {
    const st = state || { byIndex: this.byIndex, rootIndex: this.rootIndex };
    if (st.rootIndex === null) {
      return { zh: '错误：二叉树为空，无法遍历', en: 'Error: the binary tree is empty, cannot traverse' };
    }
    return null;
  }

  // ---------- 规划 ----------

  /**
   * 规划：把 value 挂为第 index 号结点的左/右孩子（空树时建立根结点）。
   * @param {object|null} ctx 规划期上下文（代码模式传入，会就地推进其树形态）
   */
  planInsert(index, side, value, ctx = null) {
    const state = ctx || this.planningContext();
    if (this.insertError(index, side, state)) return [];

    const s = side === 'R' ? 'R' : 'L';
    const isEmpty = state.rootIndex === null;
    const parentIndex = isEmpty ? null : index;
    const newIndex = isEmpty ? 1 : (s === 'L' ? index * 2 : index * 2 + 1);
    const node = this._allocNode();
    const record = { id: node.id, index: newIndex, left: null, right: null, parent: parentIndex };
    const steps = [];

    if (!isEmpty) {
      const parentRec = state.byIndex.get(parentIndex);
      steps.push(
        makeStep(STEP.HIGHLIGHT, { block: parentRec.id }, {
          zh: `p 指向第 ${parentIndex} 号结点（${this._addr(parentRec.id)}）`,
          en: `p points to node ${parentIndex} (${this._addr(parentRec.id)})`,
        })
      );
    }

    steps.push(
      makeStep(STEP.SET_VALUE, { block: node.id, value }, {
        zh: isEmpty
          ? `s = (BiTNode)malloc(sizeof(BiTNode))；s->data = ${value}；s->lchild = s->rchild = NULL（新结点 ${MemoryModel.formatAddress(node.address)}）`
          : `s = (BiTNode)malloc(sizeof(BiTNode))；s->data = ${value}；s->lchild = s->rchild = NULL（新结点 ${MemoryModel.formatAddress(node.address)}）`,
        en: `s = malloc(...); s->data = ${value}; s->lchild = s->rchild = NULL (new node at ${MemoryModel.formatAddress(node.address)})`,
      })
    );

    steps.push(
      makeStep(STEP.META, {
        run: () => {
          this.byIndex.set(newIndex, record);
          if (isEmpty) {
            this.rootIndex = 1;
          } else {
            const p = this.byIndex.get(parentIndex);
            if (p) {
              if (s === 'L') p.left = newIndex;
              else p.right = newIndex;
            }
          }
        },
        undo: () => {
          this.byIndex.delete(newIndex);
          if (isEmpty) {
            this.rootIndex = null;
          } else {
            const p = this.byIndex.get(parentIndex);
            if (p) {
              if (s === 'L') p.left = null;
              else p.right = null;
            }
          }
        },
      }, {
        zh: isEmpty
          ? `T = s：新结点成为根结点（第 1 号），元素个数 = ${state.byIndex.size + 1}`
          : `p->${s === 'L' ? 'lchild' : 'rchild'} = s：第 ${newIndex} 号结点成为第 ${parentIndex} 号结点的${s === 'L' ? '左' : '右'}孩子，元素个数 = ${state.byIndex.size + 1}`,
        en: isEmpty
          ? `T = s: the new node becomes the root (node 1), size = ${state.byIndex.size + 1}`
          : `p->${s === 'L' ? 'lchild' : 'rchild'} = s: node ${newIndex} becomes the ${s === 'L' ? 'left' : 'right'} child of node ${parentIndex}, size = ${state.byIndex.size + 1}`,
      })
    );

    if (!isEmpty) steps.push(makeStep(STEP.UNHIGHLIGHT, { block: state.byIndex.get(parentIndex).id }));

    // 推进规划期状态（只有传入 ctx 时才影响后续指令的规划）
    state.byIndex.set(newIndex, record);
    if (isEmpty) {
      state.rootIndex = 1;
    } else {
      const p = state.byIndex.get(parentIndex);
      if (p) {
        if (s === 'L') p.left = newIndex;
        else p.right = newIndex;
      }
    }
    return steps;
  }

  /** 规划：按层序序列一次建立二叉树（数组下标 i 对应第 i+1 号结点）。 */
  planBuildLevelOrder(values, ctx = null) {
    const state = ctx || this.planningContext();
    const steps = [];
    for (let k = 0; k < values.length; k++) {
      if (state.byIndex.size >= this.maxNodes) break;
      const idx = k + 1;
      const parent = Math.floor(idx / 2);
      const side = idx % 2 === 0 ? 'L' : 'R';
      steps.push(...this.planInsert(idx === 1 ? 1 : parent, side, values[k], state));
    }
    return steps;
  }

  /**
   * 规划：删除以第 index 号结点为根的整棵子树。
   * 被删除的结点只“摘链”，内存并不回收（灰显在下方）。
   */
  planDelete(index, ctx = null, mem = this.memory) {
    const state = ctx || this.planningContext();
    if (this.deleteError(index, state)) return [];

    const subtree = this._subtreeIndices(index, state);
    const rootRec = state.byIndex.get(index);
    const parentIndex = rootRec.parent;
    const parentRec = parentIndex != null ? state.byIndex.get(parentIndex) : null;
    const sideName = parentRec ? this._sideOf(parentRec, index) : null;

    const steps = [makeStep(STEP.HIGHLIGHT, { block: rootRec.id }, {
      zh: `q 指向第 ${index} 号结点（${this._addr(rootRec.id)}，data = ${mem.read(rootRec.id)}），将以它为根删除整棵子树`,
      en: `q points to node ${index} (${this._addr(rootRec.id)}, data = ${mem.read(rootRec.id)}); its whole subtree will be deleted`,
    })];

    for (const i of subtree.slice(1)) {
      const rec = state.byIndex.get(i);
      steps.push(makeStep(STEP.HIGHLIGHT, { block: rec.id }, {
        zh: `子树结点：第 ${i} 号（${this._addr(rec.id)}，data = ${mem.read(rec.id)}）`,
        en: `Subtree node: node ${i} (${this._addr(rec.id)}, data = ${mem.read(rec.id)})`,
      }));
    }

    const values = subtree.map((i) => mem.read(state.byIndex.get(i).id));
    let snapshot = null;

    steps.push(
      makeStep(STEP.META, {
        run: () => {
          snapshot = new Map();
          for (const i of subtree) {
            const rec = this.byIndex.get(i);
            if (rec) snapshot.set(i, { ...rec });
          }
          for (const i of subtree) {
            const rec = this.byIndex.get(i);
            if (!rec) continue;
            const b = this.memory.getBlock(rec.id);
            if (b) b.meta.freed = true;
            this.byIndex.delete(i);
          }
          const p = parentIndex != null ? this.byIndex.get(parentIndex) : null;
          if (p) {
            if (sideName === 'left') p.left = null;
            if (sideName === 'right') p.right = null;
          }
          if (this.rootIndex === index) this.rootIndex = null;
        },
        undo: () => {
          for (const [i, rec] of snapshot || []) {
            this.byIndex.set(i, rec);
            const b = this.memory.getBlock(rec.id);
            if (b) b.meta.freed = false;
          }
          const p = parentIndex != null ? this.byIndex.get(parentIndex) : null;
          if (p) {
            if (sideName === 'left') p.left = index;
            if (sideName === 'right') p.right = index;
          }
          if (parentIndex == null) this.rootIndex = index;
        },
      }, {
        zh: `删除以第 ${index} 号结点为根的子树：共 ${subtree.length} 个结点（${values.join(', ')}），父结点对应指针置为 NULL；内存不回收，灰显在下方`,
        en: `Delete the subtree rooted at node ${index}: ${subtree.length} node(s) (${values.join(', ')}); the parent pointer is set to NULL; memory is kept and shown greyed below`,
      })
    );

    for (const i of subtree) {
      const rec = state.byIndex.get(i);
      steps.push(makeStep(STEP.UNHIGHLIGHT, { block: rec.id }));
    }

    // 推进规划期状态
    for (const i of subtree) state.byIndex.delete(i);
    if (parentRec) {
      if (sideName === 'left') parentRec.left = null;
      if (sideName === 'right') parentRec.right = null;
    }
    if (state.rootIndex === index) state.rootIndex = null;
    return steps;
  }

  /** 规划：按先序逐个比较查找 value。 */
  planSearch(value, ctx = null, mem = this.memory) {
    const state = ctx || this.planningContext();
    const order = this._order(state, 'preorder');
    const steps = [];
    for (const i of order) {
      const rec = state.byIndex.get(i);
      const cur = mem.read(rec.id);
      steps.push(
        makeStep(STEP.COMPARE, { block: rec.id }, {
          zh: `先序遍历：第 ${i} 号结点（${this._addr(rec.id)}）data = ${cur}，与目标 ${value} 比较`,
          en: `Preorder: node ${i} (${this._addr(rec.id)}) data = ${cur} vs ${value}`,
        })
      );
      if (cur === value) {
        steps.push(
          makeStep(STEP.RESULT, { block: rec.id, found: true }, {
            zh: `在第 ${i} 号结点（${this._addr(rec.id)}）找到目标值 ${value}`,
            en: `Found ${value} at node ${i} (${this._addr(rec.id)})`,
          })
        );
        return steps;
      }
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: false }, {
        zh: `遍历完整棵树仍未找到目标值 ${value}`,
        en: `The whole tree was traversed; value ${value} not found`,
      })
    );
    return steps;
  }

  /** 规划：四种遍历，逐个访问并输出访问序列。 */
  _planTraversal(mode, ctx, mem) {
    const state = ctx || this.planningContext();
    const names = ORDER_NAMES[mode];
    const order = this._order(state, mode);
    const steps = [];
    const seq = [];
    for (const i of order) {
      const rec = state.byIndex.get(i);
      const v = mem.read(rec.id);
      seq.push(v);
      steps.push(
        makeStep(STEP.HIGHLIGHT, { block: rec.id }, {
          zh: `${names.zh}：访问第 ${i} 号结点（${this._addr(rec.id)}），data = ${v}`,
          en: `${names.en}: visit node ${i} (${this._addr(rec.id)}), data = ${v}`,
        })
      );
      steps.push(makeStep(STEP.UNHIGHLIGHT, { block: rec.id }));
    }
    steps.push(
      makeStep(STEP.RESULT, { block: null, found: true }, {
        zh: `${names.zh}序列：${seq.join(' → ')}`,
        en: `${names.en} sequence: ${seq.join(' -> ')}`,
      })
    );
    return steps;
  }

  planPreorder(ctx = null, mem = this.memory) {
    return this._planTraversal('preorder', ctx, mem);
  }

  planInorder(ctx = null, mem = this.memory) {
    return this._planTraversal('inorder', ctx, mem);
  }

  planPostorder(ctx = null, mem = this.memory) {
    return this._planTraversal('postorder', ctx, mem);
  }

  planLevelorder(ctx = null, mem = this.memory) {
    return this._planTraversal('levelorder', ctx, mem);
  }

  /**
   * 渲染视图描述：
   *   树中结点带层序编号与左右孩子（blockId），由 Renderer 按深度/中序次序布局；
   *   已删除或尚未挂链的块放在 freed 列表里，灰显在画面下方。
   */
  view() {
    const nodes = [];
    for (const [index, n] of this.byIndex) {
      const left = n.left != null ? this.byIndex.get(n.left) : null;
      const right = n.right != null ? this.byIndex.get(n.right) : null;
      nodes.push({
        blockId: n.id,
        index,
        leftId: left ? left.id : null,
        rightId: right ? right.id : null,
        label: `第 ${index} 号`,
      });
    }

    const inTree = new Set([...this.byIndex.values()].map((n) => n.id));
    const freed = [];
    for (const b of this.memory.getAllocatedBlocks()) {
      if (inTree.has(b.id)) continue;
      freed.push({
        blockId: b.id,
        label: b.meta.freed ? '已删除（未回收）' : '新结点 s',
        freed: !!b.meta.freed,
      });
    }

    const rootRec = this.rootIndex != null ? this.byIndex.get(this.rootIndex) : null;
    return {
      layout: 'tree',
      title: 'Binary Tree / 二叉树',
      rootId: rootRec ? rootRec.id : null,
      nodes,
      freed,
      pointers: rootRec ? [{ blockId: rootRec.id, label: 'root' }] : [],
    };
  }
}
