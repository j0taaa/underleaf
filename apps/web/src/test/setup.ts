import "@testing-library/jest-dom/vitest";

window.scrollTo = () => undefined;

class TestDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  multiplySelf() {
    return this;
  }

  preMultiplySelf() {
    return this;
  }

  translateSelf() {
    return this;
  }

  scaleSelf() {
    return this;
  }
}

window.DOMMatrix = TestDOMMatrix as unknown as typeof DOMMatrix;
globalThis.DOMMatrix = TestDOMMatrix as unknown as typeof DOMMatrix;
