import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

/** Chunky rounded stroke icons. 1em square by default, colored by currentColor. */
function icon(name: string, body: ReactNode, filled = false) {
  const Icon = ({ size = "1em", ...rest }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {body}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

export const IconBack = icon("IconBack", <path d="M15 4 7 12l8 8" />);
export const IconNext = icon("IconNext", <path d="m9 4 8 8-8 8" />);
export const IconCheck = icon("IconCheck", <path d="m4.5 12.5 5 5L19.5 6.5" />);
export const IconX = icon("IconX", <path d="M6 6l12 12M18 6 6 18" />);
export const IconPlay = icon("IconPlay", <path d="M7 4.5v15l12.5-7.5z" strokeWidth={2.5} />, true);
export const IconPause = icon("IconPause", <path d="M8 5v14M16 5v14" strokeWidth={4} />);
export const IconHome = icon("IconHome", <path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5" />);
export const IconRefresh = icon("IconRefresh", <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" />);
export const IconExpand = icon("IconExpand", <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const IconQuestion = icon(
  "IconQuestion",
  <>
    <path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3v.5" />
    <path d="M12 19h.01" strokeWidth={4} />
  </>,
);
export const IconVolume = icon(
  "IconVolume",
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" strokeWidth={2.5} fill="currentColor" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </>,
);
export const IconVolumeOff = icon(
  "IconVolumeOff",
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" strokeWidth={2.5} fill="currentColor" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </>,
);
export const IconMusic = icon(
  "IconMusic",
  <>
    <path d="M9.5 17.5V6.5l10-2.5v11.5" />
    <circle cx="6.5" cy="17.5" r="3" fill="currentColor" strokeWidth={2} />
    <circle cx="16.5" cy="15.5" r="3" fill="currentColor" strokeWidth={2} />
  </>,
);
export const IconGear = icon(
  "IconGear",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    <circle cx="12" cy="12" r="6.5" />
  </>,
);
export const IconTrophy = icon(
  "IconTrophy",
  <>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" strokeWidth={2.5} />
    <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" />
  </>,
);
export const IconStar = icon(
  "IconStar",
  <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z" strokeWidth={2} />,
  true,
);
export const IconUsers = icon(
  "IconUsers",
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14a6.5 6.5 0 0 1 3 6" />
  </>,
);
export const IconEye = icon(
  "IconEye",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </>,
);
