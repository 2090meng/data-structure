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
 *
 * 布局与指针由数据结构通过 setViewProvider(结构.view) 提供：
 *   数组 → 网格布局；栈 → 竖排（栈底在下）+ top 指针；
 *   队列 → 横排 + front / rear 指针；
 *   链表 → 单行横排，块内分 data | next，块间用带箭头的连线表示 next 指针。
 */
import { MemoryModel } from '../core/MemoryModel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 布局参数：不同数据结构使用不同的排布方式
const LAYOUT_GRID = { blockW: 96, blockH: 64, gapX: 20, gapY: 48, padX: 40, padY: 96 };
const LAYOUT_QUEUE = { blockW: 96, blockH: 64, gapX: 18, gapY: 80, padX: 40, padY: 96 };
const LAYOUT_COLUMN = { blockW: 130, blockH: 52, gapX: 20, gapY: 34, padX: 150, padY: 74 };
// 链表：块内左 data 右 next（指针区占 38%），块间距留出箭头空间
const LAYOUT_LINKED = { blockW: 132, blockH: 64, gapX: 78, gapY: 0, padX: 84, padY: 96 };

export class Renderer {
  constructor(svgElement) {
    this.svg = svgElement;
    this.positions = {};   // blockId -> { cx, cy, x, y, w, h }
    // 布局常量（每次 render 时按数据结构视图覆盖）
    this.blockW = 96;
    this.blockH = 64;
    this.gapX = 20;
    this.gapY = 48;
    this.padX = 40;
    this.padY = 96;
    this._viewProvider = null; // 由数据结构提供 view()（布局 / 指针 / 标题）
  }

  /**
   * 设置视图提供者：返回 { layout, title, pointers } 的函数。
   * layout: 'grid'（网格，数组/队列）或 'column'（竖排，栈）。
   */
  setViewProvider(fn) {
    this._viewProvider = fn;
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

    // 数据结构提供的视图信息（可为空，退化为默认网格）
    const view = this._viewProvider ? this._viewProvider() : null;

    // 链表使用独立的单行横排布局（块内 data | next + 箭头连线），单独走一条绘制路径
    if (view && view.layout === 'linked') {
      this._renderLinked(memory, view);
      return;
    }
    // 从链表切回其它结构时，恢复 CSS 的 width:100%
    this.svg.style.width = '';

    const vertical = !!(view && view.layout === 'column');

    // 按视图切换布局参数（栈竖排 / 队列横排留出指针空间）
    let cfg = LAYOUT_GRID;
    if (vertical) cfg = LAYOUT_COLUMN;
    else if (view && view.pointers && view.pointers.length) cfg = LAYOUT_QUEUE;
    this.blockW = cfg.blockW;
    this.blockH = cfg.blockH;
    this.gapX = cfg.gapX;
    this.gapY = cfg.gapY;
    this.padX = cfg.padX;
    this.padY = cfg.padY;

    const allocated = memory.getAllocatedBlocks();
    const cols = vertical ? 1 : this._colCount();
    // 栈 / 队列的槽位是固定容量的一部分，不再额外画空闲块
    const showFree = !vertical && !(view && view.pointers && view.pointers.length);

    // 顶部标题
    const title = this._el('text', {
      x: 40,
      y: 34,
      class: 'mem-label',
    });
    title.textContent = (view && view.title) || 'Memory / 内存';
    this.svg.appendChild(title);

    // 已分配块（竖排时把下标 0 画在最下方，符合栈的直观方向）
    allocated.forEach((b, i) => {
      const visual = vertical ? allocated.length - 1 - i : i;
      this._drawBlock(b, visual, cols, vertical);
    });

    // 空闲内存块（灰色，紧跟已分配块之后，地址连续递增）
    const freeCount = showFree ? 4 : 0;
    for (let k = 0; k < freeCount; k++) {
      const addr = memory.freeAddress + k * memory.unitSize;
      this._drawFreeBlock(addr, allocated.length + k, cols);
    }

    // 结构指针（如栈的 top、队列的 front / rear）
    this._drawPointers(view, vertical);

    // 动态设置 svg 高度，避免内容被裁剪
    const total = allocated.length + freeCount;
    const rows = Math.max(1, Math.ceil(total / cols));
    const height = this.padY + rows * (this.blockH + this.gapY) + 50;
    this.svg.style.height = Math.max(600, height) + 'px';
  }

