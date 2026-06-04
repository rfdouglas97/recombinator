/** Panel-with-sidebar layout icon (filled rail = filters visible). */
export function SidebarToggleIcon({
  open,
  size = 18,
}: {
  /** True when the filter sidebar is visible. */
  open: boolean;
  size?: number;
}) {
  return (
    <svg
      className="sidebar-toggle-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {open ? (
        <>
          <path
            d="M3.5 5h7v14h-5a2 2 0 0 1-2-2V5z"
            fill="currentColor"
            fillOpacity="0.28"
          />
          <path d="M10.5 5v14" stroke="currentColor" strokeWidth="1.75" />
        </>
      ) : (
        <>
          <path
            d="M3.5 5h7v14h-5a2 2 0 0 1-2-2V5z"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M13.5 12h4.5M16 9.5 18.5 12 16 14.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
