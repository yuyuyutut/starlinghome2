/**
 * lib/iosKeyboard.ts — iOS 真机 PWA 布局适配
 *
 * 解决两个经典 iOS 问题：
 *
 * 1. 底部 UI 被遮挡：
 *    viewport-fit=cover 让内容延伸到安全区，100vh 在 PWA 中等于整个物理屏幕
 *    高度（含 Home Indicator 区域），底部导航/输入栏会被挤到屏幕外。
 *
 * 2. 键盘弹出后界面卡住：
 *    100vh 是固定值，键盘弹出后可视区域缩小，但 App 容器高度不变，
 *    底部 UI 被键盘盖住；iOS 自动上移聚焦元素后又因 overflow:hidden 卡死。
 *
 * 方案：用 visualViewport.height 动态同步 #root 高度。
 *   - 键盘未弹出：visualViewport.height = 屏幕高度（含安全区），底部 UI 用
 *     env(safe-area-inset-bottom) 避开 Home Indicator；
 *   - 键盘弹出：visualViewport.height = 屏幕高度 - 键盘高度，App 自动收缩，
 *     底部 UI 自然落在键盘上方，不再被遮挡也不会卡住。
 *
 * 同时保留输入框滚动定位：focusin 后延迟把聚焦输入框滚进可视区，
 * 绝不用 scrollIntoView（会连带滚动文档，与 iOS 键盘平移形成正反馈）。
 */
import { useEffect } from "react";

/** 把聚焦的输入框滚进最近可滚动祖先容器的可视区 */
function scrollActiveIntoView() {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      const elRect = el.getBoundingClientRect();
      const boxRect = node.getBoundingClientRect();
      const pad = 16;
      if (elRect.bottom > boxRect.bottom - pad) {
        node.scrollTop += elRect.bottom - (boxRect.bottom - pad);
      } else if (elRect.top < boxRect.top + pad) {
        node.scrollTop -= boxRect.top + pad - elRect.top;
      }
      return;
    }
    node = node.parentElement;
  }
}

export function useIosKeyboardPolish() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.getElementById("root");
    let raf = 0;

    /** 同步 #root 高度为 visualViewport.height，并写入 CSS 变量供组件使用 */
    const syncHeight = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = vv ? vv.height : window.innerHeight;
        if (root) root.style.height = `${h}px`;
        document.documentElement.style.setProperty("--app-height", `${h}px`);
      });
    };

    /** 输入框滚动定位（防抖） */
    let scrollTimer: number | undefined;
    const scheduleScroll = (delay: number) => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(scrollActiveIntoView, delay);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) scheduleScroll(350);
    };

    const onViewportChange = () => {
      syncHeight();
      scheduleScroll(120);
    };

    // 初始同步一次
    syncHeight();

    document.addEventListener("focusin", onFocusIn);
    vv?.addEventListener("resize", onViewportChange);
    vv?.addEventListener("scroll", onViewportChange);
    window.addEventListener("orientationchange", syncHeight);
    window.addEventListener("resize", syncHeight);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      vv?.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("orientationchange", syncHeight);
      window.removeEventListener("resize", syncHeight);
      cancelAnimationFrame(raf);
      window.clearTimeout(scrollTimer);
    };
  }, []);
}
