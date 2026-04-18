import {
  uiPreferencesSchema,
  type UiPreferences,
} from "~/schemas/ui-preferences";
import { createStore } from "./create-store";

type UiPreferencesActions = {
  setDensity: (density: UiPreferences["density"]) => void;
  toggleAnimations: () => void;
};

type UiPreferencesStore = UiPreferences & UiPreferencesActions;

const initialState: UiPreferences = {
  density: "comfortable",
  revealAnimations: true,
};

export const useUiPreferences = createStore<UiPreferencesStore>(
  "ui-preferences",
  (set) => ({
    ...initialState,
    setDensity: (density) => set({ density }),
    toggleAnimations: () =>
      set((state) => ({ revealAnimations: !state.revealAnimations })),
  }),
  {
    persist: {
      key: "foundation-archive:ui-preferences",
      schema: uiPreferencesSchema,
      version: 1,
    },
  },
);
