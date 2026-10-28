/**
 * CommandParser.js — 代码驱动模式的“C/C++ 风格轻量解析器”。
 *
 * 不是真正的编译器：把用户输入的 C 风格伪代码逐行解析成若干条“与数据结构相关的”指令，
 * 再借助数据结构层的 plan* 方法，逐条展开成可交给 Animator 播放的 Step 序列。
 *
 * 支持识别的语法（大小写不敏感，`//` 为注释，语句可用 `;` 分隔）：
 *   int arr[10] = {10, 20, 5};   声明并初始化数组（容量 10，前三个元素初始值）
 *   int arr[10];                 仅声明容量
 *   arr[1] = 20;                 修改下标 1 的值为 20
 *   insert(arr, 1, 20);          在下标 1 插入 20
 *   insert(arr, 20);             末尾追加 20
 *   remove(arr, 0); / delete(arr, 0);  删除下标 0
 *   search(arr, 20);             查找 20
 *   push(stack, 10);             栈入栈 / 队列入队（按当前结构决定）
 *   pop(stack);                  栈出栈 / 队列出队
 *   enqueue(q, 10);              队列入队
 *   dequeue(q);                  队列出队
 *
 * 指令的语义会随当前数据结构（数组 / 链表 / 栈 / 队列）自动映射：
 *   数组：push/pop 等价于“末尾追加 / 删除末尾”；下标相关的指令全部支持。
 *   链表：insert / remove 按位序（1 起始，第 1 个结点在头结点之后），push/pop 等价于表尾操作。
 *   栈：只支持栈顶操作（push / pop / search），按下标插入删除会报错。
 *   队列：只支持队头出队、队尾入队（enqueue / dequeue / search）。
 *
 * 其余无法识别的内容（#include、printf、for、return、花括号等）会被静默忽略，不报错。
 *
 * 每个指令最终会带一个 line 字段（1 起始的代码行号），Animator 据此高亮代码行。
 */
import { STEP, makeStep } from './Step.js';

const IDENT = '[a-zA-Z_]\\w*';

export class CommandParser {
  /** 单次解析最多提取的指令条数（防御超大输入导致页面卡死）。 */
  static MAX_COMMANDS = 100;

  /**
   * 解析整段代码。
   * @param {string} code
   * @returns {{
   *   commands: Array<{type:string,index:number|null,value:number,line:number}>,
   *   declaration: {capacity:number,values:number[],line:number}|null,
   *   ignoredCount: number,
   *   truncated: boolean
   * }}
   */
  static parse(code) {
    const commands = [];
    let declaration = null;
    let ignoredCount = 0;
    let truncated = false;

    const lines = String(code || '').split(/\r?\n/);

    outer:
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      let line = lines[i];
      // 去掉 // 注释
      const cIdx = line.indexOf('//');
      if (cIdx >= 0) line = line.slice(0, cIdx);

      // 以 ; 分隔（支持一行多条语句）
      const parts = line.split(';');
      for (const raw of parts) {
        const stmt = raw.trim();
        if (!stmt) continue;

        // 声明：int arr[N] = {...} 或 int arr[N];
        const dm = stmt.match(new RegExp('^int\\s+' + IDENT + '\\s*\\[\\s*(\\d+)\\s*\\]\\s*(?:=\\s*\\{([^{}]*)\\})?$', 'i'));
        if (dm) {
          if (!declaration) {
            declaration = {
              capacity: +dm[1],
              values: CommandParser._parseInitializer(dm[2]),
              line: lineNo,
            };
          }
        } else {
          const cmd = CommandParser._parseStmt(stmt, lineNo);
          if (cmd) commands.push(cmd);
          else ignoredCount++; // 无法识别的内容：静默忽略
        }

        // 到达上限后停止继续提取
        if (commands.length + (declaration ? 1 : 0) >= CommandParser.MAX_COMMANDS) {
          truncated = true;
          break outer;
        }
      }
    }

