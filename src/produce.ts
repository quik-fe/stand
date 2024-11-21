let tracking = true;
let triggering = true;
let packing = true;
const tracking_stack: boolean[] = [];
const triggering_stack: boolean[] = [];
const packing_stack: boolean[] = [];
const pauseTracking = () => {
  tracking_stack.push(tracking);
  tracking = false;
};
const enableTracking = () => {
  tracking_stack.push(tracking);
  tracking = true;
};
const resumeTracking = () => {
  tracking = tracking_stack.pop() ?? true;
  return tracking;
};
const resetTracking = () => {
  tracking = true;
  tracking_stack.length = 0;
};
const pauseTriggering = () => {
  triggering_stack.push(triggering);
  triggering = false;
};
const enableTriggering = () => {
  triggering_stack.push(triggering);
  triggering = true;
};
const resumeTriggering = () => {
  triggering = triggering_stack.pop() ?? true;
  return triggering;
};
const resetTriggering = () => {
  triggering = true;
  triggering_stack.length = 0;
};
const pausePacking = () => {
  packing_stack.push(packing);
  packing = false;
};
const enablePacking = () => {
  packing_stack.push(packing);
  packing = true;
};
const resumePacking = () => {
  packing = packing_stack.pop() ?? true;
  return packing;
};
const resetPacking = () => {
  packing = true;
  packing_stack.length = 0;
};

export const handlers = {
  pauseTracking,
  enableTracking,
  resumeTracking,
  resetTracking,

  pauseTriggering,
  enableTriggering,
  resumeTriggering,
  resetTriggering,

  pausePacking,
  enablePacking,
  resumePacking,
  resetPacking,
};

const proxy2raw = new WeakMap<any, any>();
export const toRaw = <T>(x: T): T => {
  while (proxy2raw.has(x)) {
    x = proxy2raw.get(x)!;
  }
  return x;
};
export const isProxy = (x: any): boolean => proxy2raw.has(x);

export type Patch = { path: string; value: any };
export function produce<State, Ret>(
  baseObject: State,
  operation: (x: State) => Ret,
  patchCallback?: (patch: Patch) => any
) {
  const patches = [] as Patch[];
  const deps = new Set<string>();
  function createProxy(
    target: any,
    path = "",
    topDeps: Set<string> = deps
  ): any {
    return new Proxy(target, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        const dep = `${path}${path ? "." : ""}${String(property)}`;
        if (tracking) topDeps.add(dep);
        if (packing) {
          if (value && typeof value === "object" && value !== null) {
            const proxy = createProxy(value, dep, topDeps);
            proxy2raw.set(proxy, value);
            return proxy;
          }
        }
        return value;
      },
      set(target, property, value) {
        const ret = Reflect.set(target, property, value);
        if (!triggering) {
          return ret;
        }
        const fullPath = `${path}${path ? "." : ""}${String(property)}`;
        const patch = { path: fullPath, value };
        patches.push(patch);
        patchCallback?.(patch);
        return ret;
      },
    });
  }
  const proxy = createProxy(baseObject);
  const result = operation(proxy);
  return {
    patches,
    deps: Array.from(deps),
    result,
  };
}
