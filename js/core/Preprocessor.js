/**
 * Preprocessor.js — 代码清洗与提取器。
 *
 * 用户从别处粘贴一段真实 C/C++ 代码（带 #include / printf / for 等）时，
 * 本模块负责“洗掉”无关内容，只把“能用于演示的数据结构操作”抽取出来，
 * 规范成系统可识别的纯净伪代码，再替换回输入框。
 *
 * 白名单（会被提取）：
 *   int arr[10] = {1, 2};   -> int arr[10] = {1, 2};
 *   arr[0] = 5;             -> arr[0] = 5;
 *   insert(arr, 1, 5);      -> insert(arr, 1, 5);
 *   insert(arr, 5);         -> insert(arr, 5);
 *   remove/delete(arr, 0)   -> remove(arr, 0);
 *   search(arr, 5)          -> search(arr, 5);
 *   push(s, 5) / pop(s)     -> push(arr, 5) / pop(arr);
 *   malloc / new 关键字     -> create_node();   （链表节点，暂不可演示，运行阶段会被忽略）
 *
 * 黑名单（静默忽略）：#include、printf、cout、for、while、if、return 等一切未命中的内容。
 */
const IDENT = '[a-zA-Z_]\\w*';

export class Preprocessor {
  /** 单次提取最多保留的指令条数（防御超大输入导致页面卡死）。 */
  static MAX_EXTRACT = 100;

  /**
   * 提取代码中的数据结构指令。
   * @param {string} code
   * @returns {{output:string, count:number, ignoredCount:number, truncated:boolean}}
   */
  static extract(code) {
    const out = [];
    let count = 0;
    let ignoredCount = 0;
    let truncated = false;

    const lines = String(code || '').split(/\r?\n/);

    outer:
    for (const line of lines) {
      // 去掉 // 注释
      let l = line;
      const c = l.indexOf('//');
      if (c >= 0) l = l.slice(0, c);

      // 一行可含多条语句（; 分隔）
      for (const raw of l.split(';')) {
        const stmt = raw.trim();
        if (!stmt) continue;

        const clean = Preprocessor._match(stmt);
        if (clean) {
          out.push(clean);
          count++;
        } else {
          ignoredCount++;
        }

        if (count >= Preprocessor.MAX_EXTRACT) {
          truncated = true;
          break outer;
        }
      }
    }

    return { output: out.join('\n'), count, ignoredCount, truncated };
  }

  /** 对单条语句做白名单匹配，命中则返回规范化后的伪代码，否则返回 null。 */
  static _match(stmt) {
    for (const p of Preprocessor._PATTERNS) {
      if (p.exact) {
        const m = stmt.match(p.re);
        if (m) return p.fmt(m);
      } else {
        if (p.re.test(stmt)) return p.fmt();
      }
    }
    return null;
  }
}

Preprocessor._PATTERNS = [
  // int arr[N] = {...} 或 int arr[N];
  {
    exact: true,
    re: new RegExp('^int\\s+' + IDENT + '\\s*\\[\\s*(\\d+)\\s*\\]\\s*(?:=\\s*\\{([^{}]*)\\})?$', 'i'),
    fmt: (m) => {
      if (m[2] === undefined) return `int arr[${m[1]}];`;
      const vals = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      return `int arr[${m[1]}] = {${vals.join(', ')}};`;
    },
  },
  // insert(arr, i, v)
  {
    exact: true,
    re: new RegExp('^insert\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'),
    fmt: (m) => `insert(arr, ${m[1]}, ${m[2]});`,
  },
  // insert(arr, v)  -> 末尾追加
  {
    exact: true,
    re: new RegExp('^insert\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'),
    fmt: (m) => `insert(arr, ${m[1]});`,
  },
  // remove(arr, i) / delete(arr, i)
  {
    exact: true,
    re: new RegExp('^(?:remove|delete)\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'),
    fmt: (m) => `remove(arr, ${m[1]});`,
  },
  // search(arr, v)
  {
    exact: true,
    re: new RegExp('^search\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'),
    fmt: (m) => `search(arr, ${m[1]});`,
  },
  // push(s, v)
  {
    exact: true,
    re: new RegExp('^push\\s*\\(\\s*' + IDENT + '\\s*,\\s*(-?\\d+)\\s*\\)$', 'i'),
    fmt: (m) => `push(arr, ${m[1]});`,
  },
  // pop(s)
  {
    exact: true,
    re: new RegExp('^pop\\s*\\(\\s*' + IDENT + '\\s*\\)$', 'i'),
    fmt: () => `pop(arr);`,
  },
  // arr[i] = v
  {
    exact: true,
    re: new RegExp('^(' + IDENT + ')\\s*\\[\\s*(-?\\d+)\\s*\\]\\s*=\\s*(-?\\d+)$', 'i'),
    fmt: (m) => `arr[${m[2]}] = ${m[3]};`,
  },
  // 链表节点创建：malloc 或 new 关键字 -> create_node()
  {
    exact: false,
    re: /\bmalloc\s*\(|\bnew\b/i,
    fmt: () => `create_node();`,
  },
];