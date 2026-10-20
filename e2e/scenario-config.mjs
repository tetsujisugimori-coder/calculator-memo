// Fixed coverage contract; changing these conditions requires review.
export const scenarios = [
    { id: "chromium-desktop-1365px", engine: "chromium", width: 1365, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    { id: "chromium-narrow-390px", engine: "chromium", width: 390, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    { id: "chromium-mobile-390px", engine: "chromium", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { id: "chromium-mobile-375px", engine: "chromium", width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { id: "webkit-mobile-390px", engine: "webkit", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { id: "webkit-mobile-375px", engine: "webkit", width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ];

// Avoid Fetch's reserved/bad-port list (4190 is reserved for ManageSieve).
export function scenarioPort(index) {
  if (!Number.isInteger(index) || index < 0 || index >= scenarios.length) throw new Error('Unknown scenario port index');
  return 4280 + index;
}
