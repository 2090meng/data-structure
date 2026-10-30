/**
 * device.js — 设备形态（电脑端 / 手机端）与手机端底部面板。
 *
 * 只负责设备选择页、形态切换与手机端面板开合；
 * 绘制、抽屉、日志/代码面板通过参数注入，避免反向依赖 main.js。
 */
export function initDeviceUI({ setDrawer, showDockPanel, onChange }) {
  const entryGate = document.getElementById('entry');
  const deviceBtn = document.getElementById('device-btn');
  const sidebar = document.getElementById('sidebar');
  const mobileBar = document.getElementById('mobile-bar');
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const dock = document.getElementById('dock');

  let activeSheet = null;   // 当前展开的底部面板：'ops' | 'log' | 'code'

  /** 收起所有手机端底部面板。 */
  function closeSheets() {
    if (!sidebar || !dock) return;
    sidebar.classList.remove('is-open');
    dock.classList.remove('is-open');
    sheetBackdrop.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    if (mobileBar) {
      for (const btn of mobileBar.querySelectorAll('.mobile-bar__btn')) {
        btn.classList.remove('is-active');
      }
    }
    activeSheet = null;
  }

  /** 展开指定底部面板；再次点同一个按钮则收起。 */
  function openSheet(name) {
    if (name === 'help') {
      closeSheets();
      setDrawer(true);
      return;
    }
    if (activeSheet === name) {
      closeSheets();
      return;
    }
    closeSheets();

    if (name === 'ops') {
      sidebar.classList.add('is-open');
      sidebar.scrollTop = 0;
    } else {
      showDockPanel(name === 'log' ? 'log' : 'code');
      dock.classList.add('is-open');
    }

    document.body.classList.add('sheet-open');
    sheetBackdrop.classList.add('is-open');
    activeSheet = name;
    for (const btn of mobileBar.querySelectorAll('.mobile-bar__btn')) {
      btn.classList.toggle('is-active', btn.dataset.sheet === name);
    }
  }

  /**
   * 切换电脑 / 手机形态：手机端使用单列布局，操作栏与日志/代码区变为底部面板。
   * 每次进入都会重新询问，不写入 localStorage。
   */
  function setDevice(mode) {
    const mobile = mode === 'mobile';
    document.body.classList.toggle('mode-mobile', mobile);
    document.body.classList.toggle('mode-desktop', !mobile);
    entryGate.classList.remove('is-open');
    setDrawer(false);
    closeSheets();
    if (dock) dock.style.height = '';   // 清掉桌面端拖拽留下的内联高度
    if (typeof onChange === 'function') onChange(mobile);
  }

  if (entryGate) {
    entryGate.addEventListener('click', (event) => {
      const option = event.target.closest('[data-mode]');
      if (option) setDevice(option.dataset.mode);
    });
  }

  // 右上角「切换设备」重新打开选择页
  if (deviceBtn) {
    deviceBtn.addEventListener('click', () => {
      setDrawer(false);
      closeSheets();
      entryGate.classList.add('is-open');
    });
  }

  // 手机端底部操作栏
  if (mobileBar) {
    mobileBar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-sheet]');
      if (btn) openSheet(btn.dataset.sheet);
    });
  }

  // 点遮罩收起底部面板
  if (sheetBackdrop) {
    sheetBackdrop.addEventListener('click', () => closeSheets());
  }

  return { closeSheets, setDevice, openSheet };
}
