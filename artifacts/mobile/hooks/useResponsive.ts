import { useWindowDimensions } from "react-native";

export const TABLET_BREAKPOINT = 768;
export const MAX_CONTENT_WIDTH = 680;
export const MAX_MODAL_WIDTH = 720;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const isLandscape = width > height;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    contentMaxWidth: isTablet ? MAX_CONTENT_WIDTH : undefined,
    horizontalPadding: isTablet ? Math.max(24, (width - MAX_CONTENT_WIDTH) / 2) : 20,
  };
}
