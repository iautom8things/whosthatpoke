// A few icons the kit doesn't have, drawn in the same style (24 grid, round 3 px strokes).
import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function make(body: ReactNode, filled = false) {
  return (props: Props) => (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {body}
    </svg>
  );
}

export const IconMinus = make(<path d="M5 12h14" />);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
/** Down arrow into a tray: saved on this device. */
export const IconSave = make(<path d="M12 3.5v10M7.5 9.5l4.5 4.5 4.5-4.5M4 15.5V20h16v-4.5" />);
export const IconInfo = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <path d="M12 7.2h.01" strokeWidth={4} />
  </>,
);
/** iOS Share: a box with an arrow out the top. */
export const IconShare = make(<path d="M12 3v11M8 6.5 12 3l4 3.5M8 10H6v10h12V10h-2" strokeWidth={2.4} />);
export const IconPlusBox = make(<path d="M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM12 8v8M8 12h8" strokeWidth={2.4} />);
export const IconPhone = make(<path d="M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2" strokeWidth={2.4} />);
export const IconTrash = make(<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5M10 10.5v6M14 10.5v6" strokeWidth={2.4} />);
