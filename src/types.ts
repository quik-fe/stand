import { Listener, Store } from "./Store";

type SetFn<T> = (x: Partial<T> | ((x: T) => Partial<T>)) => void;
type GetFn<T> = () => T;
export type SetupFn<T> = (set: SetFn<T>, get: GetFn<T>) => T;
export type Middleware<T> = (
  set: SetFn<T>,
  get: GetFn<T>
) => [typeof set, typeof get];
export type Selector<T, S = T> = (x: T) => S;
// type SelectorPath<T> = keyof T | (string & NonNullable<unknown>);
export type SelectorPath<T> = keyof T;
export type UseStore<State> = {
  <T>(selector: Selector<State, T>): T;
  <T>(selector: Selector<State>): State;
  <P extends SelectorPath<State>>(selector: P): State[P];
  (): State;
  set: SetFn<State>;
  get: GetFn<State>;
  subscribe: (listener: Listener<State>) => () => void;
  _store: Store<State>;
};
