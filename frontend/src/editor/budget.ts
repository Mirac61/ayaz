declare const __CI__: boolean;

// Frame budgets are tuned on the dev machine; shared CI runners (macOS VMs, headless WebKit) are 2x slower and noisy.
export const budget = (ms: number) => (__CI__ ? ms * 3 : ms);
