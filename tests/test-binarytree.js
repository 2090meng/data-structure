/**
 * test-binarytree.js — 二叉树（二叉链表）全面自动化自检。
 *
 * 运行：node tests/test-binarytree.js
 *
 * 覆盖：
 *   A 空树初始化与防御
 *   B 按层序序列建树：层序编号、lchild / rchild、地址不连续
 *   C 插入左/右孩子与各种越界防御
 *   D 删除子树：整棵摘链、内存不回收（freed 灰显）、父指针置 NULL
 *   E 先序查找：命中 / 未命中
 *   F 四种遍历：先序 / 中序 / 后序 / 层次
 *   G 代码模式：声明按层序建树 + insertLeft + remove + 遍历 + search + 防御
 *   H 真实 Renderer + Animator + 假 DOM：结点块 / 父子连线 / root 指针 / 灰显
 *   I 教材步骤顺序与日志文案（T = s / p->lchild = s / 删除子树）
 *   J Preprocessor 对二叉树指令的提取
 */
import { MemoryModel } from '../js/core/MemoryModel.js';
import { BinaryTreeDS } from '../js/structures/BinaryTreeDS.js';
import { Renderer } from '../js/render/Renderer.js';
import { Animator } from '../js/animation/Animator.js';
import { CommandParser } from '../js/core/CommandParser.js';
import { Preprocessor } from '../js/core/Preprocessor.js';
import { STEP } from '../js/core/Step.js';
import { FakeEl, installFakeDOM, texts, els } from './helpers/fake-dom.js';
import { applySteps } from './helpers/steps.js';

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

// ---------- 假 DOM 与执行辅助（tests/helpers 共享） ----------
installFakeDOM();

/** 建一棵按层序序列填值的二叉树。 */
function makeTree(vals, maxNodes = 15) {
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, maxNodes);
  applySteps(mem, T.planBuildLevelOrder(vals));
  return { mem, T };
}

/** 层序编号 -> 值。 */
function indexValues(T, mem) {
  return [...T.byIndex].map(([i, n]) => [i, mem.read(n.id)]);
}

/** 把步骤里的 HIGHLIGHT 块按访问顺序翻译成结点值。 */
function visitedValues(steps, mem) {
  return steps
    .filter((s) => s.type === STEP.HIGHLIGHT)
    .map((s) => mem.read(s.payload.block));
}

// ============================================================
// 1. 空树
// ============================================================
console.log('\n【用例 A】空树：没有分配任何结点');
{
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, 15);
  const view = T.view();

  assertEq('A-1 初始没有已分配块', mem.getAllocatedBlocks().length, 0);
  assertEq('A-2 根编号为空', T.rootIndex, null);
  assertEq('A-3 结点数为 0', T.byIndex.size, 0);
  assertEq('A-4 视图没有结点 / 没有灰显块', [view.nodes.length, view.freed.length], [0, 0]);
  assertEq('A-5 视图 rootId 为空', view.rootId, null);
  assertEq('A-6 空树删除被拦截', T.deleteError(1) !== null, true);
  assertEq('A-7 空树查找被拦截', T.searchError() !== null, true);
  assertEq('A-8 空树遍历被拦截', T.traversalError() !== null, true);
  assertEq('A-9 空树只能建第 1 号根结点', [T.insertError(1, 'L'), T.insertError(2, 'L') !== null], [null, true]);
  assertEq('A-10 非法位序被拦截', T.insertError(0, 'L') !== null, true);
}