  /**
   * 链表专属绘制：单行横排，每个结点块内用竖线分成 data | next 两栏，
   * next 栏显示后继结点的地址（NULL 表示空指针），再用带箭头连线把 next 指针画出来。
   * 相邻结点画直线箭头；跨越多个块的指针（如新结点 s 尚未挂链时指向后面的结点）
   * 从块下方绕行。已删除的结点灰显在行尾，且不再画箭头。
   */
  _renderLinked(memory, view) {
    const cfg = LAYOUT_LINKED;
    this.blockW = cfg.blockW;
    this.blockH = cfg.blockH;
    this.gapX = cfg.gapX;
    this.gapY = cfg.gapY;
    this.padX = cfg.padX;
    this.padY = cfg.padY;

    const nodes = Array.isArray(view.nodes) ? view.nodes : [];
    const w = cfg.blockW;
    const h = cfg.blockH;

    // 顶部标题
    const title = this._el('text', { x: 40, y: 34, class: 'mem-label' });
    title.textContent = view.title || 'Linked List / 单链表';
    this.svg.appendChild(title);

    // 箭头定义（每次重绘重建，避免引用已被移除的旧节点）
    const defs = this._el('defs', {});
    const marker = this._el('marker', {
      id: 'link-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto',
    });
    marker.appendChild(this._el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#38bdf8' }));
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    // 逐个结点画块
    nodes.forEach((node, i) => {
      const x = cfg.padX + i * (w + cfg.gapX);
      const y = cfg.padY;
      const cy = y + h / 2;
      const block = memory.getBlock(node.blockId);

      let cls = 'mem-block mem-block--alloc';
      if (block && block.highlight) cls += ' highlight';
      if (block && block.hit) cls += ' hit';
      if (node.freed) cls += ' mem-block--freed';
      this.svg.appendChild(this._el('rect', { x, y, width: w, height: h, rx: 8, class: cls }));

      // 地址（块上方）
      const addr = this._el('text', { x: x + w / 2, y: y - 12, class: 'mem-addr', 'text-anchor': 'middle' });
      addr.textContent = block ? MemoryModel.formatAddress(block.address) : '';
      this.svg.appendChild(addr);

      // data | next 分隔线
      const split = x + w * 0.62;
      this.svg.appendChild(this._el('line', {
        x1: split, y1: y + 10, x2: split, y2: y + h - 10, class: 'mem-divider',
      }));

      // data 域
      const val = this._el('text', {
        x: x + w * 0.31, y: cy,
        class: block && block.value === null ? 'mem-empty' : 'mem-value',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      });
      val.textContent = block && block.value !== null ? String(block.value) : '∅';
      this.svg.appendChild(val);

      // next 域（后继结点地址 / NULL / —）
      const nx = this._el('text', {
        x: x + w * 0.81, y: cy,
        class: node.freed ? 'mem-next mem-next--freed' : 'mem-next',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      });
      nx.textContent = node.freed ? '—' : (node.nextLabel || 'NULL');
      this.svg.appendChild(nx);

      // 结点标签（块下方）
      if (node.label) {
        const lbl = this._el('text', { x: x + w / 2, y: y + h + 18, class: 'mem-label', 'text-anchor': 'middle' });
        lbl.textContent = node.label;
        this.svg.appendChild(lbl);
      }

      this.positions[node.blockId] = { cx: x + w / 2, cy, x, y, w, h };
    });

    // 箭头连线：按 nextId 画，相邻结点走直线，跨块走下方绕行
    const indexOf = new Map(nodes.map((n, i) => [n.blockId, i]));
    const lane = cfg.padY + h + 44;
    nodes.forEach((node, i) => {
      if (!node.nextId) return;
      const s = this.positions[node.blockId];
      const t = this.positions[node.nextId];
      if (!s || !t) return;
      const j = indexOf.get(node.nextId);
      if (j === i + 1) {
        this.svg.appendChild(this._el('line', {
          x1: s.x + s.w, y1: s.cy, x2: t.x - 2, y2: t.cy,
          class: 'mem-link', 'marker-end': 'url(#link-arrow)',
        }));
      } else {
        this.svg.appendChild(this._el('path', {
          d: `M ${s.x + s.w} ${s.cy} L ${s.x + s.w + 14} ${lane} L ${t.cx} ${lane} L ${t.cx} ${t.y + t.h}`,
          class: 'mem-link', 'marker-end': 'url(#link-arrow)',
        }));
      }
    });

    // 结构指针（head）：画在头结点左侧
    if (Array.isArray(view.pointers)) {
      for (const p of view.pointers) {
        const pos = this.positions[p.blockId];
        if (!pos) continue;
        const txt = this._el('text', {
          x: pos.x - 16, y: pos.cy, class: 'mem-ptr',
          'text-anchor': 'end', 'dominant-baseline': 'central',
        });
        txt.textContent = p.label + ' →';
        this.svg.appendChild(txt);
      }
    }

    // 链表一屏放不下时横向滚动：宽度按内容宽度设置，高度按单行内容设置
    const contentW = cfg.padX * 2 + nodes.length * (w + cfg.gapX);
    this.svg.style.width = Math.max(contentW, 640) + 'px';
    this.svg.style.height = Math.max(360, cfg.padY + h + 120) + 'px';
  }

  /** 绘制一个已分配块。 */
  _drawBlock(block, index, cols, vertical = false) {
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

    // 下标 / 标签：竖排放在块右侧（左侧留给指针），横排放在块下方
    if (block.meta.label !== undefined && block.meta.label !== null) {
      const lbl = vertical
        ? this._el('text', { x: x + w + 12, y: cy, class: 'mem-label', 'text-anchor': 'start', 'dominant-baseline': 'central' })
        : this._el('text', { x: cx, y: y + h + 18, class: 'mem-label', 'text-anchor': 'middle' });
      lbl.textContent = block.meta.label;
      this.svg.appendChild(lbl);
    }

    this.positions[block.id] = { cx, cy, x, y, w, h };
  }

  /**
   * 绘制结构指针标注（栈顶 top / 队头 front / 队尾 rear）。
   * 竖排画在块左侧（箭头指向块），横排画在块下方。
   */
  _drawPointers(view, vertical) {
    if (!view || !Array.isArray(view.pointers)) return;
    // 队列满时 rear 与 front 指向同一个块（(rear+1)%MaxSize == front），
    // 同一块上的多个指针需要错开，否则文字会重叠。
    const used = new Map();
    for (const p of view.pointers) {
      const pos = this.positions[p.blockId];
      if (!pos) continue;
      const duplicate = used.get(p.blockId) || 0;
      used.set(p.blockId, duplicate + 1);

      const attrs = vertical
        ? {
            x: pos.x - 16,
            y: pos.cy + duplicate * 18,
            class: 'mem-ptr',
            'text-anchor': 'end',
            'dominant-baseline': 'central',
          }
        : {
            x: pos.cx,
            y: pos.y + pos.h + 42 + duplicate * 18,
            class: 'mem-ptr',
            'text-anchor': 'middle',
          };
      const txt = this._el('text', attrs);
      txt.textContent = vertical ? p.label + ' →' : '▲ ' + p.label;
      this.svg.appendChild(txt);
    }
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