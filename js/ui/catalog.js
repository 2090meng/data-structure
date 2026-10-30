/**
 * catalog.js — 结构目录与静态配置。
 *
 * 新增数据结构时，主要在这里补充默认容量、操作项、示例代码和一句话说明；
 * 控制器（main.js）只消费这些配置，不再内嵌大段文案。
 */

// 速度档位（毫秒）→ 与 HTML 中 speed-select 的 option value 对应
export const SPEED_MAP = { slow: 800, normal: 400, fast: 100, instant: 0 };

// 各结构的默认容量
export const DEFAULT_CAPACITY = { array: 8, linked: 8, stack: 8, queue: 6, binarytree: 15 };

// 各结构支持的操作项（value -> 中英标签）
export const OPS = {
  array: [
    ['insert', '插入 Insert'],
    ['delete', '删除 Delete'],
    ['set', '修改/赋值 Set'],
    ['search', '查找 Search'],
  ],
  linked: [
    ['insert', '插入 Insert'],
    ['insertHead', '头插法 Head Insert'],
    ['insertTail', '尾插法 Tail Insert'],
    ['delete', '删除 Delete'],
    ['search', '查找 Search'],
  ],
  stack: [
    ['push', '入栈 Push'],
    ['pop', '出栈 Pop'],
    ['peek', '取栈顶 Peek'],
    ['search', '查找 Search'],
  ],
  queue: [
    ['enqueue', '入队 Enqueue'],
    ['dequeue', '出队 Dequeue'],
    ['front', '查看队头 Front'],
    ['search', '查找 Search'],
  ],
  binarytree: [
    ['insertLeft', '插入左孩子 Insert Left'],
    ['insertRight', '插入右孩子 Insert Right'],
    ['delete', '删除子树 Delete'],
    ['search', '查找 Search'],
    ['preorder', '先序遍历 Preorder'],
    ['inorder', '中序遍历 Inorder'],
    ['postorder', '后序遍历 Postorder'],
    ['levelorder', '层次遍历 Level-order'],
  ],
};

// 各结构的示例代码
export const SAMPLES = {
  array: `#include <stdio.h>

int main() {
    // 1. 初始化一个容量为 8 的数组，目前有 5 个有效元素
    int arr[8] = {10, 20, 30, 40, 50};
    int length = 5;
    int capacity = 8;

    // 操作 1：在下标 2（即第 3 个位置）插入元素 99
    for (int i = length; i > 2; i--) {
        arr[i] = arr[i - 1]; // 从后往前挪，腾出空间
    }
    arr[2] = 99;
    length++; // 长度加 1

    // 操作 2：删除第 2 个元素（下标 1，即 20）
    for (int i = 1; i < length - 1; i++) {
        arr[i] = arr[i + 1]; // 从前往后挪，覆盖被删除的元素
    }
    length--; // 长度减 1

    // 打印最终结果（打印语句会被忽略）
    printf("最终数组内容: ");
    for (int i = 0; i < length; i++) {
        printf("%d ", arr[i]);
    }
    printf("\\n");

    return 0;
}`,
  linked: `#include <stdio.h>

int main() {
    // 单链表：带头结点，每个结点单独 malloc，地址不连续
    int L[8] = {10, 20, 30};   // 尾插法依次建立 10 -> 20 -> 30

    insertHead(L, 5);   // 头插法：s->next = L->next; L->next = s;  链表变 5 -> 10 -> 20 -> 30
    insertTail(L, 99);  // 尾插法：p 走到表尾；s->next = NULL; p->next = s;
    insert(L, 3, 88);   // 在第 3 个位置前插入 88
    remove(L, 2);       // 删除第 2 个结点：p->next = q->next; free(q);
    search(L, 30);      // p = p->next 逐个比较

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  stack: `#include <stdio.h>

int main() {
    // 顺序栈：MaxSize = 8，S.top 指向下一个空位，后进先出 LIFO
    int st[8] = {10, 20, 30};

    push(st, 40);   // S.data[S.top] = 40; S.top++（栈顶指针上移）
    push(st, 50);   // S.data[S.top] = 50; S.top++
    pop(st);        // S.top--; e = S.data[S.top]（弹出 50）
    push(st, 60);   // S.data[S.top] = 60; S.top++

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  queue: `#include <stdio.h>

int main() {
    // 循环队列：MaxSize = 7，牺牲一个单元判满，最多存 6 个元素
    int q[7] = {10, 20, 30};

    enqueue(q, 40);  // 入队：Q.data[Q.rear] = 40; Q.rear++
    dequeue(q);      // 出队：e = Q.data[Q.front]; Q.front++
    enqueue(q, 50);  // 入队 50
    enqueue(q, 60);  // 入队 60

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
  binarytree: `#include <stdio.h>

int main() {
    // 二叉链表：每个结点单独 malloc，lchild / rchild 分别指向左右孩子
    // 初始化按层序序列建树：根 = 10，左孩子 20、右孩子 30，依此类推
    int T[15] = {10, 20, 30, 40, 50, 60, 70};

    insertLeft(T, 4, 80);   // 第 4 号结点（40）挂左孩子，成为第 8 号
    insertRight(T, 4, 90);  // 第 4 号结点（40）挂右孩子，成为第 9 号
    preorder(T);            // 先序遍历：根 → 左 → 右
    inorder(T);             // 中序遍历：左 → 根 → 右
    postorder(T);           // 后序遍历：左 → 右 → 根
    levelorder(T);          // 层次遍历：逐层从左到右
    search(T, 50);          // 先序查找
    remove(T, 2);           // 删除以第 2 号结点为根的整棵子树

    printf("演示结束（打印语句会被忽略）\\n");
    return 0;
}`,
};

// 每个结构在舞台标题下的一句话说明（新增结构时只需在这里补一条）
export const STRUCT_NOTE = {
  array: {
    zh: '顺序存储：地址连续，插入删除需要移动元素',
    en: 'Sequential storage: contiguous addresses, insert/delete shifts elements',
  },
  linked: {
    zh: '链式存储：结点分散，靠 next 指针串成一条链',
    en: 'Linked storage: scattered nodes chained by next pointers',
  },
  stack: {
    zh: '后进先出：top 指向栈顶的下一个空位',
    en: 'LIFO: top points to the next free slot',
  },
  queue: {
    zh: '先进先出：循环队列，牺牲一个单元区分队空/队满',
    en: 'FIFO: circular queue, one slot sacrificed to distinguish empty/full',
  },
  binarytree: {
    zh: '二叉链表：lchild / rchild 指针，按层序编号定位结点',
    en: 'Linked binary tree: lchild/rchild pointers, level-order node numbering',
  },
};
