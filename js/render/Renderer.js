/**
 * Renderer.js — SVG 渲染器。
 *
 * 只负责“根据内存状态把画面画出来”，不包含任何数据结构逻辑。
 * 数据结构逻辑在 structures/ 下，动画编排在 Animator.js。
 *
 * 对外提供三个能力：
 *   render(memory)                    全量重绘内存画面
 *   getCenter(blockId)                获取某块的画面中心坐标（动画用）
 *   animateFloat(fromId, toId, v, ms) 让一个“值”在块之间平滑飞行的补间动画
 */
import { MemoryModel } from '../core/MemoryModel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  constructor(svgElement) {
    this.svg = svgElement;
    this.positions = {};   // blockId -> { cx, cy, x, y, w, h }
    // 布局常量
    this.blockW = 96;
    this.blockH = 64;
    this.gapX = 20;
    this.gapY = 48;
    this.padX = 40;
    this.padY = 96;
  }

  /** 根据 svg 当前宽度计算每行能放多少个块。 */
  _colCount() {
    const w = this.svg.clientWidth || 960;
    return Math.max(1, Math.floor((w - this.padX * 2) / (this.blockW + this.gapX)));
  }

  /** 计算第 i 个块的左上角坐标。 */
  _layout(i, cols) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      x: this.padX + col * (this.blockW + this.gapX),
      y: this.padY + row * (this.blockH + this.gapY),
    };
  }

  /** 全量重绘。 */
  render(memory) {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.positions = {};

    const allocated = memory.getAllocatedBlocks();
    const cols = this._colCount();

    // 顶部标题
    const title = this._el('text', {
      x: this.padX,
      y: 34,
      class: 'mem-label',
    });
    title.textContent = 'Memory / 内存';
    this.svg.appendChild(title);

    // 已分配块
    allocated.forEach((b, i) => {
      this._drawBlock(b, i, cols, false);
    });

    // 空闲内存块（灰色，紧跟已分配块之后，地址连续递增）
    const freeCount = 4;
    for (let k = 0; k < freeCount; k++) {
      const addr = memory.freeAddress + k * memory.unitSize;
      this._drawFreeBlock(addr, allocated.length + k, cols);
    }

    // 动态设置 svg 高度，避免内容被裁剪
    const total = allocated.length + freeCount;
    const rows = Math.max(1, Math.ceil(total / cols));
    const height = this.padY + rows * (this.blockH + this.gapY) + 40;
    this.svg.style.height = Math.max(600, height) + 'px';
  }

  /** 绘制一个已分配块。 */
  _drawBlock(block, index, cols) {
    const { x, y } = this._layout(index, cols);
    const w = this.blockW;
    const h = this.blockH;
    const cx = x + w / 2;
    const cy = y + h / 2;

    let cls = 'mem-block mem-block--alloc';
    if (block.highlight) cls += ' highlight';
    if (block.hit) cls += ' hit';

    const rect = this._el('rect', { x, y, width: w, height: h, rx: 8, class: cls });
    this.svg.appendChild(rect);

    // 地址（块上方）
    const addr = this._el('text', { x: cx, y: y - 12, class: 'mem-addr', 'text-anchor': 'middle' });
    addr.textContent = MemoryModel.formatAddress(block.address);
    this.svg.appendChild(addr);

    // 值 / 空标记（块中心）
    const val = this._el('text', {
      x: cx, y: cy,
      class: block.value === null ? 'mem-empty' : 'mem-value',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    val.textContent = block.value === null ? '∅' : String(block.value);
    this.svg.appendChild(val);

    // 下标 / 标签（块下方，如数组下标）
    if (block.meta.label !== undefined && block.meta.label !== null) {
      const lbl = this._el('text', { x: cx, y: y + h + 18, class: 'mem-label', 'text-anchor': 'middle' });
      lbl.textContent = block.meta.label;
      this.svg.appendChild(lbl);
    }

    this.positions[block.id] = { cx, cy, x, y, w, h };
  }

  /** 绘制一个空闲块（灰色）。 */
  _drawFreeBlock(address, index, cols) {
    const { x, y } = this._layout(index, cols);
    const w = this.blockW;
    const h = this.blockH;
    const cx = x + w / 2;

    const rect = this._el('rect', { x, y, width: w, height: h, rx: 8, class: 'mem-block mem-block--free' });
    this.svg.appendChild(rect);

    const addr = this._el('text', { x: cx, y: y - 12, class: 'mem-addr', 'text-anchor': 'middle' });
    addr.textContent = MemoryModel.formatAddress(address);
    this.svg.appendChild(addr);

    const dash = this._el('text', {
      x: cx, y: y + h / 2,
      class: 'mem-empty', 'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    dash.textContent = '—';
    this.svg.appendChild(dash);
  }

  /** 获取块中心坐标。 */
  getCenter(blockId) {
    return this.positions[blockId] || null;
  }

  /**
   * 值在块之间平滑飞行的补间动画。
   * 结束后 Promise resolve（漂浮元素已移除）。
   */
  animateFloat(fromId, toId, value, duration = 420) {
    const from = this.positions[fromId];
    const to = this.positions[toId];
    if (!from || !to) return Promise.resolve();

    const txt = this._el('text', {
      x: from.cx, y: from.cy,
      class: 'mem-float',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    });
    txt.textContent = String(value);
    this.svg.appendChild(txt);

    return new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
        const x = from.cx + (to.cx - from.cx) * ease;
        const y = from.cy + (to.cy - from.cy) * ease;
        txt.setAttribute('x', x);
        txt.setAttribute('y', y);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          txt.remove();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  /** 创建 SVG 元素并设置属性。 */
  _el(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
}