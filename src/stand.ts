import { Patch, produce } from "./produce";

type Listener<State> = (state: State, patches: Patch[]) => void;

class Store<T> {
  private state = {} as T;
  private listeners = new Set<Listener<T>>();

  setState(partial: Partial<T> | ((x: T) => Partial<T>)) {
    const patches = [] as Patch[];
    if (typeof partial === "function") {
      const { patches: newPatches } = produce(this.state, partial);
      patches.push(...newPatches);
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

type SetFn<T> = (x: Partial<T> | ((x: T) => Partial<T>)) => void;
type GetFn<T> = () => T;

type SetupFn<T> = (set: SetFn<T>, get: GetFn<T>) => T;
type Middleware<T> = (set: SetFn<T>, get: GetFn<T>) => [typeof set, typeof get];
type Selector<T, S = T> = (x: T) => S;
// type SelectorPath<T> = keyof T | (string & NonNullable<unknown>);
type SelectorPath<T> = keyof T;

type UseStore<State> = {
  <T>(selector: Selector<State, T>): T;
  <T>(selector: Selector<State>): State;
  <P extends SelectorPath<State>>(selector: P): State[P];
  (): State;
  set: SetFn<State>;
  get: GetFn<State>;
  subscribe: (listener: Listener<State>) => () => void;
  _store: Store<State>;
};

export function bind(
  build: () => {
    createState: (x: any) => [() => any, (x: any) => any];
    createEffect: (eff: () => () => any) => any;
    symbol: symbol;
  }
) {
  return function create<State>(
    setup: SetupFn<State>,
    ...middlewares: Middleware<State>[]
  ) {
    const store = new Store<State>();

    const [set, get] = middlewares.reduce(
      ([set, get], middleware) => middleware(set, get),
      [store.setState.bind(store), store.getState.bind(store)]
    );

    store.setState(setup(set, get));

    const envs = new WeakMap<
      symbol,
      {
        deps: Set<string>;
      }
    >();

    function useStore<T>(selector?: Selector<State, T> | SelectorPath<State>) {
      const select = (): any => {
        const state = get();
        return typeof selector === "function"
          ? selector(state)
          : selector
          ? // TODO: support lodash.get like
            state[selector]
          : state;
      };
      const { createEffect, createState, symbol } = build();
      const [getState, setState] = createState(select);

      if (!envs.has(symbol)) envs.set(symbol, { deps: new Set() });
      const { deps } = envs.get(symbol)!;

      createEffect(() => {
        const deps_arr =
          typeof selector === "function"
            ? produce(get(), selector).deps
            : selector
            ? [selector as any]
            : [];
        deps_arr.forEach((x) => deps.add(x));

        const unsubscribe = store.subscribe((state, patches) => {
          const isChanged = patches.some(({ path }) =>
            Array.from(deps).some((dep) => path.startsWith(dep as any))
          );
          if (!isChanged) return;
          const selected = select();
          setState(selected);
        });
        return () => {
          unsubscribe();
          envs.delete(symbol);
        };
      });

      const state = getState();
      return new Proxy(state, {
        get(target, p, receiver) {
          deps.add(p as any);
          return Reflect.get(target, p, receiver);
        },
      });
    }

    useStore.set = set;
    useStore.get = get;
    useStore.subscribe = store.subscribe.bind(store);
    useStore._store = store;

    return useStore as UseStore<State>;
  };
}

const NONE = Symbol();
export const bindReact = (react: any) =>
  bind(() => {
    const { useState, useEffect, useRef } = react;
    const stateRef = useRef(NONE);
    const emit = useState()[1];
    const [symbol] = useState(() => Symbol());
    return {
      createState: (state: any) => {
        if (stateRef.current === NONE) {
          if (typeof state === "function") {
            stateRef.current = state();
          } else {
            stateRef.current = state;
          }
        }
        return [
          () => stateRef.current,
          (x) => {
            stateRef.current = x;
            emit((x: any) => !x);
          },
        ];
      },
      createEffect: (x) => useEffect(x, []),
      symbol,
    };
  });

const React = (window as any).React;
export const create = React
  ? bindReact(React)
  : () => {
      throw new Error("no React");
    };

// test code
// const logger: Middleware<any> = (set, get) => {
//   return [
//     (x: any) => {
//       set(x);
//       console.log(`set: `, x);
//     },
//     () => {
//       const state = get();
//       console.log(`get: `, state);
//       return state;
//     },
//   ];
// };
// const useStore = create<{
//   count: number;
//   inc: () => void;
//   dec: () => void;
// }>(
//   (set, get) => ({
//     count: 0,
//     inc: () => set((state) => ({ count: state.count + 1 })),
//     dec: () => set((state) => ({ count: state.count - 1 })),
//   }),
//   logger
// );

// const { count } = useStore();
