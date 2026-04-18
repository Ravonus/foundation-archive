import { create, type StateCreator } from "zustand";
import {
  devtools,
  persist,
  subscribeWithSelector,
  createJSONStorage,
} from "zustand/middleware";
import { type ZodType } from "zod";

type PersistConfig<T> = {
  key: string;
  schema: ZodType<Partial<T>>;
  version?: number;
};

type Options<T> = {
  persist?: PersistConfig<T>;
};

const isDev = process.env.NODE_ENV === "development";

function validatedMerge<T extends object>(
  schema: ZodType<Partial<T>>,
  persistedState: unknown,
  currentState: T,
): T {
  const parsed = schema.safeParse(persistedState);
  if (parsed.success) {
    return { ...currentState, ...parsed.data };
  }
  console.warn(
    "[create-store] persisted state failed schema validation; using initial state.",
    parsed.error.flatten(),
  );
  return currentState;
}

function buildPlain<T extends object>(
  name: string,
  initializer: StateCreator<T, [], []>,
) {
  const subscribed = subscribeWithSelector(initializer);
  return isDev
    ? create<T>()(devtools(subscribed, { name }))
    : create<T>()(subscribed);
}

function buildPersisted<T extends object>(
  name: string,
  initializer: StateCreator<T, [], []>,
  config: PersistConfig<T>,
) {
  const persisted = persist<T>(initializer, {
    name: config.key,
    version: config.version ?? 0,
    storage: createJSONStorage<T>(() => localStorage),
    merge: (persistedState, currentState) =>
      validatedMerge(config.schema, persistedState, currentState),
  });
  const subscribed = subscribeWithSelector(persisted);
  return isDev
    ? create<T>()(devtools(subscribed, { name }))
    : create<T>()(subscribed);
}

export function createStore<T extends object>(
  name: string,
  initializer: StateCreator<T, [], []>,
): ReturnType<typeof buildPlain<T>>;
export function createStore<T extends object>(
  name: string,
  initializer: StateCreator<T, [], []>,
  options: { persist: PersistConfig<T> },
): ReturnType<typeof buildPersisted<T>>;
export function createStore<T extends object>(
  name: string,
  initializer: StateCreator<T, [], []>,
  options?: Options<T>,
) {
  return options?.persist
    ? buildPersisted(name, initializer, options.persist)
    : buildPlain(name, initializer);
}

export type { PersistConfig, Options };
