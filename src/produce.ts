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
        topDeps.add(dep);
        if (value && typeof value === "object" && value !== null) {
          return createProxy(value, dep, topDeps);
        }
        return value;
      },
      set(target, property, value) {
        Reflect.set(target, property, value);
        const fullPath = `${path}${path ? "." : ""}${String(property)}`;
        const patch = { path: fullPath, value };
        patches.push(patch);
        patchCallback?.(patch);
        return true;
      },
    });
  }

  const proxy = createProxy(baseObject);
  const result = operation(proxy);
  return { patches, deps: Array.from(deps), result };
}