// ============================================================
// 2. 按层序建树
// ============================================================
console.log('\n【用例 B】层序序列 {10,20,30,40,50,60,70} 建立完全二叉树');
{
  const { mem, T } = makeTree([10, 20, 30, 40, 50, 60, 70]);

  assertEq('B-1 层序编号对应值', indexValues(T, mem), [
    [1, 10], [2, 20], [3, 30], [4, 40], [5, 50], [6, 60], [7, 70],
  ]);
  assertEq('B-2 根编号为 1', T.rootIndex, 1);
  assertEq('B-3 第 1 号结点左孩子为 2、右孩子为 3',
    [T.byIndex.get(1).left, T.byIndex.get(1).right], [2, 3]);
  assertEq('B-4 第 2 号结点左孩子为 4、右孩子为 5',
    [T.byIndex.get(2).left, T.byIndex.get(2).right], [4, 5]);
  assertEq('B-5 第 3 号结点左孩子为 6、右孩子为 7',
    [T.byIndex.get(3).left, T.byIndex.get(3).right], [6, 7]);
  assertEq('B-6 叶子结点无孩子', [T.byIndex.get(4).left, T.byIndex.get(7).right], [null, null]);
  assertEq('B-7 父指针正确', [T.byIndex.get(4).parent, T.byIndex.get(7).parent], [2, 3]);
  assertEq('B-8 视图结点数', T.view().nodes.length, 7);
  assertEq('B-9 视图 rootId 指向第 1 号的块', T.view().rootId, T.byIndex.get(1).id);
  assertEq('B-10 视图结点标签按层序编号', T.view().nodes.map((n) => n.label),
    ['第 1 号', '第 2 号', '第 3 号', '第 4 号', '第 5 号', '第 6 号', '第 7 号']);

  const addrs = mem.getAllocatedBlocks().map((b) => b.address);
  assertEq('B-11 根结点位于内存基址', addrs[0], mem.baseAddress);
  assertEq('B-12 各结点地址不连续（间隔大于一个单元）',
    addrs.slice(1).every((a, i) => a - addrs[i] > mem.unitSize), true);
}

// ============================================================
// 3. 插入孩子
// ============================================================
console.log('\n【用例 C】给第 4 号结点插入左 / 右孩子');
{
  const { mem, T } = makeTree([10, 20, 30, 40, 50, 60, 70]);

  applySteps(mem, T.planInsert(4, 'L', 80));
  assertEq('C-1 左孩子成为第 8 号结点', [T.byIndex.get(8).id, mem.read(T.byIndex.get(8).id)], [T.byIndex.get(8).id, 80]);
  assertEq('C-2 第 4 号结点 lchild 指向 8', T.byIndex.get(4).left, 8);
  assertEq('C-3 第 8 号结点 parent 为 4', T.byIndex.get(8).parent, 4);
  assertEq('C-4 结点数变为 8', T.byIndex.size, 8);

  applySteps(mem, T.planInsert(4, 'R', 90));
  assertEq('C-5 右孩子成为第 9 号结点', [T.byIndex.get(4).right, mem.read(T.byIndex.get(9).id)], [9, 90]);
  assertEq('C-6 第 9 号结点 parent 为 4', T.byIndex.get(9).parent, 4);
  assertEq('C-7 结点数变为 9', T.byIndex.size, 9);

  assertEq('C-8 左孩子已被占用时插入被拦截', T.insertError(4, 'L') !== null, true);
  assertEq('C-9 父结点不存在时插入被拦截', T.insertError(100, 'L') !== null, true);
  assertEq('C-10 被拦截时 planInsert 不产生步骤', T.planInsert(4, 'L', 1).length, 0);

  const small = makeTree([10, 20], 2);
  assertEq('C-11 达到结点上限后插入被拦截', small.T.insertError(1, 'L') !== null, true);
  assertEq('C-12 上限时 planInsert 不产生步骤', small.T.planInsert(1, 'L', 99).length, 0);
  assertEq('C-13 结点内容未变', indexValues(small.T, small.mem), [[1, 10], [2, 20]]);
}

