/**
 * Step.js — “步骤(Step)”契约定义。
 *
 * 这是【数据结构逻辑层】与【动画/渲染层】之间的接口：
 *   - 数据结构层（如 ArrayDS）只负责“规划”，产出一个 Step 数组，不直接碰画面；
 *   - 动画层（Animator）逐条消费 Step，驱动内存状态与动画推进；
 *   - 渲染层（Renderer）根据内存状态绘制画面。
 *
 * 每个 Step 结构：
 *   {
 *     type:    STEP 中的一个常量，表示这一步要做什么；
 *     payload: 携带该步所需的具体数据（块 id、值、目标等）；
 *     text:    { zh, en } 用于日志区显示的步骤说明。
 *   }
 */
export const STEP = {
  ALLOCATE: 'allocate',          // 分配内存块（构造结构时批量出现）
  HIGHLIGHT: 'highlight',        // 高亮一个块
  UNHIGHLIGHT: 'unhighlight',    // 取消高亮一个块
  MOVE_VALUE: 'move_value',      // 值从 payload.from 移动到 payload.to
  SWAP: 'swap',                  // 交换 payload.a 与 payload.b 两个块的值
  SET_VALUE: 'set_value',        // 向 payload.block 写入 payload.value
  CLEAR_VALUE: 'clear_value',    // 清空 payload.block 的值
  COMPARE: 'compare',            // 查找比较：高亮 payload.block 与 payload.value 对比
  RESULT: 'result',              // 查找结果：payload.found 表示是否命中
  META: 'meta',                  // 结构元数据更新（如数组 length），payload.run 为回调
};

/**
 * 生成一个 Step 对象。
 * @param {string} type  步骤类型（见 STEP）
 * @param {object} payload 该步数据
 * @param {{zh:string,en:string}|null} text 日志文本
 */
export function makeStep(type, payload = {}, text = null) {
  return { type, payload, text };
}