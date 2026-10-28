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
 *   push(stack, 10);             栈/队列入队 —— 映射为“数组末尾追加”
 *   pop(stack);                  栈/队列出队 —— 映射为“删除数组末尾元素”
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

    // insert(arr, v) —— 两个参数（末尾追加）
    m = stmt.match(new RegExp('^insert\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'));
    if (m) return { type: 'insert', index: null, value: +m[1], line };

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

    return null;
  }

  /**
   * 把解析结果展开成 Step 列表。
   * 连续规划多行时，用 len 追踪“当前长度”、用 sim 模拟元素值，
   * 保证各行的 move/set 目标与实际执行一致；遇到非法指令则停止并记录错误。
   *
   * @param {import('../structures/ArrayDS.js').ArrayDS} array
   * @param {Array<{type:string,index:number|null,value:number,line:number}>} commands
   * @param {{capacity:number,values:number[],line:number}|null} declaration
   * @returns {{steps:Array<object>, errors:Array<{line:number,msg:{zh:string,en:string}}>}}
   */
  static buildSteps(array, commands, declaration = null) {
    const steps = [];
    const errors = [];

    // 用块 id -> value 模拟当前元素值，避免连续规划时读到“旧”内存。
    const sim = new Map();
    const simMem = { read: (id) => (sim.has(id) ? sim.get(id) : null) };
    let len = 0;

    // 1) 声明初始化：把 { ... } 里的值依次写入槽位。
    if (declaration) {
      declaration.values.forEach((v, i) => {
        const st = makeStep(STEP.SET_VALUE, { block: array.slots[i].id, value: v }, {
          zh: `初始化 arr[${i}] = ${v}`,
          en: `Initialize arr[${i}] = ${v}`,
        });
        st.line = declaration.line;
        steps.push(st);
        sim.set(array.slots[i].id, v);
      });
      len = declaration.values.length;
    }

    // 2) 逐条指令展开。
    for (const c of commands) {
      const before = errors.length;
      let s = [];

      switch (c.type) {
        case 'set': {
          if (c.index < 0 || c.index >= len) {
            errors.push(CommandParser._err(c.line, `错误：数组下标 ${c.index} 越界（当前长度 ${len}）`, `Error: index ${c.index} out of range (length ${len})`));
          } else {
            s = array.planSet(c.index, c.value, len);
          }
          break;
        }
        case 'insert': {
          const idx = c.index === null ? len : c.index;
          if (idx < 0 || idx > len || len >= array.capacity) {
            errors.push(CommandParser._err(c.line, `错误：数组下标 ${idx} 越界或数组已满`, `Error: index ${idx} out of range or array full`));
          } else {
            s = array.planInsert(idx, c.value, len, simMem);
          }
          break;
        }
        case 'remove': {
          if (len === 0) {
            errors.push(CommandParser._err(c.line, `当前结构为空，无法操作`, `The structure is empty`));
          } else if (c.index < 0 || c.index >= len) {
            errors.push(CommandParser._err(c.line, `错误：数组下标 ${c.index} 越界（当前长度 ${len}）`, `Error: index ${c.index} out of range (length ${len})`));
          } else {
            s = array.planDelete(c.index, len, simMem);
          }
          break;
        }
        case 'swap': {
          const ia = c.index;
          const ib = c.index2;
          if (ia < 0 || ia >= len || ib < 0 || ib >= len) {
            errors.push(CommandParser._err(c.line, `错误：数组下标越界（当前长度 ${len}）`, `Error: index out of range (length ${len})`));
          } else if (ia !== ib) {
            s = array.planSwap(ia, ib, len);
          }
          break;
        }
        case 'search': {
          s = array.planSearch(c.value, len, simMem);
          break;
        }
        case 'push': {
          if (len >= array.capacity) {
            errors.push(CommandParser._err(c.line, `无法入栈/入队（数组已满 ${len}）`, `Cannot push (array full, length ${len})`));
          } else {
            s = array.planInsert(len, c.value, len, simMem);
          }
          break;
        }
        case 'pop': {
          if (len <= 0) {
            errors.push(CommandParser._err(c.line, `当前结构为空，无法操作`, `The structure is empty`));
          } else {
            s = array.planDelete(len - 1, len, simMem);
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
      len = CommandParser._nextLen(c.type, len);

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
    if (type === 'insert' || type === 'push') return len + 1;
    if (type === 'remove' || type === 'pop') return len - 1;
    return len;
  }

  /** 构造一个错误记录。 */
  static _err(line, zh, en) {
    return { line, msg: { zh, en } };
  }
}