// ============================================================
// 4. 删除子树
// ============================================================
console.log('\n【用例 D】删除以第 2 号结点为根的子树：整棵摘链，内存不回收');
{
  const { mem, T } = makeTree([10, 20, 30, 40, 50, 60, 70]);
  applySteps(mem, T.planInsert(4, 'L', 80));
  applySteps(mem, T.planInsert(4, 'R', 90));

  const removedIds = [2, 4, 5, 8, 9].map((i) => T.byIndex.get(i).id);
  applySteps(mem, T.planDelete(2));

  assertEq('D-1 只剩 1 / 3 / 6 / 7 号结点', [...T.byIndex.keys()], [1, 3, 6, 7]);
  assertEq('D-2 根结点的 lchild 置为 NULL', T.byIndex.get(1).left, null);
  assertEq('D-3 根结点仍是第 1 号', T.rootIndex, 1);
  assertEq('D-4 被删的 5 个块仍为已分配', removedIds.every((id) => mem.getBlock(id).status === 'allocated'), true);
  assertEq('D-5 被删的 5 个块都标记 freed', removedIds.map((id) => mem.getBlock(id).meta.freed), [true, true, true, true, true]);
  assertEq('D-6 被删结点的数据仍保留', removedIds.map((id) => mem.read(id)), [20, 40, 50, 80, 90]);
  assertEq('D-7 视图灰显块数', T.view().freed.length, 5);
  assertEq('D-8 视图灰显标签', T.view().freed.map((f) => f.label), [
    '已删除（未回收）', '已删除（未回收）', '已删除（未回收）', '已删除（未回收）', '已删除（未回收）',
  ]);
  assertEq('D-9 已删除的编号再次删除被拦截', T.deleteError(2) !== null, true);
  assertEq('D-10 越界编号删除不产生步骤', T.planDelete(99).length, 0);

  applySteps(mem, T.planDelete(1));
  assertEq('D-11 删除根结点后树为空', [T.byIndex.size, T.rootIndex], [0, null]);
  assertEq('D-12 全部 9 个结点都灰显', T.view().freed.length, 9);
  assertEq('D-13 空树没有 rootId', T.view().rootId, null);
}

// ============================================================
// 5. 查找
// ============================================================
console.log('\n【用例 E】先序查找命中 / 未命中');
{
  const { mem, T } = makeTree([10, 20, 30, 40, 50, 60, 70]);

  const hit = T.planSearch(50);
  const hitTypes = hit.map((s) => s.type);
  const hitResult = hit[hit.length - 1];
  assertEq('E-1 先序比较 4 次（10 → 20 → 40 → 50）', hitTypes.filter((t) => t === STEP.COMPARE).length, 4);
  assertEq('E-2 命中 RESULT 标记 found', [hitResult.type, hitResult.payload.found], [STEP.RESULT, true]);
  assertEq('E-3 命中块是第 5 号结点', hitResult.payload.block, T.byIndex.get(5).id);
  assertEq('E-4 命中日志提到第 5 号结点', /第 5 号结点/.test(hitResult.text.zh), true);

  const miss = T.planSearch(99);
  const missResult = miss[miss.length - 1];
  assertEq('E-5 未命中比较 7 次', miss.filter((s) => s.type === STEP.COMPARE).length, 7);
  assertEq('E-6 未命中 RESULT 标记 not found', [missResult.payload.found, missResult.payload.block], [false, null]);
  assertEq('E-7 未命中日志提到遍历完整棵树', /遍历完整棵树/.test(missResult.text.zh), true);
  assertEq('E-8 查找不改变树内容', indexValues(T, mem).map((x) => x[1]), [10, 20, 30, 40, 50, 60, 70]);
}

// ============================================================
// 6. 四种遍历
// ============================================================
console.log('\n【用例 F】先序 / 中序 / 后序 / 层次遍历');
{
  const { mem, T } = makeTree([10, 20, 30, 40, 50, 60, 70]);

  assertEq('F-1 先序：根 左 右', visitedValues(T.planPreorder(), mem), [10, 20, 40, 50, 30, 60, 70]);
  assertEq('F-2 中序：左 根 右', visitedValues(T.planInorder(), mem), [40, 20, 50, 10, 60, 30, 70]);
  assertEq('F-3 后序：左 右 根', visitedValues(T.planPostorder(), mem), [40, 50, 20, 60, 70, 30, 10]);
  assertEq('F-4 层次：逐层从左到右', visitedValues(T.planLevelorder(), mem), [10, 20, 30, 40, 50, 60, 70]);

  const last = T.planPreorder().slice(-1)[0];
  assertEq('F-5 遍历最后输出访问序列', /先序遍历序列：10 → 20 → 40 → 50 → 30 → 60 → 70/.test(last.text.zh), true);
  assertEq('F-6 每个结点先高亮再取消（7 组）',
    [T.planInorder().filter((s) => s.type === STEP.HIGHLIGHT).length,
      T.planInorder().filter((s) => s.type === STEP.UNHIGHLIGHT).length], [7, 7]);
}

