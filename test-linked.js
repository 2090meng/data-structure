/**
 * test-linked.js — 单链表（带头结点）全面自动化自检。
 *
 * 运行：node test-linked.js
 *
 * 覆盖：
 *   A 初始化：只分配头结点、空表指针与防御
 *   B 尾插建表：逻辑顺序、next 指针、地址不连续
 *   C 头插 / 中间插入：先挂后链（s->next 后再 p->next）
 *   D 删除：摘链、前驱指针跳过、结点内存不回收（freed 灰显）
 *   E 越界与容量上限防御
 *   F 查找命中 / 未命中
 *   G 代码模式：声明初始化（尾插）+ insert + remove + search
 *   H 真实 Renderer + Animator + 假 DOM：结点块 / data|next 两栏 / 箭头 / head 指针 / 灰显
 *   I 教材步骤顺序与日志文案（s->next / p->next / q->next / free(q)）
 *
 * H 部分沿用 test-stack-queue.js 的轻量“假 DOM”，不用浏览器即可验证真实渲染路径。
 */
import { MemoryModel } from './js/core/MemoryModel.js';
import { LinkedListDS } from './js/structures/LinkedListDS.js';
import { Renderer } from './js/render/Renderer.js';
import { Animator } from './js/animation/Animator.js';
import { CommandParser } from './js/core/CommandParser.js';
import { STEP } from './js/core/Step.js';

// ---------- 断言工具：同时打印预期结果与实际结果 ----------
let pass = 0;
let fail = 0;

function assertEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? '[PASS]' : '[FAIL]'} ${name}`);
  console.log(`         预期: ${JSON.stringify(expected)}`);
  console.log(`         实际: ${JSON.stringify(actual)}`);
}

// ---------- 假 DOM（只实现 Renderer 用到的几个方法） ----------
class FakeEl {
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
globalThis.document = { createElementNS: (_ns, tag) => new FakeEl(tag) };

function walk(el, cb) {
  cb(el);
  for (const c of el.children) walk(c, cb);
}

/** 取出画布中带指定 class 的文字内容（按绘制顺序）。 */
function texts(svg, classes) {
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
function els(svg, tag, cls) {
  const out = [];
  walk(svg, (e) => {
    if (e.tag !== tag) return;
    if (String(e.attrs.class || '').split(' ').includes(cls)) out.push(e);
  });
  return out;
}

/** 链表 next 箭头数量（相邻直线 + 跨块折线）。 */
function linkCount(svg) {
  return els(svg, 'line', 'mem-link').length + els(svg, 'path', 'mem-link').length;
}

// ---------- 执行辅助：与 Animator 保持一致地演进内存 ----------
function applySteps(mem, steps) {
  for (const s of steps) {
    const p = s.payload || {};
    switch (s.type) {
      case STEP.MOVE_VALUE: {
        const v = mem.read(p.from);
        mem.clear(p.from);
        mem.write(p.to, v);
        break;
      }
      case STEP.SET_VALUE:
        mem.write(p.block, p.value);
        break;
      case STEP.CLEAR_VALUE:
        mem.clear(p.block);
        break;
      case STEP.META:
        if (typeof p.run === 'function') p.run();
        break;
      default:
        break;
    }
  }
}

/** 逻辑顺序上的数据值（chain 数组顺序）。 */
function chainValues(L, mem) {
  return L.chain.map((id) => mem.read(id));
}

/** 从 head 出发沿 next 指针走一遍，返回遇到的 data（用于校验指针链一致性）。 */
function walkChain(L, mem) {
  const out = [];
  const seen = new Set();
  let cur = L.next.get(L.head.id) ?? null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(mem.read(cur));
    cur = L.next.get(cur) ?? null;
  }
  return out;
}

/** 建一个含 vals 的链表（尾插）。 */
function makeList(vals, maxNodes = 8) {
  const mem = new MemoryModel();
  const L = new LinkedListDS(mem, maxNodes);
  for (const v of vals) applySteps(mem, L.planInsert(L.chain.length + 1, v));
  return { mem, L };
}

// ============================================================
// 1. 初始化与建表
// ============================================================
console.log('\n【用例 A】带头结点初始化：只有头结点，空表指针为 NULL');
{
  const mem = new MemoryModel();
  const L = new LinkedListDS(mem, 8);

  assertEq('A-1 初始只分配了头结点', mem.getAllocatedBlocks().length, 1);
  assertEq('A-2 空表元素个数', L.length, 0);
  assertEq('A-3 head->next = NULL', L.next.get(L.head.id) ?? null, null);
  assertEq('A-4 头结点数据域不使用（空）', mem.read(L.head.id), null);
  assertEq('A-5 视图只有头结点', L.view().nodes.length, 1);
  assertEq('A-6 头结点标记为“头结点”', L.view().nodes[0].label, '头结点');
  assertEq('A-7 空表删除被拦截', L.deleteError(1) !== null, true);
  assertEq('A-8 空表查找被拦截', L.searchError() !== null, true);
  assertEq('A-9 空表插入只允许位序 1', [L.insertError(1), L.insertError(2) !== null], [null, true]);
}

console.log('\n【用例 B】尾插法建立 10 -> 20 -> 30');
{
  const { mem, L } = makeList([10, 20, 30]);

  assertEq('B-1 链表内容', chainValues(L, mem), [10, 20, 30]);
  assertEq('B-2 元素个数', L.length, 3);
  assertEq('B-3 沿 next 走一遍（指针链一致）', walkChain(L, mem), [10, 20, 30]);
  assertEq('B-4 head->next 指向第 1 个结点', L.next.get(L.head.id), L.chain[0]);
  assertEq('B-5 第 2 个结点的 next 指向第 3 个', L.next.get(L.chain[1]), L.chain[2]);
  assertEq('B-6 尾结点 next = NULL', L.next.get(L.chain[2]) ?? null, null);

  const addrs = [L.head, ...L.chain.map((id) => mem.getBlock(id))].map((b) => b.address);
  assertEq('B-7 头结点位于内存基址', addrs[0], mem.baseAddress);
  assertEq('B-8 各结点地址不连续（间隔大于一个单元）', addrs.slice(1).every((a, i) => a - addrs[i] > mem.unitSize), true);
}

// ============================================================
// 2. 插入与删除
// ============================================================
console.log('\n【用例 C】头插与中间插入（位序 1 起始，第 1 个结点在头结点之后）');
{
  const { mem, L } = makeList([10, 20, 30]);

  applySteps(mem, L.planInsert(1, 5));
  assertEq('C-1 头插 5 后链表', chainValues(L, mem), [5, 10, 20, 30]);
  assertEq('C-2 head->next 指向新结点 5', mem.read(L.next.get(L.head.id)), 5);
  assertEq('C-3 新结点的 next 指向原第 1 个结点 10', mem.read(L.next.get(L.chain[0])), 10);

  applySteps(mem, L.planInsert(3, 99));
  assertEq('C-4 在第 3 个位置前插入 99', chainValues(L, mem), [5, 10, 99, 20, 30]);
  assertEq('C-5 第 2 个结点（10）的 next 指向 99', mem.read(L.next.get(L.chain[1])), 99);
  assertEq('C-6 99 的 next 指向原第 3 个结点 20', mem.read(L.next.get(L.chain[2])), 20);
  assertEq('C-7 沿 next 走一遍仍一致', walkChain(L, mem), [5, 10, 99, 20, 30]);
}

console.log('\n【用例 D】删除第 2 个结点：摘链，内存不回收');
{
  const { mem, L } = makeList([10, 20, 30]);
  const removedId = L.chain[1];
  const removedValue = mem.read(removedId);

  applySteps(mem, L.planDelete(2));

  assertEq('D-1 删除后链表', chainValues(L, mem), [10, 30]);
  assertEq('D-2 元素个数', L.length, 2);
  assertEq('D-3 前驱 next 跳过被删结点，直接指向 30', mem.read(L.next.get(L.chain[0])), 30);
  assertEq('D-4 被删结点已脱离链（next 记录移除）', L.next.has(removedId), false);
  assertEq('D-5 被删结点内存未回收（仍是已分配块）', mem.getBlock(removedId).status, 'allocated');
  assertEq('D-6 被删结点标记 freed', mem.getBlock(removedId).meta.freed, true);
  assertEq('D-7 被删结点的数据仍保留', mem.read(removedId), removedValue);
  assertEq('D-8 视图：被删结点排到行尾并标记 freed', L.view().nodes.map((n) => [n.label, n.freed]), [
    ['头结点', false],
    ['第 1 个结点', false],
    ['第 2 个结点', false],
    ['已删除（未回收）', true],
  ]);
  assertEq('D-9 沿 next 走一遍只有存活结点', walkChain(L, mem), [10, 30]);
}

console.log('\n【用例 D2】删除第 1 个结点：head->next 直接改指后继');
{
  const { mem, L } = makeList([10, 20, 30]);
  applySteps(mem, L.planDelete(1));
  assertEq('D2-1 删除后链表', chainValues(L, mem), [20, 30]);
  assertEq('D2-2 head->next 指向原第 2 个结点', mem.read(L.next.get(L.head.id)), 20);
}

console.log('\n【用例 E】越界与结点上限防御');
{
  const { mem, L } = makeList([10, 20], 2);

  assertEq('E-1 位序 0 越界', L.insertError(0) !== null, true);
  assertEq('E-2 位序 len+2 越界', L.insertError(4) !== null, true);
  assertEq('E-3 删除位序 len+1 越界', L.deleteError(3) !== null, true);
  assertEq('E-4 达到上限后插入被拦截', L.insertError(L.length + 1) !== null, true);
  assertEq('E-5 被拦截时 planInsert 不产生步骤', L.planInsert(L.length + 1, 99).length, 0);
  assertEq('E-6 链表内容未变', chainValues(L, mem), [10, 20]);
  assertEq('E-7 地址越界时 planDelete 不产生步骤', L.planDelete(9).length, 0);
}

// ============================================================
// 3. 查找
// ============================================================
console.log('\n【用例 F】查找命中 / 未命中');
{
  const { mem, L } = makeList([10, 20, 30]);

  const hit = L.planSearch(20);
  const hitTypes = hit.map((s) => s.type);
  const hitResult = hit[hit.length - 1];
  assertEq('F-1 命中前比较 2 次（第 1、2 个结点）', hitTypes.filter((t) => t === STEP.COMPARE).length, 2);
  assertEq('F-2 命中 RESULT 标记 found', [hitResult.type, hitResult.payload.found], [STEP.RESULT, true]);
  assertEq('F-3 命中块就是第 2 个结点', hitResult.payload.block, L.chain[1]);
  assertEq('F-4 命中日志含结点地址', /第 2 个结点/.test(hit[jsonLastText(hit)].text.zh), true);

  const miss = L.planSearch(77);
  const missResult = miss[miss.length - 1];
  assertEq('F-5 未命中比较 3 次', miss.filter((s) => s.type === STEP.COMPARE).length, 3);
  assertEq('F-6 未命中 RESULT 标记 not found', [missResult.payload.found, missResult.payload.block], [false, null]);
  assertEq('F-7 未命中日志提到走到 NULL', /NULL/.test(missResult.text.zh), true);
  assertEq('F-8 查找不改变链表内容', chainValues(L, mem), [10, 20, 30]);
}

/** 取最后一个非空日志步骤的下标（辅助断言，避免 JSON 里塞整个 Step）。 */
function jsonLastText(steps) {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].text) return i;
  }
  return 0;
}

// ============================================================
// 4. 代码模式
// ============================================================
console.log('\n【用例 G】代码模式：声明初始化（尾插）+ insert + remove + search');
{
  const mem = new MemoryModel();
  const L = new LinkedListDS(mem, 8);

  const code = [
    'int L[8] = {10, 20, 30};',  // 尾插法建表
    'insert(L, 1, 5);',          // 头插
    'remove(L, 2);',             // 删除第 2 个结点（10）
    'search(L, 30);',            // 查找
  ].join('\n');
  const parsed = CommandParser.parse(code);
  const built = CommandParser.buildSteps(L, parsed.commands, parsed.declaration);
  applySteps(mem, built.steps);

  assertEq('G-1 规划无错误', built.errors.map((e) => e.msg.zh), []);
  assertEq('G-2 最终链表', chainValues(L, mem), [5, 20, 30]);
  assertEq('G-3 沿 next 走一遍一致', walkChain(L, mem), [5, 20, 30]);
  assertEq('G-4 元素个数', L.length, 3);
  assertEq('G-5 head->next 指向 5', mem.read(L.next.get(L.head.id)), 5);
  assertEq('G-6 存活结点均未被标记 freed', L.view().nodes.filter((n) => !n.freed).every((n) => {
    const b = mem.getBlock(n.blockId);
    return !b || b.meta.freed === undefined;
  }), true);
  assertEq('G-7 视图中出现 1 个 freed 结点', L.view().nodes.filter((n) => n.freed).length, 1);
  assertEq('G-8 初始化按尾插建立 3 个结点（另有 1 个被删）', L.view().nodes.length, 1 + 3 + 1);

  // 越界与会空表时的防御同样走代码模式
  const pBad = CommandParser.parse('remove(L, 9);');
  const rBad = CommandParser.buildSteps(L, pBad.commands, null);
  assertEq('G-9 代码模式删除越界报错', rBad.errors.length > 0 && /错误/.test(rBad.errors[0].msg.zh), true);
  assertEq('G-10 越界时不产生步骤', rBad.steps.length, 0);

  const pEmpty = CommandParser.parse('search(L, 1);');
  const empty = new LinkedListDS(new MemoryModel(), 8);
  const rEmpty = CommandParser.buildSteps(empty, pEmpty.commands, null);
  assertEq('G-11 空表查找报错', rEmpty.errors.length > 0, true);

  // 链表不支持按下标赋值 / 交换
  const pSet = CommandParser.parse('set(1, 9);');
  const rSet = CommandParser.buildSteps(L, pSet.commands, null);
  assertEq('G-12 链表不支持 set', rSet.errors.length > 0, true);
}

// ============================================================
// 5. 渲染与日志（真实 Renderer + Animator + 假 DOM）
// ============================================================
console.log('\n【用例 H】渲染：结点块 / data|next 两栏 / 箭头 / head 指针 / 删除灰显');
{
  const mem = new MemoryModel();
  const L = new LinkedListDS(mem, 8);
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  const logs = [];
  const animator = new Animator(
    mem,
    renderer,
    (t) => logs.push(t && t.zh),
    () => {},
    (m) => logs.push('ERR: ' + m),
    () => {}
  );
  animator.setSpeed(0);
  renderer.setViewProvider(() => L.view());

  for (const v of [10, 20, 30]) {
    animator.loadSteps(L.planInsert(L.chain.length + 1, v));
    await animator.playAll();
  }

  const addrOf = (id) => MemoryModel.formatAddress(mem.getBlock(id).address);

  assertEq('H-1 画布上的结点块数（头结点 + 3 个数据结点）', els(svg, 'rect', 'mem-block').length, 4);
  assertEq('H-2 head 指针标注在头结点左侧', texts(svg, 'mem-ptr'), ['head →']);
  assertEq('H-3 块内 data 栏（头结点为空标记）', texts(svg, ['mem-value', 'mem-empty']), ['∅', '10', '20', '30']);
  assertEq('H-4 块内 next 栏依次指向后继，尾结点为 NULL', texts(svg, 'mem-next'), [
    addrOf(L.chain[0]), addrOf(L.chain[1]), addrOf(L.chain[2]), 'NULL',
  ]);
  assertEq('H-5 箭头数 = 有效 next 链接数（head->1->2->3）', linkCount(svg), 3);
  assertEq('H-6 结点块从左到右按逻辑顺序排列',
    renderer.positions[L.head.id].x < renderer.positions[L.chain[0]].x
    && renderer.positions[L.chain[0]].x < renderer.positions[L.chain[2]].x, true);
  assertEq('H-7 画布宽度按内容设置（可横向滚动）', /^\d+px$/.test(svg.style.width), true);
  assertEq('H-8 日志含 s->next = p->next', logs.some((l) => /s->next = p->next/.test(String(l))), true);
  assertEq('H-9 日志含 p->next = s', logs.some((l) => /p->next = s/.test(String(l))), true);

  // 删除第 2 个结点：灰显、排在行尾、不再有箭头
  const removedId = L.chain[1];
  const logCountBefore = logs.length;
  animator.loadSteps(L.planDelete(2));
  await animator.playAll();

  assertEq('H-10 被删结点灰显（class 含 mem-block--freed）', els(svg, 'rect', 'mem-block--freed').length, 1);
  assertEq('H-11 被删结点的 next 栏显示 —', texts(svg, 'mem-next--freed'), ['—']);
  assertEq('H-12 存活结点之间只剩 2 条箭头（head->10, 10->30）', linkCount(svg), 2);
  assertEq('H-13 被删结点画在最后一个存活结点右侧',
    renderer.positions[removedId].x > renderer.positions[L.chain[L.chain.length - 1]].x, true);
  assertEq('H-14 被删结点的数据仍可见', texts(svg, ['mem-value']).includes('20'), true);
  assertEq('H-15 删除产生新日志并含 free(q)', logs.length > logCountBefore && logs.some((l) => /free\(q\)/.test(String(l))), true);
  assertEq('H-16 删除后 data 栏：∅ / 10 / 30 / 20（被删结点在行尾）', texts(svg, ['mem-value', 'mem-empty']), ['∅', '10', '30', '20']);
}

// ============================================================
// 6. 教材步骤顺序与日志
// ============================================================
console.log('\n【用例 I】步骤顺序与教材式日志');
{
  const mem = new MemoryModel();
  const L = new LinkedListDS(mem, 8);

  const ins = L.planInsert(1, 42);
  assertEq('I-1 插入步骤：HIGHLIGHT → SET_VALUE → META(s->next) → META(p->next) → UNHIGHLIGHT',
    ins.map((s) => s.type),
    [STEP.HIGHLIGHT, STEP.SET_VALUE, STEP.META, STEP.META, STEP.UNHIGHLIGHT]);
  const insTexts = ins.map((s) => (s.text ? s.text.zh : ''));
  const iSNext = insTexts.findIndex((t) => /s->next = p->next/.test(t));
  const iPLink = insTexts.findIndex((t) => /p->next = s/.test(t));
  assertEq('I-2 先挂后链：s->next 在 p->next 之前', iSNext >= 0 && iPLink > iSNext, true);

  applySteps(mem, ins);
  const del = L.planDelete(1);
  assertEq('I-3 删除步骤：HIGHLIGHT p → HIGHLIGHT q → META(p->next=q->next) → META(free) → 取消高亮',
    del.map((s) => s.type),
    [STEP.HIGHLIGHT, STEP.HIGHLIGHT, STEP.META, STEP.META, STEP.UNHIGHLIGHT, STEP.UNHIGHLIGHT]);
  const delTexts = del.map((s) => (s.text ? s.text.zh : ''));
  assertEq('I-4 删除日志含 p->next = q->next', delTexts.some((t) => /p->next = q->next/.test(t)), true);
  assertEq('I-5 删除日志含 e = q->data 与 free(q)', delTexts.some((t) => /e = q->data/.test(t) && /free\(q\)/.test(t)), true);
  applySteps(mem, del);
  assertEq('I-6 删除后链表为空', [L.length, chainValues(L, mem)], [0, []]);
  assertEq('I-7 空表 head->next 再次为 NULL', L.next.get(L.head.id) ?? null, null);
}

// ---------- 汇总 ----------
console.log('\n===== 自检完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
