// Shared hooks and helpers. kiosk.ts is not re-exported: import it once for its side effects.
export { haptic, type HapticName } from "./haptic";
export { isReducedMotion, useReducedMotion } from "./reducedMotion";
export { useThemeAttributes } from "./theme";
export { useFullscreen, type Fullscreen } from "./useFullscreen";
export { useIdle } from "./useIdle";
export { useInterval } from "./useInterval";
export { KeyLayerContext, openKeyLayer, useKeys, type KeyHandler, type UseKeysOptions } from "./useKeys";
export { useSwipe, type SwipeDirection, type SwipeInfo, type UseSwipeOptions, type UseSwipeResult } from "./useSwipe";
export { useViewport, type Orientation, type Viewport, type ViewportSize } from "./useViewport";
export { useWakeLock } from "./useWakeLock";
