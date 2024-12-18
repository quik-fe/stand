import { produce } from "./produce";
import { Store } from "./Store";
import { SetupFn, Middleware, Selector, SelectorPath, UseStore } from "./types";

const isServer = typeof window === "undefined";

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
        // NOTE: never effects when run in server
        if (isServer) return () => {};

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
          // NOTE: Because it is a weakmap, I don't think it needs to be deleted, and the effect update should not affect the deps array.
          // envs.delete(symbol);
        };
      });

      const state = getState();
      if (selector === undefined) {
        return new Proxy(state, {
          get(target, p, receiver) {
            if (!isServer) {
              deps.add(p as any);
            }
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
    // NOTE: Symbols cannot be used as weak map keys in Node.js, so empty objects are used
    const [symbol] = useState(() => ({}));
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
      // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/rules-of-hooks
      createEffect: (x) => useEffect(x, []),
      symbol,
    };
  });

const React = (globalThis as any).React;
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