// ============================================================
// 7. 代码模式
// ============================================================
console.log('\n【用例 G】代码模式：层序声明 + insertLeft + remove + preorder + search');
{
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, 15);

  const code = [
    'int T[15] = {10, 20, 30, 40, 50, 60, 70};',
    'insertLeft(T, 4, 80);',
    'remove(T, 5);',
    'preorder(T);',
    'search(T, 30);',
  ].join('\n');
  const parsed = CommandParser.parse(code);
  const built = CommandParser.buildSteps(T, parsed.commands, parsed.declaration);
  applySteps(mem, built.steps);

  assertEq('G-1 规划无错误', built.errors.map((e) => e.msg.zh), []);
  assertEq('G-2 第 5 号结点已删除，剩 1/2/3/4/6/7/8', [...T.byIndex.keys()], [1, 2, 3, 4, 6, 7, 8]);
  assertEq('G-3 第 4 号结点的左孩子是 8', T.byIndex.get(4).left, 8);
  assertEq('G-4 第 8 号结点值为 80', mem.read(T.byIndex.get(8).id), 80);
  assertEq('G-6 被删的第 5 号块灰显', T.view().freed.length, 1);
  assertEq('G-7 先序访问序列', visitedValues(built.steps.slice(built.steps.findIndex((s) => s.line === 4)), mem),
    [10, 20, 40, 80, 30, 60, 70]);
  assertEq('G-8 查找 30 命中', /找到目标值 30/.test(built.steps.filter((s) => s.line === 5).slice(-1)[0].text.zh), true);

  // 防御：第 1 号结点的左孩子已被第 2 号占用
  const T2 = new BinaryTreeDS(new MemoryModel(), 15);
  const p2 = CommandParser.parse('int T[15] = {1, 2, 3};\ninsertLeft(T, 1, 8);\ninsertLeft(T, 4, 9);');
  const r2 = CommandParser.buildSteps(T2, p2.commands, p2.declaration);
  assertEq('G-9 左孩子已被占用时报错', r2.errors.length > 0 && /错误/.test(r2.errors[0].msg.zh), true);

  const emptyT = new BinaryTreeDS(new MemoryModel(), 15);
  const pEmpty = CommandParser.parse('preorder(T);');
  const rEmpty = CommandParser.buildSteps(emptyT, pEmpty.commands, null);
  assertEq('G-10 空树遍历报错', rEmpty.errors.length > 0, true);

  const pUnion = CommandParser.parse('insert(T, 1, 5);');
  const rUnion = CommandParser.buildSteps(new BinaryTreeDS(new MemoryModel(), 15), pUnion.commands, null);
  assertEq('G-11 insert(T, i, v) 在二叉树上报错（应使用 insertLeft/Right）', rUnion.errors.length > 0, true);

  const pRoot = CommandParser.parse('insert(T, 5);');
  const rootT = new BinaryTreeDS(new MemoryModel(), 15);
  const rRoot = CommandParser.buildSteps(rootT, pRoot.commands, null);
  applySteps(rootT.memory, rRoot.steps);
  assertEq('G-12 insert(T, v) 空树时建立根结点', [rRoot.errors.length, rootT.byIndex.size, rootT.memory.read(rootT.byIndex.get(1).id)], [0, 1, 5]);

  const pSet = CommandParser.parse('set(1, 9);');
  const rSet = CommandParser.buildSteps(rootT, pSet.commands, null);
  assertEq('G-13 二叉树不支持 set', rSet.errors.length > 0, true);

  const pRoot2 = CommandParser.parse('insert(T, 6);');
  const rRoot2 = CommandParser.buildSteps(rootT, pRoot2.commands, null);
  assertEq('G-14 已有根结点时再 insert(T, v) 报错', rRoot2.errors.length > 0, true);
}

