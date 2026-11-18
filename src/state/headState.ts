import { create } from 'zustand';

interface HeadState {
  /** 0 = intact head … 4 = bare brain. Layer i fades out between i and i+1. */
  peel: number;
  cutaway: boolean;
  set: (p: Partial<HeadState>) => void;
}

export const useHead = create<HeadState>((set) => ({
  peel: 0,
  cutaway: true,
  set: (p) => set(p),
}));
