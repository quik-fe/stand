# stand

zustand-like

# usage

```tsx
import { bindReact } from "@quik-fe/stand";
import * as React from "react";

const create = bindReact(React);

// middleware
const logger = (set, get) => {
  return [
    (x) => {
      set(x);
      console.log(`set: `, x);
    },
    () => {
      const state = get();
      console.log(`get: `, state);
      return state;
    },
  ];
};

const useAppStore = create<{
  counter: {
    count1: number;
  };
  inc: () => void;
  dec: () => void;
}>(
  (set, get) => ({
    counter: {
      count1: 1,
    },
    inc: () =>
      // immer style is working
      set((state) => {
        state.counter.count1 += 1;
        return state;
      }),
    dec: () =>
      // update style is working
      set({ counter: { count1: get().counter.count1 - 1 } }),
  }),
  logger,
  /** More middleware can be placed here  */
);

const App = () => {
  // no selector (auto-selector) is working
  const {
    counter: { count1 },
  } = useAppStore();
  return <button onClick={useAppStore.get().inc}>count: {count1}</button>;
};
```

# license
MIT
