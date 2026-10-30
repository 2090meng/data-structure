import { STEP } from '../../js/core/Step.js';

/** 在无渲染环境下执行 Step，只演进内存与结构状态（与 Animator 保持一致）。 */
export function applySteps(mem, steps) {
  for (const s of steps) {
    const p = s.payload || {};
    switch (s.type) {
      case STEP.MOVE_VALUE: {
        const v = mem.read(p.from);
        mem.clear(p.from);
        mem.write(p.to, v);
        break;
      }
      case STEP.SET_VALUE:
        mem.write(p.block, p.value);
        break;
      case STEP.CLEAR_VALUE:
        mem.clear(p.block);
        break;
      case STEP.SWAP: {
        const va = mem.read(p.a);
        const vb = mem.read(p.b);
        mem.write(p.a, vb);
        mem.write(p.b, va);
        break;
      }
      case STEP.META:
        if (typeof p.run === 'function') p.run();
        break;
      default:
        break;
    }
  }
}
