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

// C 风格“右移插入”：for(...) { arr[i] = arr[i-1]; } 后接 arr[k] = v
// 例如教材里的插入算法，识别后映射为 insert(arr, k, v)，触发元素后移动画。
const INSERT_PATTERN = /for\s*\([^)]*\)\s*\{[\s\S]*?arr\[i\]\s*=\s*arr\[i\s*-\s*1\];[\s\S]*?\}\s*arr\[(\d+)\]\s*=\s*(-?\d+);/g;

// C 风格“左移删除”：for (int i = k; ...) { arr[i] = arr[i+1]; }
// 映射为 remove(arr, k)，触发元素前移动画。
const DELETE_PATTERN = /for\s*\([^)]*?\bi\s*=\s*(\d+)[^)]*\)\s*\{[\s\S]*?arr\[i\]\s*=\s*arr\[i\s*\+\s*1\];[\s\S]*?\}/g;

// C 风格“临时变量交换”：t = arr[a]; arr[a] = arr[b]; arr[b] = t;
// 映射为 swap(a, b)，触发两个内存块的交换动画。仅识别最标准的写法。
const SWAP_PATTERN = /(?:int\s+)?(\w+)\s*=\s*arr\[(\d+)\]\s*;[\s\S]*?arr\[(\d+)\]\s*=\s*arr\[(\d+)\]\s*;[\s\S]*?arr\[(\d+)\]\s*=\s*\1\s*;/g;

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

    // 先做 C 风格“数组移位”模式识别：把 for 循环实现的后移插入 / 前移删除
    // 转换成 insert / remove 指令，随后由下面的白名单统一提取。
    let text = String(code || '');
    // 先识别“临时变量交换”，避免被后续逐行规则把三行交换拆散。
    text = text.replace(SWAP_PATTERN, (m, tmp, i1, i2, j1, i3) =>
      i1 === i2 && i3 === j1 && i1 !== j1 ? `swap(${i1}, ${j1});` : m
    );
    text = text.replace(INSERT_PATTERN, (m, k, v) => `insert(arr, ${k}, ${v});`);
    text = text.replace(DELETE_PATTERN, (m, k) => `remove(arr, ${k});`);

    const lines = text.split(/\r?\n/);

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
  // ---- 简写模式：省略变量名 ----
  // set(i, v) -> arr[i] = v;
  {
    exact: true,
    re: /^set\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `arr[${m[1]}] = ${m[2]};`,
  },
  // swap(i, j)
  {
    exact: true,
    re: /^swap\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `swap(${m[1]}, ${m[2]});`,
  },
  // insert(i, v)
  {
    exact: true,
    re: /^insert\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `insert(arr, ${m[1]}, ${m[2]});`,
  },
  // insert(v)
  {
    exact: true,
    re: /^insert\s*\(\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `insert(arr, ${m[1]});`,
  },
  // remove(i) / delete(i)
  {
    exact: true,
    re: /^(?:remove|delete)\s*\(\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `remove(arr, ${m[1]});`,
  },
  // search(v)
  {
    exact: true,
    re: /^search\s*\(\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `search(arr, ${m[1]});`,
  },
  // push(v)
  {
    exact: true,
    re: /^push\s*\(\s*(-?\d+)\s*\)$/i,
    fmt: (m) => `push(arr, ${m[1]});`,
  },
  // pop()
  {
    exact: true,
    re: /^pop\s*\(\s*\)$/i,
    fmt: () => `pop(arr);`,
  },
  // 链表节点创建：malloc 或 new 关键字 -> create_node()
  {
    exact: false,
    re: /\bmalloc\s*\(|\bnew\b/i,
    fmt: () => `create_node();`,
  },
];