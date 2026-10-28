/**
 * CommandParser.js — 代码驱动模式的“简单指令解析器”。
 *
 * 不是真正的编译器：把用户输入的伪代码逐行解析成若干条指令，
 * 再借助数据结构层的 plan* 方法，逐条展开成可交给 Animator 播放的 Step 序列。
 *
 * 支持的语法（大小写不敏感，`//` 为注释，语句可用 `;` 分隔，也支持一行一条）：
 *   arr[i] = v;             修改下标 i 的值为 v（i 在 [0, length-1]）
 *   insert(arr, i, v);      在下标 i 插入 v（i 在 [0, length]）
 *   insert(arr, v);         在末尾追加 v
 *   remove(arr, i);         删除下标 i（i 在 [0, length-1]）
 *   delete(arr, i);         同上
 *   search(arr, v);         查找 v
 *
 * 每个指令最终会带一个 line 字段（1 起始的代码行号），Animator 据此高亮代码行。
 */
import { STEP } from './Step.js';

export class CommandParser {
  /**
   * 解析整段代码。
   * @param {string} code
   * @returns {{commands: Array<{type:string,index:number|null,value:number,line:number}>, errors: Array<{line:number,text:string}>}}
   */
  static parse(code) {
    const commands = [];
    const errors = [];
    const lines = String(code || '').split(/\r?\n/);

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
        const cmd = CommandParser._parseStmt(stmt, lineNo);
        if (cmd) commands.push(cmd);
        else errors.push({ line: lineNo, text: stmt });
      }
    }

    return { commands, errors };
  }

  /** 解析单条语句。返回指令对象，无法识别时返回 null。 */
  static _parseStmt(stmt, line) {
    let m;

    // arr[i] = v
    m = stmt.match(/^arr\s*\[\s*(-?\d+)\s*\]\s*=\s*(-?\d+)$/i);
    if (m) return { type: 'set', index: +m[1], value: +m[2], line };

    // insert(arr, i, v)
    m = stmt.match(/^insert\s*\(\s*arr\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'insert', index: +m[1], value: +m[2], line };

    // insert(arr, v) —— 末尾追加
    m = stmt.match(/^insert\s*\(\s*arr\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'insert', index: null, value: +m[1], line };

    // remove(arr, i) / delete(arr, i)
    m = stmt.match(/^(?:remove|delete)\s*\(\s*arr\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'remove', index: +m[1], line };

    // search(arr, v)
    m = stmt.match(/^search\s*\(\s*arr\s*,\s*(-?\d+)\s*\)$/i);
    if (m) return { type: 'search', index: null, value: +m[1], line };

    return null;
  }

  /**
   * 把解析出的指令序列展开成 Step 列表。
   * 连续规划多行时，用 len 追踪“当前长度”、用 sim 模拟元素值，
   * 保证各行的 move/set 目标与实际执行一致；遇到非法指令则停止并记录错误。
   *
   * @param {import('../structures/ArrayDS.js').ArrayDS} array
   * @param {Array<{type:string,index:number|null,value:number,line:number}>} commands
   * @returns {{steps:Array<object>, errors:Array<{line:number,msg:{zh:string,en:string}}>}}
   */
  static buildSteps(array, commands) {
    const steps = [];
    const errors = [];
    let len = array.length;

    // 用块 id -> value 模拟当前元素值，避免连续规划时读到“旧”内存。
    const sim = new Map();
    for (const b of array.slots) {
      if (b.value !== null) sim.set(b.id, b.value);
    }
    const simMem = { read: (id) => (sim.has(id) ? sim.get(id) : null) };

    for (const c of commands) {
      const before = errors.length;
      let s = [];

      switch (c.type) {
        case 'set': {
          if (c.index < 0 || c.index >= len) {
            errors.push(CommandParser._err(c.line, `下标 ${c.index} 越界（当前长度 ${len}）`, `Index ${c.index} out of range (length ${len})`));
          } else {
            s = array.planSet(c.index, c.value, len);
          }
          break;
        }
        case 'insert': {
          const idx = c.index === null ? len : c.index;
          if (idx < 0 || idx > len || len >= array.capacity) {
            errors.push(CommandParser._err(c.line, `无法在下标 ${idx} 插入（下标越界或数组已满）`, `Cannot insert at index ${idx} (out of range or array full)`));
          } else {
            s = array.planInsert(idx, c.value, len, simMem);
          }
          break;
        }
        case 'remove': {
          if (c.index < 0 || c.index >= len) {
            errors.push(CommandParser._err(c.line, `下标 ${c.index} 越界（当前长度 ${len}）`, `Index ${c.index} out of range (length ${len})`));
          } else {
            s = array.planDelete(c.index, len, simMem);
          }
          break;
        }
        case 'search': {
          s = array.planSearch(c.value, len, simMem);
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
      }
    }
  }

  /** 根据指令类型推进“当前长度”。 */
  static _nextLen(type, len) {
    if (type === 'insert') return len + 1;
    if (type === 'remove') return len - 1;
    return len;
  }

  /** 构造一个错误记录。 */
  static _err(line, zh, en) {
    return { line, msg: { zh, en } };
  }
}