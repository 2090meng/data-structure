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
   * @param {(message:string)=>void} onError 执行出错时的回调（接收错误消息）
   * @param {(busy:boolean)=>void} onBusyChange 忙碌状态变化回调（用于锁定/解锁按钮）
   */
  constructor(memory, renderer, onLog = () => {}, onLine = () => {}, onError = () => {}, onBusyChange = () => {}) {
    this.memory = memory;
    this.renderer = renderer;
    this.onLog = onLog;
    this.onLine = onLine;
    this.onError = onError;
    this.onBusyChange = onBusyChange;
    this.queue = [];          // 待执行步骤队列
    this.playing = false;     // 是否处于自动播放中
    this.generation = 0;      // 用于中断重置：reset 后递增，使进行中的异步执行作废
    this._currentLine = null; // 当前高亮的代码行号（1 起始）
    this._busy = false;       // 是否正在执行动画（用于锁定按钮）
    this._rollback = null;    // 装载步骤前的内存快照，动画出错时回滚
    this.history = [];        // 已执行步骤的历史（含执行前快照），用于“上一步”回退
    this.speed = 400;         // 速度对应的毫秒延迟（0 = 瞬间），由 setSpeed 调整
  }

  /** 设置播放速度（毫秒，0 表示瞬间）。 */
  setSpeed(ms) {
    this.speed = Number(ms) || 0;
  }

  /** 内部：切换“忙碌”状态并通知外部（仅状态变化时触发）。 */
  _setBusy(busy) {
    const b = !!busy;
    if (b !== this._busy) {
      this._busy = b;
      this.onBusyChange(b);
    }
  }

  /** 内部：回滚到装载步骤前的内存快照（用于动画出错时恢复）。 */
  _recover() {
    if (this._rollback) {
      try {
        this.memory.restore(this._rollback);
        this.renderer.render(this.memory);
      } catch (e) {
        /* 回滚失败也不抛出，避免雪上加霜。 */
      }
    }
  }

  /** 是否还有待执行步骤或正在自动播放。 */
  isBusy() {
    return this.playing || this.queue.length > 0;
  }

  /** 装载一个操作的步骤序列（不立即执行）。同时保存当前内存快照，供出错时回滚。 */
  loadSteps(steps) {
    this.queue = steps.slice();
    this.history = [];
    this._rollback = this.memory.snapshot();
    this.renderer.render(this.memory);
  }

  /** 中断当前播放并清空队列。 */
  reset() {
    this.playing = false;
    this.queue = [];
    this.history = [];
    this.generation++;
    this._rollback = null; // 清掉旧快照，避免 resetAll 后回滚到已废弃的内存
    if (this._currentLine !== null) {
      this._currentLine = null;
      this.onLine(null);
    }
    this._setBusy(false);
  }

  /** 自动播放：顺序执行全部步骤。遇到异常时通过 onError 上报并停止。 */
  async playAll() {
    if (this.playing) return;
    this.playing = true;
    this._setBusy(true);
    const gen = this.generation;
    try {
      while (this.queue.length) {
        if (gen !== this.generation) break; // 已被重置
        const step = this.queue.shift();
        const snap = this.memory.snapshot();
        await this._execute(step, gen);
        if (gen !== this.generation) break;
        this.history.push({ step, memory: snap });
        await sleep(this.speed);
      }
    } catch (e) {
      this._recover();
      this.onError(e && e.message ? e.message : String(e));
    } finally {
      this.playing = false;
      this._setBusy(false);
    }
  }

  /** 单步执行：只执行队列中的下一步。返回是否真的执行了一步。 */
  async stepOnce() {
    if (this.playing || this.queue.length === 0) return false;
    const gen = this.generation;
    const step = this.queue.shift();
    const snap = this.memory.snapshot();
    this._setBusy(true);
    try {
      await this._execute(step, gen);
      if (gen === this.generation) this.history.push({ step, memory: snap });
    } catch (e) {
      this._recover();
      this.onError(e && e.message ? e.message : String(e));
    } finally {
      this._setBusy(false);
    }
    return gen === this.generation;
  }

  /** 回退一步：恢复到该步骤执行前的内存状态，并把它放回队列。 */
  stepBack() {
    if (this.playing || this._busy || this.history.length === 0) return false;
    const rec = this.history.pop();
    try {
      this.memory.restore(rec.memory);
      // META 改的是结构自身状态（如数组 length），内存快照不包含，需反向执行还原。
      if (rec.step.type === STEP.META && typeof rec.step.payload.undo === 'function') {
        rec.step.payload.undo();
      }
      this.queue.unshift(rec.step);
      this.renderer.render(this.memory);
      // 代码行高亮回到被撤销步骤对应的行；无行号则清除。
      this._currentLine = typeof rec.step.line === 'number' ? rec.step.line : null;
      this.onLine(this._currentLine);
    } catch (e) {
      this.onError(e && e.message ? e.message : String(e));
    }
    return true;
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

      // 交换两个块的值：同时高亮两块 -> 交换 -> 停留 -> 取消高亮。
      case STEP.SWAP: {
        const { a, b } = step.payload;
        const ba = this.memory.getBlock(a);
        const bb = this.memory.getBlock(b);
        if (ba) ba.highlight = true;
        if (bb) bb.highlight = true;
        this.renderer.render(this.memory);
        await sleep(this.speed);
        if (gen !== this.generation) return;
        const va = this.memory.read(a);
        const vb = this.memory.read(b);
        this.memory.write(a, vb);
        this.memory.write(b, va);
        this.renderer.render(this.memory);
        await sleep(this.speed);
        if (gen !== this.generation) return;
        if (ba) ba.highlight = false;
        if (bb) bb.highlight = false;
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

      // 结构元数据更新（如数组 length、栈顶 top、队列 front），在动画执行到该步时生效。
      // 这些元数据会影响布局与指针标注（如栈的 top、队列的 front），因此需要重绘。
      case STEP.META: {
        if (typeof step.payload.run === 'function') step.payload.run();
        this.renderer.render(this.memory);
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