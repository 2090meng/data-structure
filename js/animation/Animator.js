/**
 * Animator.js — 动画引擎 + 播放控制。
 *
 * 消费数据结构层产出的 Step 数组，逐步推进内存状态并驱动渲染动画。
 * 提供三种播放方式：
 *   loadSteps(steps)  装载一个操作的所有步骤
 *   stepOnce()        单步执行（执行队列中的下一步）
 *   playAll()         自动播放（顺序执行直到队列清空）
 *   reset()           中断并清空队列
 */
import { STEP } from '../core/Step.js';

export class Animator {
  /**
   * @param {import('../core/MemoryModel.js').MemoryModel} memory 内存模型
   * @param {import('../render/Renderer.js').Renderer} renderer 渲染器
   * @param {(text:{zh:string,en:string}|null)=>void} onLog 日志回调（接收原始双语文本）
   * @param {(line:number|null)=>void} onLine 代码行回调（执行到带 line 的步骤时触发，用于高亮代码行）
   */
  constructor(memory, renderer, onLog = () => {}, onLine = () => {}) {
    this.memory = memory;
    this.renderer = renderer;
    this.onLog = onLog;
    this.onLine = onLine;
    this.queue = [];          // 待执行步骤队列
    this.playing = false;     // 是否处于自动播放中
    this.generation = 0;      // 用于中断重置：reset 后递增，使进行中的异步执行作废
    this._currentLine = null; // 当前高亮的代码行号（1 起始）
    this.speed = 400;         // 速度对应的毫秒延迟（0 = 瞬间），由 setSpeed 调整
  }

  /** 设置播放速度（毫秒，0 表示瞬间）。 */
  setSpeed(ms) {
    this.speed = Number(ms) || 0;
  }

  /** 是否还有待执行步骤或正在自动播放。 */
  isBusy() {
    return this.playing || this.queue.length > 0;
  }

  /** 装载一个操作的步骤序列（不立即执行）。 */
  loadSteps(steps) {
    this.queue = steps.slice();
    this.renderer.render(this.memory);
  }

  /** 中断当前播放并清空队列。 */
  reset() {
    this.playing = false;
    this.queue = [];
    this.generation++;
    if (this._currentLine !== null) {
      this._currentLine = null;
      this.onLine(null);
    }
  }

  /** 自动播放：顺序执行全部步骤。 */
  async playAll() {
    if (this.playing) return;
    this.playing = true;
    const gen = this.generation;
    while (this.queue.length) {
      if (gen !== this.generation) break; // 已被重置
      const step = this.queue.shift();
      await this._execute(step, gen);
      if (gen !== this.generation) break;
      await sleep(this.speed);
    }
    this.playing = false;
  }

  /** 单步执行：只执行队列中的下一步。返回是否真的执行了一步。 */
  async stepOnce() {
    if (this.playing || this.queue.length === 0) return false;
    const gen = this.generation;
    const step = this.queue.shift();
    await this._execute(step, gen);
    return gen === this.generation;
  }

  /** 执行单个步骤（含动画与日志）。 */
  async _execute(step, gen) {
    // 代码行高亮：当步骤携带 line 且与当前不同时触发
    if (typeof step.line === 'number' && step.line !== this._currentLine) {
      this._currentLine = step.line;
      this.onLine(step.line);
    }

    // 输出日志
    if (step.text) this.onLog(step.text);

    switch (step.type) {
      case STEP.HIGHLIGHT: {
        const b = this.memory.getBlock(step.payload.block);
        if (b) b.highlight = true;
        this.renderer.render(this.memory);
        break;
      }

      case STEP.UNHIGHLIGHT: {
        const b = this.memory.getBlock(step.payload.block);
        if (b) b.highlight = false;
        this.renderer.render(this.memory);
        break;
      }

      // 值从 from 移动到 to：先“取出”值并播放飞行动画，落地后写入目标。
      case STEP.MOVE_VALUE: {
        const { from, to } = step.payload;
        const value = this.memory.read(from);
        this.memory.clear(from); // 先清空源块，避免与漂浮文本重叠显示
        this.renderer.render(this.memory);
        await this.renderer.animateFloat(from, to, value, this.speed);
        if (gen !== this.generation) return;
        this.memory.write(to, value);
        this.renderer.render(this.memory);
        break;
      }

      // 写入值：高亮目标块 -> 写入 -> 短暂停留 -> 取消高亮。
      case STEP.SET_VALUE: {
        const { block, value } = step.payload;
        const b = this.memory.getBlock(block);
        if (b) b.highlight = true;
        this.memory.write(block, value);
        this.renderer.render(this.memory);
        await sleep(this.speed);
        if (gen !== this.generation) return;
        if (b) b.highlight = false;
        this.renderer.render(this.memory);
        break;
      }

      // 清空值：高亮 -> 清空 -> 取消高亮。
      case STEP.CLEAR_VALUE: {
        const { block } = step.payload;
        const b = this.memory.getBlock(block);
        if (b) b.highlight = true;
        this.renderer.render(this.memory);
        await sleep(this.speed);
        if (gen !== this.generation) return;
        this.memory.clear(block);
        if (b) b.highlight = false;
        this.renderer.render(this.memory);
        break;
      }

      // 查找比较：高亮当前块做一次闪烁。
      case STEP.COMPARE: {
        const { block } = step.payload;
        const b = this.memory.getBlock(block);
        if (b) b.highlight = true;
        this.renderer.render(this.memory);
        await sleep(this.speed);
        if (gen !== this.generation) return;
        if (b) b.highlight = false;
        this.renderer.render(this.memory);
        break;
      }

      // 查找结果：命中则绿色标记。
      case STEP.RESULT: {
        const { block, found } = step.payload;
        if (block) {
          const b = this.memory.getBlock(block);
          if (b) b.hit = found;
        }
        this.renderer.render(this.memory);
        break;
      }

      // 结构元数据更新（如数组 length++/--），在动画执行到该步时生效。
      case STEP.META: {
        if (typeof step.payload.run === 'function') step.payload.run();
        break;
      }

      default:
        break;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}