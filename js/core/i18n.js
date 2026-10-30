/**
 * i18n.js — 轻量双语支持模块。
 *
 * 界面中静态文案使用 HTML 里的 `.zh` / `.en` 两个 class 配合 CSS 切换；
 * 动态文案（如执行日志的步骤说明）由各数据结构模块以 `{ zh, en }` 结构提供，
 * 这里统一用 `t()` 按当前语言取值。
 */
export const i18n = {
  lang: 'zh',

  /** 切换语言，并同步切换 body 上的语言 class，触发 CSS 显示/隐藏。 */
  setLang(lang) {
    this.lang = lang;
    document.body.classList.remove('lang-zh', 'lang-en');
    document.body.classList.add('lang-' + lang);
  },

  /**
   * 取当前语言文本。
   * @param {string | {zh: string, en: string}} text 纯字符串或 {zh, en} 结构
   * @returns {string}
   */
  t(text) {
    if (!text) return '';
    if (typeof text === 'string') return text;
    return text[this.lang] || text.zh || '';
  },
};