// ============================================================
// 8. 渲染（真实 Renderer + Animator + 假 DOM）
// ============================================================
console.log('\n【用例 H】渲染：结点块 / 父子连线 / root 指针 / 删除灰显');
{
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, 15);
  applySteps(mem, T.planBuildLevelOrder([10, 20, 30, 40, 50, 60, 70]));
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  renderer.setViewProvider(() => T.view());

  renderer.render(mem);

  assertEq('H-1 结点块数', els(svg, 'rect', 'mem-block').length, 7);
  assertEq('H-2 父子指针线条数 = 结点数 - 1', els(svg, 'line', 'mem-link').length, 6);
  assertEq('H-3 root 指针标注', texts(svg, 'mem-ptr'), ['root →']);
  assertEq('H-4 块内值按层序编号顺序绘制', texts(svg, ['mem-value', 'mem-empty']),
    ['10', '20', '30', '40', '50', '60', '70']);
  assertEq('H-5 每个结点都有地址标注', texts(svg, 'mem-addr').length, 7);
  assertEq('H-6 结点标签按层序编号', texts(svg, 'mem-label').slice(1),
    ['第 1 号', '第 2 号', '第 3 号', '第 4 号', '第 5 号', '第 6 号', '第 7 号']);

  const rootPos = renderer.positions[T.byIndex.get(1).id];
  const leftPos = renderer.positions[T.byIndex.get(2).id];
  const rightPos = renderer.positions[T.byIndex.get(3).id];
  assertEq('H-7 根在最上方（y 最小）', rootPos.y < leftPos.y && rootPos.y < rightPos.y, true);
  assertEq('H-8 左子树在根左侧、右子树在根右侧', leftPos.x < rootPos.x && rightPos.x > rootPos.x, true);
  assertEq('H-9 画布宽度按内容设置（可横向滚动）', /^\d+px$/.test(svg.style.width), true);
  assertEq('H-10 画布高度自适应', /^\d+px$/.test(svg.style.height), true);

  // 删除第 3 号子树
  const removed = [3, 6, 7].map((i) => T.byIndex.get(i).id);
  applySteps(mem, T.planDelete(3));
  renderer.render(mem);

  assertEq('H-11 灰显块数 = 被删子树结点数', els(svg, 'rect', 'mem-block--freed').length, 3);
  assertEq('H-12 剩余父子连线 = 3', els(svg, 'line', 'mem-link').length, 3);
  assertEq('H-13 被删结点的值仍显示在下方', texts(svg, ['mem-value', 'mem-empty']).slice(-3), ['30', '60', '70']);
  assertEq('H-14 灰显标签', texts(svg, 'mem-label').filter((t) => t === '已删除（未回收）').length, 3);
  assertEq('H-15 灰显块位置在存活结点下方',
    removed.every((id) => renderer.positions[id].y > renderer.positions[T.byIndex.get(1).id].y), true);
  assertEq('H-16 root 指针仍指向根', texts(svg, 'mem-ptr'), ['root →']);

  // 空树提示
  const emptyT = new BinaryTreeDS(new MemoryModel(), 15);
  const svg2 = new FakeEl('svg');
  const renderer2 = new Renderer(svg2);
  renderer2.setViewProvider(() => emptyT.view());
  renderer2.render(emptyT.memory);
  assertEq('H-17 空树提示', texts(svg2, 'mem-label').includes('空树 / Empty tree'), true);
}

// ============================================================
// 9. 教材步骤顺序与日志
// ============================================================
console.log('\n【用例 I】步骤顺序与教材式日志');
{
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, 15);

  const rootIns = T.planInsert(1, 'L', 42);
  assertEq('I-1 空树建根：SET_VALUE → META', rootIns.map((s) => s.type), [STEP.SET_VALUE, STEP.META]);
  assertEq('I-2 建根日志含 T = s 与“根结点”', /T = s/.test(rootIns[1].text.zh) && /根结点/.test(rootIns[1].text.zh), true);
  applySteps(mem, rootIns);

  const childIns = T.planInsert(1, 'L', 7);
  assertEq('I-3 插入孩子：HIGHLIGHT → SET_VALUE → META → UNHIGHLIGHT',
    childIns.map((s) => s.type),
    [STEP.HIGHLIGHT, STEP.SET_VALUE, STEP.META, STEP.UNHIGHLIGHT]);
  assertEq('I-4 挂链日志含 p->lchild = s', /p->lchild = s/.test(childIns[2].text.zh), true);
  assertEq('I-5 新结点值写入日志含 s->data 与 lchild = rchild = NULL',
    /s->data = 7/.test(childIns[1].text.zh) && /lchild = s->rchild = NULL/.test(childIns[1].text.zh), true);
  applySteps(mem, childIns);

  const rootBlockId = T.byIndex.get(1).id;
  const del = T.planDelete(1);
  assertEq('I-6 删除子树：HIGHLIGHT（根）→ HIGHLIGHT（子孙）→ META → UNHIGHLIGHT',
    del.map((s) => s.type),
    [STEP.HIGHLIGHT, STEP.HIGHLIGHT, STEP.META, STEP.UNHIGHLIGHT, STEP.UNHIGHLIGHT]);
  assertEq('I-7 删除日志含“共 2 个结点”与“内存不回收”',
    /共 2 个结点/.test(del[2].text.zh) && /内存不回收/.test(del[2].text.zh), true);
  applySteps(mem, del);
  assertEq('I-8 删除后树为空', [T.byIndex.size, T.rootIndex], [0, null]);

  // 撤销删除（META undo）应恢复整棵子树并取消灰显
  del[2].payload.undo();
  assertEq('I-9 删除的 undo 恢复整棵子树', [T.byIndex.size, T.rootIndex], [2, 1]);
  assertEq('I-10 撤销后根结点不再灰显', mem.getBlock(rootBlockId).meta.freed, false);
}

