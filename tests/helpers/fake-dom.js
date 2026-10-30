// 轻量假 DOM：只实现 Renderer 用到的接口，供 Node 下验证真实渲染路径。

export class FakeEl {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.textContent = '';
    this.style = {};
    this.parent = null;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
  remove() { if (this.parent) this.parent.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  get clientWidth() { return 1280; }
}

/** 安装假 DOM；需在创建 Renderer 之前调用。 */
export function installFakeDOM() {
  globalThis.document = { createElementNS: (_ns, tag) => new FakeEl(tag) };
}

export function walk(el, cb) {
  cb(el);
  for (const c of el.children) walk(c, cb);
}

/** 取出画布中带指定 class 的文字内容（按绘制顺序）。 */
export function texts(svg, classes) {
  const want = Array.isArray(classes) ? classes : [classes];
  const out = [];
  walk(svg, (e) => {
    if (e.tag !== 'text') return;
    const cls = String(e.attrs.class || '').split(' ');
    if (want.some((c) => cls.includes(c))) out.push(e.textContent);
  });
  return out;
}

/** 取出某 class 的元素（rect / line / path）。 */
export function els(svg, tag, cls) {
  const out = [];
  walk(svg, (e) => {
    if (e.tag !== tag) return;
    if (String(e.attrs.class || '').split(' ').includes(cls)) out.push(e);
  });
  return out;
}

/** 取出某个块中心显示的值文字（'30' 或 '∅'）。 */
export function valueTextAt(svg, pos) {
  const out = [];
  if (!pos) return out;
  walk(svg, (e) => {
    if (e.tag !== 'text') return;
    if (Number(e.attrs.x) !== pos.cx || Number(e.attrs.y) !== pos.cy) return;
    const cls = String(e.attrs.class || '');
    if (cls === 'mem-value' || cls === 'mem-empty') out.push(e.textContent);
  });
  return out;
}
