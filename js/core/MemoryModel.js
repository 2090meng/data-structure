/**
 * MemoryModel.js — 抽象内存模型。
 *
 * 所有数据结构（数组 / 链表 / 栈 / 队列 / 二叉树）共用这一套内存抽象，
 * 这样“地址连续 / 不连续”“已分配 / 空闲”都基于统一规则呈现。
 *
 * 内存由若干“块(Block)”组成，每个块拥有：
 *   id      唯一标识
 *   address 起始地址（十进制整数，渲染时格式化为十六进制）
 *   size    字节大小
 *   value   块内存储的值（空 = null）
 *   status  'allocated'（已分配）或 'free'（空闲）
 */

let __nextId = 0;
function genId() {
  return 'blk' + (__nextId++);
}

/** 内存中的单个块。 */
export class MemoryBlock {
  constructor(address, size, status = 'free', value = null) {
    this.id = genId();
    this.address = address;
    this.size = size;
    this.status = status;
    this.value = value;
    this.highlight = false; // 是否处于“当前操作高亮”状态
    this.hit = false;       // 查找命中标记（渲染为绿色）
    this.meta = {};         // 附加信息（如数组下标等）
  }
}

export class MemoryModel {
  /**
   * @param {number} baseAddress 地址空间起始地址（十进制）
   * @param {number} unitSize    每个块的字节大小
   */
  constructor(baseAddress = 0x1000, unitSize = 4) {
    this.baseAddress = baseAddress;
    this.unitSize = unitSize;
    this.blocks = new Map(); // id -> MemoryBlock
    this._nextFree = baseAddress; // 下一个可分配地址（简单线性分配）
  }

  /** 连续分配 count 个单元（数组用），返回块数组。地址连续递增。 */
  allocateContiguous(count) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const b = new MemoryBlock(this._nextFree, this.unitSize, 'allocated', null);
      this.blocks.set(b.id, b);
      this._nextFree += this.unitSize;
      result.push(b);
    }
    return result;
  }

  /**
   * 单块分配（链表 / 二叉树节点用）。地址不连续。
   * @param {number} gap 与上一块之间预留的“空隙单元数”，用于体现地址不连续
   */
  allocateOne(gap = 1) {
    const b = new MemoryBlock(this._nextFree, this.unitSize, 'allocated', null);
    this.blocks.set(b.id, b);
    this._nextFree += this.unitSize * (1 + gap);
    return b;
  }

  getBlock(id) {
    return this.blocks.get(id);
  }

  read(id) {
    const b = this.blocks.get(id);
    return b ? b.value : undefined;
  }

  write(id, value) {
    const b = this.blocks.get(id);
    if (b) b.value = value;
  }

  clear(id) {
    const b = this.blocks.get(id);
    if (b) b.value = null;
  }

  /** 下一个空闲地址（渲染空闲区时使用）。 */
  get freeAddress() {
    return this._nextFree;
  }

  /** 所有【已分配】块，按地址升序返回。 */
  getAllocatedBlocks() {
    return [...this.blocks.values()]
      .filter((b) => b.status === 'allocated')
      .sort((a, b) => a.address - b.address);
  }

  /** 当前内存快照（用于“重置”恢复到初始状态）。 */
  snapshot() {
    return {
      blocks: [...this.blocks.values()].map((b) => ({
        ...b,
        meta: { ...b.meta },
      })),
      _nextFree: this._nextFree,
    };
  }

  /** 从快照恢复内存状态。 */
  restore(snap) {
    this.blocks = new Map();
    for (const s of snap.blocks) {
      const b = new MemoryBlock(s.address, s.size, s.status, s.value);
      b.id = s.id;
      b.highlight = s.highlight;
      b.hit = s.hit;
      b.meta = { ...s.meta };
      this.blocks.set(b.id, b);
    }
    this._nextFree = snap._nextFree;
  }

  /** 十进制地址格式化为十六进制字符串，如 4096 -> "0x1000"。 */
  static formatAddress(addr) {
    return '0x' + addr.toString(16).toUpperCase();
  }
}