import { produce, handlers, toRaw, Patch, isProxy } from "../src/main";

describe("produce function tests", () => {
  beforeEach(() => {
    // Reset the handlers' states before each test
    handlers.resetTracking();
    handlers.resetTriggering();
    handlers.resetPacking();
  });

  it("should track dependencies correctly", () => {
    const state = { a: { b: 1 }, c: 2 };
    const { deps } = produce(state, (proxy) => {
      return proxy.a.b + proxy.c;
    });
    expect(deps).toEqual(["a", "a.b", "c"]);
  });

  it("should apply patches when triggering is enabled", () => {
    const state = { a: { b: 1 } };
    const patches: Patch[] = [];
    produce(
      state,
      (proxy) => {
        proxy.a.b = 2;
      },
      (patch) => patches.push(patch)
    );
    expect(patches).toEqual([{ path: "a.b", value: 2 }]);
  });

  it("should not apply patches when triggering is disabled", () => {
    handlers.pauseTriggering();
    const state = { a: { b: 1 } };
    const patches: Patch[] = [];
    produce(
      state,
      (proxy) => {
        proxy.a.b = 2;
      },
      (patch) => patches.push(patch)
    );
    expect(patches).toEqual([]);
  });

  it("should not create proxies when packing is disabled", () => {
    handlers.pausePacking();
    const state = { a: { b: 1 } };
    const { result } = produce(state, (proxy) => {
      proxy.a.b = 2;
      return proxy.a;
    });
    expect(isProxy(result)).toBe(false);
  });

  it("should pop and restore previous states with resume handlers", () => {
    handlers.pauseTracking();
    handlers.pauseTriggering();
    expect(handlers.resumeTracking()).toBe(true); // Resume to default true
    expect(handlers.resumeTriggering()).toBe(true); // Resume to default true
  });

  it("should allow nested operations with proper tracking", () => {
    const state = { a: { b: 1, c: 2 } };
    const { patches, deps } = produce(state, (proxy) => {
      proxy.a.b = 2;
      proxy.a.c = 3;
    });
    expect(deps).toEqual(["a"]);
    expect(patches).toEqual([
      { path: "a.b", value: 2 },
      { path: "a.c", value: 3 },
    ]);
  });

  it("should correctly resolve the raw value from proxy", () => {
    const state = { a: { b: 1 } };
    const { result } = produce(state, (proxy) => {
      return proxy.a;
    });
    const raw = toRaw(result);
    expect(isProxy(result)).toBe(true);
    expect(isProxy(raw)).toBe(false);
  });
});