// ============================================================
// 10. Preprocessor 提取
// ============================================================
console.log('\n【用例 J】Preprocessor 提取二叉树指令');
{
  const src = [
    '#include <stdio.h>',
    'int T[15] = {10, 20, 30};',
    'insertLeft(T, 2, 5);',
    'insertRight(T, 2, 6);',
    'preorder(T);',
    'inorder(T);',
    'postorder(T);',
    'levelorder(T);',
    'remove(T, 2);',
  ].join('\n');
  const { output, count } = Preprocessor.extract(src);
  assertEq('J-1 提取到 8 条指令（含声明）', count, 8);
  assertEq('J-2 保留层序声明', output.includes('int arr[15] = {10, 20, 30};'), true);
  assertEq('J-3 规范化 insertLeft', output.includes('insertLeft(t, 2, 5);'), true);
  assertEq('J-4 规范化 insertRight', output.includes('insertRight(t, 2, 6);'), true);
  assertEq('J-5 规范化四种遍历',
    ['preorder(t);', 'inorder(t);', 'postorder(t);', 'levelorder(t);'].every((s) => output.includes(s)), true);
  assertEq('J-6 保留 remove', output.includes('remove(arr, 2);'), true);
}

// ============================================================
// 11. Animator 全流程（与页面“运行代码”一致）
// ============================================================
console.log('\n【用例 K】Animator 播放完整示例代码后，树与画面一致');
{
  const mem = new MemoryModel();
  const T = new BinaryTreeDS(mem, 15);
  const svg = new FakeEl('svg');
  const renderer = new Renderer(svg);
  renderer.setViewProvider(() => T.view());
  const animator = new Animator(mem, renderer);
  animator.setSpeed(0);

  const code = [
    'int T[15] = {10, 20, 30, 40, 50, 60, 70};',
    'insertLeft(T, 4, 80);',
    'insertRight(T, 4, 90);',
    'preorder(T);',
    'inorder(T);',
    'postorder(T);',
    'levelorder(T);',
    'search(T, 50);',
    'remove(T, 2);',
  ].join('\n');
  const parsed = CommandParser.parse(code);
  const built = CommandParser.buildSteps(T, parsed.commands, parsed.declaration);
  animator.loadSteps(built.steps);
  await animator.playAll();

  assertEq('K-1 动画执行无错误', built.errors.length, 0);
  assertEq('K-2 动画结束后只剩 1 / 3 / 6 / 7 号结点', [...T.byIndex.keys()], [1, 3, 6, 7]);
  assertEq('K-3 动画结束后根结点仍在', T.rootIndex, 1);
  assertEq('K-4 动画结束后已删除 5 个结点', T.view().freed.length, 5);
  assertEq('K-5 画面块总数（存活 4 + 灰显 5）', els(svg, 'rect', 'mem-block').length, 9);
  assertEq('K-6 画面灰显块数', els(svg, 'rect', 'mem-block--freed').length, 5);
  assertEq('K-7 画面父子连线数', els(svg, 'line', 'mem-link').length, 3);
  assertEq('K-8 画面 root 指针', texts(svg, 'mem-ptr'), ['root →']);
}

// ---------- 汇总 ----------
console.log('\n===== 自检完成：' + pass + ' PASS / ' + fail + ' FAIL =====');
if (fail > 0) process.exitCode = 1;
