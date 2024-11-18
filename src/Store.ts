import { Patch, produce } from "./produce";

export type Listener<State> = (state: State, patches: Patch[]) => void;
export class Store<T> {
  private state = {} as T;
  private listeners = new Set<Listener<T>>();

  setState(partial: Partial<T> | ((x: T) => Partial<T>)) {
    const patches = [] as Patch[];
    if (typeof partial === "function") {
      const { patches: newPatches, result } = produce(this.state, partial);
      patches.push(...newPatches);
      if (result && this.state !== result) {
        this.state = {
          ...this.state,
          ...result,
        };
        patches.push(
          ...Object.entries(result).map(([path, value]) => ({
            path,
            value,
          }))
        );
      }
    } else {
      Object.entries(partial).forEach(([k, v]) =>
        patches.push({
          path: k,
          value: v,
        })
      );
      this.state = {
        ...this.state,
        ...partial,
      };
    }
    this.listeners.forEach((listener) => listener(this.state, patches));
  }

  getState() {
    return this.state;
  }

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.state = {} as T;
    this.listeners.clear();
  }
}