    return { commands, declaration, ignoredCount, truncated };
  }

  /** 解析初始化列表 "10, 20, 5" -> [10, 20, 5]。 */
  static _parseInitializer(s) {
    if (!s) return [];
    return s.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n));
  }

  /** 解析单条语句。返回指令对象，无法识别时返回 null。 */
  static _parseStmt(stmt, line) {
    let m;

    // arr[i] = v
    m = stmt.match(new RegExp('^(' + IDENT + ')\\s*\\[\\s*(-?\\d+)\\s*\\]\\s*=\\s*(-?\\d+)$', 'i'));
    if (m) return { type: 'set', index: +m[2], value: +m[3], line };

    // insert(arr, i, v) —— 三个参数
    m = stmt.match(new RegExp('^insert\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'insert', index: +m[1], value: +m[2], line };

    // insert(arr, v) —— 两个参数（末尾追加；二叉树中表示建立根结点）
    m = stmt.match(new RegExp('^insert\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'insert', index: null, value: +m[1], line };

    // insertLeft(t, i, v) / insertRight(t, i, v) —— 二叉树：挂为第 i 号结点的左/右孩子
    m = stmt.match(new RegExp('^insert\\s*(left|right|l|r)\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) {
      const left = /^l/i.test(m[1]);
      return { type: left ? 'insertLeft' : 'insertRight', index: +m[2], value: +m[3], line };
    }

    // preorder / inorder / postorder / levelorder（二叉树遍历）
    m = stmt.match(new RegExp('^(preorder|inorder|postorder|levelorder)\\s*\\(\\s*(?:' + IDENT + ')?\\s*\\)$', 'i'));
    if (m) return { type: m[1].toLowerCase(), index: null, value: null, line };

    // remove(arr, i) / delete(arr, i)
    m = stmt.match(new RegExp('^(?:remove|delete)\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'remove', index: +m[1], line };

    // search(arr, v)
    m = stmt.match(new RegExp('^search\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'search', index: null, value: +m[1], line };

    // push(stack, v) —— 栈/队列入队，映射为末尾追加
    m = stmt.match(new RegExp('^push\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'push', index: null, value: +m[1], line };

    // pop(stack) —— 栈/队列出队，映射为删除末尾
    m = stmt.match(new RegExp('^pop\\s*\\(\\s*' + IDENT + '\\s*\\)$', 'i'));
    if (m) return { type: 'pop', index: null, value: null, line };

    // enqueue(q, v) —— 队列入队
    m = stmt.match(new RegExp('^enqueue\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'enqueue', index: null, value: +m[1], line };

    // dequeue(q) —— 队列出队
    m = stmt.match(new RegExp('^dequeue\\s*\\(\\s*' + IDENT + '\\s*\\)$', 'i'));
    if (m) return { type: 'dequeue', index: null, value: null, line };

    // ---------- 简写模式：省略变量名，直接写数字参数 ----------
    // set(i, v)
    m = stmt.match(/^set\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'set', index: +m[1], value: +m[2], line };

    // swap(i, j) —— 交换两个下标的值
    m = stmt.match(/^swap\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'swap', index: +m[1], index2: +m[2], value: null, line };

    // insert(i, v)
    m = stmt.match(/^insert\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'insert', index: +m[1], value: +m[2], line };

    // insertLeft(i, v) / insertRight(i, v) —— 二叉树简写
    m = stmt.match(/^insert\s*(left|right|l|r)\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
    if (m) {
      const left = /^l/i.test(m[1]);
      return { type: left ? 'insertLeft' : 'insertRight', index: +m[2], value: +m[3], line };
    }

    // insert(v) —— 末尾追加
    m = stmt.match(/^insert\s*\(\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'insert', index: null, value: +m[1], line };

    // remove(i) / delete(i)
    m = stmt.match(/^(?:remove|delete)\s*\(\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'remove', index: +m[1], line };

    // search(v)
    m = stmt.match(/^search\s*\(\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'search', index: null, value: +m[1], line };

    // push(v)
    m = stmt.match(/^push\s*\(\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'push', index: null, value: +m[1], line };

    // pop()
    m = stmt.match(/^pop\s*\(\s*\)$/i);
    if (m) return { type: 'pop', index: null, value: null, line };

    // enqueue(v) —— 队列入队
    m = stmt.match(/^enqueue\s*\(\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'enqueue', index: null, value: +m[1], line };

    // dequeue()
    m = stmt.match(/^dequeue\s*\(\s*\)$/i);
    if (m) return { type: 'dequeue', index: null, value: null, line };

    return null;
  }

  /**
   * 把解析结果展开成 Step 列表。
   * 连续规划多行时，用 len 追踪“当前长度”、用 sim 模拟元素值，
   * 保证各行的 move/set 目标与实际执行一致；遇到非法指令则停止并记录错误。
   *
   * @param {import('../structures/ArrayDS.js').ArrayDS | import('../structures/StackDS.js').StackDS | import('../structures/QueueDS.js').QueueDS} structure
   * @param {Array<{type:string,index:number|null,value:number,line:number}>} commands
   * @param {{capacity:number,values:number[],line:number}|null} declaration
   * @returns {{steps:Array<object>, errors:Array<{line:number,msg:{zh:string,en:string}}>}}
   */
  static buildSteps(structure, commands, declaration = null) {
    const steps = [];
    const errors = [];

    // 用块 id -> value 模拟当前元素值，避免连续规划时读到“旧”内存。
    const sim = new Map();
    const simMem = { read: (id) => (sim.has(id) ? sim.get(id) : null) };
    const kind = structure.kind || 'array';
    // 链表 / 二叉树的“规划期形态”：结点 id 与指针由 plan* 就地推进，供后续指令继续规划。
    // （这两种结构没有预分配 slots，规划起点直接取结构当前形态；其余结构由调用方先重置为空结构。）
    const ctx = (kind === 'linked' || kind === 'binarytree') ? structure.planningContext() : null;
    let len = kind === 'linked' ? ctx.chain.length : kind === 'binarytree' ? ctx.byIndex.size : 0;
    // 队列的“规划期队头”：代码模式一次性规划多行，真实 front 要等动画执行到
    // META 步骤才会变，因此必须自己推进，否则出队后的下次入队会覆盖旧槽位。
    let front = kind === 'queue' ? structure.front % structure.capacity : 0;

    // 1) 声明初始化：把 { ... } 里的值依次写入槽位（超出容量的部分忽略）。
    //    循环队列牺牲一个单元，可存元素最多 MaxSize-1 个，初始化也要按这个上限截断。
    if (declaration) {
      if (kind === 'linked') {
        // 链表没有预分配的连续槽位：初始化值按【尾插法】逐个建立结点。
        for (const v of declaration.values) {
          if (ctx.chain.length >= structure.maxNodes) break;
          const s = structure.planInsert(ctx.chain.length + 1, v, ctx.chain.length, simMem, ctx);
          for (const st of s) st.line = declaration.line;
          steps.push(...s);
          CommandParser._simulate(sim, s);
        }
        len = ctx.chain.length;
      } else if (kind === 'binarytree') {
        // 二叉树没有预分配的连续槽位：初始化值按【层序序列】逐个建立结点。
        const s = structure.planBuildLevelOrder(declaration.values, ctx);
        for (const st of s) st.line = declaration.line;
        steps.push(...s);
        CommandParser._simulate(sim, s);
        len = ctx.byIndex.size;
      } else {
        const limit = kind === 'queue'
          ? Math.min(structure.slots.length, structure.maxSize)
          : structure.slots.length;
        declaration.values.forEach((v, i) => {
          if (i >= limit) return;
          const st = makeStep(STEP.SET_VALUE, { block: structure.slots[i].id, value: v }, {
            zh: `初始化 [${i}] = ${v}`,
            en: `Initialize [${i}] = ${v}`,
          });
          st.line = declaration.line;
          steps.push(st);
          sim.set(structure.slots[i].id, v);
        });
        len = Math.min(declaration.values.length, limit);
      }
    }

    // 2) 逐条指令展开。
    for (const c of commands) {
      const before = errors.length;
      let s = [];

      switch (c.type) {
        case 'set': {
          // arr[i] / set(i, v)：按 C 语义使用物理下标（0 起始）。
          if (kind !== 'array') {
            errors.push(CommandParser._kindErr(c.line, kind));
          } else if (c.index < 0 || c.index >= len) {
            errors.push(CommandParser._err(c.line, `错误：数组下标 ${c.index} 越界（当前长度 ${len}，下标 0..${len - 1}）`, `Error: index ${c.index} out of range (length ${len}, index 0..${len - 1})`));
          } else {
            s = structure.planSet(c.index + 1, c.value, len);
          }
          break;
        }
        case 'insert': {
          // insert 的位置按教材位序（1 起始）：第 len+1 个位置即表尾追加。
          const pos = c.index === null ? len + 1 : c.index;
          if (kind === 'stack') {
            if (pos !== len + 1) {
              errors.push(CommandParser._err(c.line, '错误：栈只能在栈顶插入，请使用 push', 'Error: a stack only allows insertion at the top, use push'));
            } else {
              s = structure.planPush(c.value, len, simMem);
            }
          } else if (kind === 'queue') {
            errors.push(CommandParser._kindErr(c.line, kind));
          } else if (kind === 'binarytree') {
            // 二叉树只允许按“父结点 + 左/右孩子”插入；insert(t, v) 仅用于建立根结点。
            if (c.index !== null) {
              errors.push(CommandParser._err(c.line, '错误：二叉树请使用 insertLeft(t, i, v) / insertRight(t, i, v) 指定左/右孩子', 'Error: use insertLeft(t, i, v) / insertRight(t, i, v) to specify the left/right child'));
            } else if (ctx.byIndex.size > 0) {
              errors.push(CommandParser._err(c.line, '错误：树中已有根结点，请使用 insertLeft / insertRight 插入孩子', 'Error: the tree already has a root; use insertLeft / insertRight to attach a child'));
            } else {
              const err = structure.insertError(1, 'L', ctx);
              if (err) errors.push(CommandParser._errMsg(c.line, err));
              else s = structure.planInsert(1, 'L', c.value, ctx);
            }
          } else if (kind === 'linked') {
            const err = structure.insertError(pos, len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planInsert(pos, c.value, len, simMem, ctx);
          } else if (pos < 1 || pos > len + 1 || len >= structure.capacity) {
            errors.push(CommandParser._err(c.line, `错误：插入位序 ${pos} 越界（应为 1..${len + 1}）或数组已满`, `Error: position ${pos} out of range (1..${len + 1}) or array full`));
          } else {
            s = structure.planInsert(pos, c.value, len, simMem);
          }
          break;
        }
        case 'remove': {
          if (kind === 'binarytree') {
            const err = structure.deleteError(c.index, ctx);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planDelete(c.index, ctx, simMem);
          } else if (len === 0) {
            errors.push(CommandParser._err(c.line, `当前结构为空，无法操作`, `The structure is empty`));
          } else if (kind === 'stack') {
            if (c.index !== len) {
              errors.push(CommandParser._err(c.line, `错误：栈只能弹出栈顶（第 ${len} 个），请使用 pop`, `Error: a stack only allows popping the top (element ${len}), use pop`));
            } else {
              s = structure.planPop(len, simMem);
            }
          } else if (kind === 'queue') {
            if (c.index !== 1) {
              errors.push(CommandParser._err(c.line, '错误：队列只能从队头出队（第 1 个），请使用 dequeue', 'Error: a queue only allows dequeuing the front (element 1), use dequeue'));
            } else {
              s = structure.planDequeue(len, simMem, front);
            }
          } else if (kind === 'linked') {
            const err = structure.deleteError(c.index, len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planDelete(c.index, len, simMem, ctx);
          } else if (c.index < 1 || c.index > len) {
            errors.push(CommandParser._err(c.line, `错误：删除位序 ${c.index} 越界（应为 1..${len}）`, `Error: position ${c.index} out of range (1..${len})`));
          } else {
            s = structure.planDelete(c.index, len, simMem);
          }
          break;
        }
        case 'swap': {
          // swap(i, j) 同样使用 C 物理下标（0 起始）。
          if (kind !== 'array') {
            errors.push(CommandParser._kindErr(c.line, kind));
          } else {
            const ia = c.index;
            const ib = c.index2;
            if (ia < 0 || ia >= len || ib < 0 || ib >= len) {
              errors.push(CommandParser._err(c.line, `错误：数组下标越界（当前长度 ${len}，下标 0..${len - 1}）`, `Error: index out of range (length ${len}, index 0..${len - 1})`));
            } else if (ia !== ib) {
              s = structure.planSwap(ia + 1, ib + 1, len);
            }
          }
          break;
        }
        case 'search': {
          if (kind === 'binarytree') {
            const err = structure.searchError(ctx);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planSearch(c.value, ctx, simMem);
          } else if (kind === 'linked') {
            const err = structure.searchError(len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planSearch(c.value, len, simMem, ctx);
          } else {
            s = structure.planSearch(c.value, len, simMem, front);
          }
          break;
        }
        case 'push': {
          if (kind === 'binarytree') {
            errors.push(CommandParser._kindErr(c.line, kind));
          } else if (kind === 'queue') {
            const err = structure.enqueueError(len, front, simMem);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planEnqueue(c.value, len, simMem, front);
          } else if (kind === 'linked') {
            const err = structure.insertError(len + 1, len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planInsert(len + 1, c.value, len, simMem, ctx); // 表尾追加
          } else if (len >= structure.capacity) {
            errors.push(CommandParser._err(c.line, `无法入栈/入队（已满 ${len}/${structure.capacity}）`, `Cannot push (structure full, ${len}/${structure.capacity})`));
          } else if (kind === 'stack') {
            s = structure.planPush(c.value, len, simMem);
          } else {
            s = structure.planInsert(len + 1, c.value, len, simMem); // 第 len+1 个位置 = 表尾追加
          }
          break;
        }
        case 'pop': {
          if (kind === 'binarytree') {
            errors.push(CommandParser._kindErr(c.line, kind));
          } else if (len <= 0) {
            errors.push(CommandParser._err(c.line, `当前结构为空，无法操作`, `The structure is empty`));
          } else if (kind === 'stack') {
            s = structure.planPop(len, simMem);
          } else if (kind === 'queue') {
            s = structure.planDequeue(len, simMem, front);
          } else if (kind === 'linked') {
            const err = structure.deleteError(len, len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planDelete(len, len, simMem, ctx); // 删除表尾
          } else {
            s = structure.planDelete(len, len, simMem); // 删除第 len 个 = 表尾
          }
          break;
        }
        case 'enqueue': {
          if (kind !== 'queue') {
            errors.push(CommandParser._err(c.line, '错误：当前结构不是队列，不能使用 enqueue', 'Error: the current structure is not a queue, enqueue is unavailable'));
          } else {
            const err = structure.enqueueError(len, front, simMem);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planEnqueue(c.value, len, simMem, front);
          }
          break;
        }
        case 'dequeue': {
          if (kind !== 'queue') {
            errors.push(CommandParser._err(c.line, '错误：当前结构不是队列，不能使用 dequeue', 'Error: the current structure is not a queue, dequeue is unavailable'));
          } else {
            const err = structure.dequeueError(len);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planDequeue(len, simMem, front);
          }
          break;
        }
        case 'insertLeft':
        case 'insertRight': {
          if (kind !== 'binarytree') {
            errors.push(CommandParser._err(c.line, '错误：当前结构不是二叉树，不能插入孩子结点', 'Error: the current structure is not a binary tree; cannot attach a child'));
          } else {
            const side = c.type === 'insertLeft' ? 'L' : 'R';
            const err = structure.insertError(c.index, side, ctx);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else s = structure.planInsert(c.index, side, c.value, ctx);
          }
          break;
        }
        case 'preorder':
        case 'inorder':
        case 'postorder':
        case 'levelorder': {
          if (kind !== 'binarytree') {
            errors.push(CommandParser._err(c.line, '错误：当前结构不是二叉树，不能进行树遍历', 'Error: the current structure is not a binary tree; traversal is unavailable'));
          } else {
            const err = structure.traversalError(ctx);
            if (err) errors.push(CommandParser._errMsg(c.line, err));
            else {
              const method = 'plan' + c.type.charAt(0).toUpperCase() + c.type.slice(1);
              s = structure[method](ctx, simMem);
            }
          }
          break;
        }
        default:
          break;
      }

      // 一旦出错就停止后续指令（后续状态无法再可靠地规划）。
      if (errors.length > before) break;

      // 给该指令产生的所有步骤打上代码行号，供 Animator 高亮。
      for (const st of s) st.line = c.line;

      // 向前推进“模拟状态”，供下一行规划使用。
      CommandParser._simulate(sim, s);
      len = kind === 'linked'
        ? ctx.chain.length
        : kind === 'binarytree'
          ? ctx.byIndex.size
          : CommandParser._nextLen(c.type, len);

      // 队列出队（dequeue / pop / remove(0)）后队头也要跟着推进，保持规划期状态一致。
      const dequeued =
        c.type === 'dequeue' || c.type === 'pop' || (c.type === 'remove' && c.index === 0);
      if (kind === 'queue' && dequeued && s.length) {
        front = (front + 1) % structure.capacity;
      }

      steps.push(...s);
    }

    return { steps, errors };
  }

  /** 根据步骤序列更新模拟内存（与 Animator 执行时对内存的改动保持一致）。 */
  static _simulate(sim, steps) {
    for (const st of steps) {
      if (st.type === STEP.SET_VALUE) {
        sim.set(st.payload.block, st.payload.value);
      } else if (st.type === STEP.MOVE_VALUE) {
        const v = sim.has(st.payload.from) ? sim.get(st.payload.from) : null;
        sim.delete(st.payload.from);
        if (v !== null) sim.set(st.payload.to, v);
        else sim.delete(st.payload.to);
      } else if (st.type === STEP.CLEAR_VALUE) {
        sim.delete(st.payload.block);
      } else if (st.type === STEP.SWAP) {
        const { a, b } = st.payload;
        const va = sim.has(a) ? sim.get(a) : null;
        const vb = sim.has(b) ? sim.get(b) : null;
        if (vb !== null) sim.set(a, vb); else sim.delete(a);
        if (va !== null) sim.set(b, va); else sim.delete(b);
      }
    }
  }

  /** 根据指令类型推进“当前长度”。 */
  static _nextLen(type, len) {
    if (type === 'insert' || type === 'push' || type === 'enqueue') return len + 1;
    if (type === 'remove' || type === 'pop' || type === 'dequeue') return len - 1;
    return len;
  }

  /** 构造“当前结构不支持该指令”的错误记录。 */
  static _kindErr(line, kind) {
    if (kind === 'stack') {
      return CommandParser._err(
        line,
        '错误：栈只能操作栈顶，请使用 push / pop / search',
        'Error: a stack only supports push / pop / search'
      );
    }
    if (kind === 'linked') {
      return CommandParser._err(
        line,
        '错误：链表请使用 insert / remove / search（push / pop 等价于表尾插入 / 删除）',
        'Error: use insert / remove / search on a linked list (push / pop mean append / delete at the tail)'
      );
    }
    if (kind === 'binarytree') {
      return CommandParser._err(
        line,
        '错误：二叉树请使用 insertLeft / insertRight / remove / search / preorder / inorder / postorder / levelorder',
        'Error: use insertLeft / insertRight / remove / search / preorder / inorder / postorder / levelorder on a binary tree'
      );
    }
    return CommandParser._err(
      line,
      '错误：队列只能操作队头与队尾，请使用 enqueue / dequeue / search',
      'Error: a queue only supports enqueue / dequeue / search'
    );
  }

  /** 构造一个错误记录。 */
  static _err(line, zh, en) {
    return { line, msg: { zh, en } };
  }

  /** 构造错误记录（消息由结构层提供，保证 UI 与代码模式文案一致）。 */
  static _errMsg(line, msg) {
    return { line, msg };
  }
}