import { Patch, produce } from "./produce";

type Listener<State> = (state: State, patches: Patch[]) => void;

class Store<T> {
  private state = {} as T;
  private listeners = new Set<Listener<T>>();

  setState(partial: Partial<T> | ((x: T) => Partial<T>)) {
    const patches = [] as Patch[];
    if (typeof partial === "function") {
      const { patches: newPatches, result } = produce(this.state, partial);
      patches.push(...newPatches);
      this.state = {
        ...this.state,
        ...result,
      };
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

/**
 * Binds a state and effect manager to a React component.
 *
 * @param {() => { createState: (x: any) => [() => any, (x: any) => any]; createEffect: (eff: () => () => any) => any; symbol: symbol; }} build - A function that builds the state and effect manager.
 * @return {function} A function that creates a state and effect manager.
 */
export function bind(
  build: () => {
    createState: (x: any) => [() => any, (x: any) => any];
    createEffect: (eff: () => () => any) => any;
    symbol: symbol;
  }
) {
  /**
   * Creates a store with the given setup and middlewares.
   *
   * @param {SetupFn<State>} setup - The function that sets up the initial state and effects.
   * @param {Middleware<State>[]} middlewares - The array of middlewares to apply to the store.
   * @return {UseStore<State>} The store object with the specified setup and middlewares.
   */
  function create<State>(
    setup: SetupFn<State>,
    ...middlewares: Middleware<State>[]
  ) {
    const store = new Store<State>();

    // NOTE: ensure setter getter for middleware
    const handlers = {
      setter: store.setState.bind(store),
      getter: store.getState.bind(store),
      setter_ref: (x: any) => handlers.setter(x),
      getter_ref: () => handlers.getter(),
    };
    // setup before middleware setup
    store.setState(setup(handlers.setter_ref, handlers.getter_ref));

    [handlers.setter, handlers.getter] = middlewares.reduce(
      ([set, get], middleware) => middleware(set, get),
      [handlers.setter, handlers.getter]
    );

    const envs = new WeakMap<
      symbol,
      {
        deps: Set<string>;
      }
    >();

    /**
     * A function that manages state and effects based on the provided selector.
     *
     * @param {Selector<State, T> | SelectorPath<State>} selector - Optional selector for state management.
     * @return {any} The updated state based on the selector.
     */
    function useStore<T>(selector?: Selector<State, T> | SelectorPath<State>) {
      const select = (): any => {
        const state = handlers.getter_ref();
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
            ? produce(handlers.getter_ref(), selector).deps
            : selector
            ? [selector as any]
            : [];
        deps_arr.forEach((x) => deps.add(x));

        const update = () => {
          const selected = select();
          setState(selected);
        };

        const unsubscribe = store.subscribe((state, patches) => {
          const isChanged = patches.some(({ path }) =>
            Array.from(deps).some((dep) => path.startsWith(dep as any))
          );
          if (!isChanged) return;
          update();
        });

        update();
        return () => {
          unsubscribe();
          envs.delete(symbol);
        };
      });

      const state = getState();
      if (selector === undefined) {
        return new Proxy(state, {
          get(target, p, receiver) {
            deps.add(p as any);
            return Reflect.get(target, p, receiver);
          },
        });
      }
      return state;
    }

    useStore.set = handlers.setter_ref;
    useStore.get = handlers.getter_ref;
    useStore.subscribe = store.subscribe.bind(store);
    useStore._store = store;

    return useStore as UseStore<State>;
  }

  return create;
}

const NONE = Symbol();
/**
 * Binds the given React library to create a state and effect manager.
 *
 * @param {any} react - The React library to bind.
 * @return {function} A function that creates a state and effect manager.
 */
export const bindReact = (react: any) =>
  bind(() => {
    const { useState, useEffect, useRef } = react;
    const stateRef = useRef(NONE);
    // NOTE: if based boolean, it may cause the rendering to be merged by fiber.
    const markWorkInProgressReceivedUpdate = useState({})[1];
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
            markWorkInProgressReceivedUpdate({});
          },
        ];
      },
      createEffect: (x) => useEffect(x, []),
      symbol,
    };
  });

const React = (window as any).React;
/**
 * Creates a store with the given setup and middlewares.
 *
 * @param {SetupFn<State>} setup - The function that sets up the initial state and effects.
 * @param {Middleware<State>[]} middlewares - The array of middlewares to apply to the store.
 * @return {UseStore<State>} The store object with the specified setup and middlewares.
 */
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
