export function createRectCache(element) {
  let rect = element.getBoundingClientRect();

  const refresh = () => {
    rect = element.getBoundingClientRect();
  };

  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("scroll", refresh, { passive: true, capture: true });

  return {
    get current() {
      return rect;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("scroll", refresh, { capture: true });
    },
  };
}
