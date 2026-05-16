import type { StateCreator } from "zustand";
import type { AppStore, LessonSlice } from "@/store/types";

export const createLessonSlice: StateCreator<AppStore, [], [], LessonSlice> = (set) => ({
  lessons: {
    activeLessonId: null,
    activeStep: 0,
  },
  startLesson: (id) => set({ lessons: { activeLessonId: id, activeStep: 0 } }),
  setLessonStep: (step) =>
    set((s) => (s.lessons.activeLessonId != null ? { lessons: { ...s.lessons, activeStep: step } } : s)),
  nextLessonStep: () =>
    set((s) =>
      s.lessons.activeLessonId != null
        ? { lessons: { ...s.lessons, activeStep: s.lessons.activeStep + 1 } }
        : s,
    ),
  prevLessonStep: () =>
    set((s) =>
      s.lessons.activeLessonId != null
        ? { lessons: { ...s.lessons, activeStep: Math.max(0, s.lessons.activeStep - 1) } }
        : s,
    ),
  endLesson: () => set({ lessons: { activeLessonId: null, activeStep: 0 } }),
});
