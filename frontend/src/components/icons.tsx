/** Line icons drawn for Cobradía: 24px grid, 1.8 stroke, currentColor. */

import type { ReactNode, SVGProps } from 'react'

function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-5 shrink-0"
      {...props}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)

export const HomeIcon = () => (
  <Svg>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Svg>
)

export const PeopleIcon = () => (
  <Svg>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.4.8 2.3 2.6 2.5 5.2" />
  </Svg>
)

export const LoanIcon = () => (
  <Svg>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6.5 9.5v.01M17.5 14.5v.01" />
  </Svg>
)

export const MenuIcon = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const SunIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
)

export const MoonIcon = () => (
  <Svg>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
)

export const BellIcon = () => (
  <Svg>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
)

export const CashIcon = () => (
  <Svg>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 12h.01M18 12h.01" />
    <path d="M12 9.2v5.6M13.6 10.2c-.3-.6-.9-1-1.6-1-1 0-1.7.6-1.7 1.4 0 1.8 3.4 1 3.4 2.8 0 .8-.8 1.4-1.7 1.4-.7 0-1.4-.4-1.7-1" />
  </Svg>
)

export const RouteIcon = () => (
  <Svg>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </Svg>
)

export const CollectIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.3c-.4-.9-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 2 0 2.8 5.4 1.5 5.4 4.3 0 1.2-1.2 2.1-2.8 2.1-1.2 0-2.3-.6-2.7-1.6M12 6.2v1.6M12 16.2v1.6" />
  </Svg>
)
