let tracking = true;
let triggering = true;
const tracking_stack: boolean[] = [];
const triggering_stack: boolean[] = [];
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
};

export const handlers = {
  pauseTracking,
  enableTracking,
  resumeTracking,
  pauseTriggering,
  enableTriggering,
  resumeTriggering,
};

export type Patch = { path: string; value: any };
export function produce<State, Ret>(
  baseObject: any,
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
        if (value && typeof value === "object" && value !== null) {
          return createProxy(value, dep, topDeps);
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
