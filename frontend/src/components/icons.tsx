/** Line icons drawn for Cobradía: 24px grid, 1.8 stroke, currentColor. */

import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
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

/** Small icons inside text (alerts, menus): 18 px. */
const small = 'size-[18px] shrink-0'

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Svg>
)

export const PeopleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.4.8 2.3 2.6 2.5 5.2" />
  </Svg>
)

export const LoanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6.5 9.5v.01M17.5 14.5v.01" />
  </Svg>
)

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
)

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
)

export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
)

export const CashIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 12h.01M18 12h.01" />
    <path d="M12 9.2v5.6M13.6 10.2c-.3-.6-.9-1-1.6-1-1 0-1.7.6-1.7 1.4 0 1.8 3.4 1 3.4 2.8 0 .8-.8 1.4-1.7 1.4-.7 0-1.4-.4-1.7-1" />
  </Svg>
)

export const RouteIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </Svg>
)

export const CollectIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.3c-.4-.9-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 2 0 2.8 5.4 1.5 5.4 4.3 0 1.2-1.2 2.1-2.8 2.1-1.2 0-2.3-.6-2.7-1.6M12 6.2v1.6M12 16.2v1.6" />
  </Svg>
)

export const CalendarIcon = (p: IconProps) => (
  <Svg className="size-4 shrink-0" {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
)

// --- Menu ------------------------------------------------------------------

export const ApplicationIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
)

export const DisburseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="11" rx="2" />
    <circle cx="12" cy="14.5" r="2" />
    <path d="M12 2.5v4M9.8 4.6 12 2.5l2.2 2.1" />
  </Svg>
)

export const CalculatorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3M8.5 18h.01M12 18h.01" />
  </Svg>
)

export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3" />
    <path d="M3 6a2 2 0 0 0 2 2h14a1 1 0 0 1 1 1v3" />
    <path d="M21 12h-4a2 2 0 0 0 0 4h4z" />
  </Svg>
)

export const AgendaIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4M9.5 15l1.8 1.8 3.4-3.6" />
  </Svg>
)

export const ClockAlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const MapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
)

export const DrawerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    <path d="M5.5 5h13L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z" />
  </Svg>
)

export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16M8 20h8M5 7h14M12 4l-1 3M12 4l1 3" />
    <path d="m5 7-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z" />
  </Svg>
)

export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 9 9-5 9 5M4 20h16M5 9v8M9.5 9v8M14.5 9v8M19 9v8" />
  </Svg>
)

export const ArrowsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 20V5M3.5 8.5 7 5l3.5 3.5M17 4v15M13.5 15.5 17 19l3.5-3.5" />
  </Svg>
)

export const InvoiceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9.5 8h5M9.5 12h5M9.5 16h2" />
  </Svg>
)

export const StampIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 14.5l2 2 4-4.5" />
  </Svg>
)

export const TrendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
)

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6" />
  </Svg>
)

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <rect x="5.5" y="11" width="3" height="6" rx="0.8" />
    <rect x="10.5" y="7" width="3" height="10" rx="0.8" />
    <rect x="15.5" y="4" width="3" height="13" rx="0.8" />
  </Svg>
)

export const PieIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5A8.5 8.5 0 1 0 20.5 12H12z" />
    <path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z" />
  </Svg>
)

export const AwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="5.5" />
    <path d="m8.5 13.3-1.5 7.2 5-2.5 5 2.5-1.5-7.2" />
  </Svg>
)

export const PercentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18.5 5.5 5.5 18.5" />
    <circle cx="7" cy="7" r="2.3" />
    <circle cx="17" cy="17" r="2.3" />
  </Svg>
)

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6z" />
    <path d="M12 8.5v4M12 15.5h.01" />
  </Svg>
)

export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18" />
    <path d="M8 7.5h4M8 11h4M8 14.5h4" />
  </Svg>
)

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z" />
    <circle cx="8" cy="8" r="1.4" />
  </Svg>
)

export const StarCalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
    <path d="m12 12.6.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
  </Svg>
)

export const HashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9h15M4 15h15M10 4 8 20M16 4l-2 16" />
  </Svg>
)

export const StoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5V20h16V9.5" />
    <path d="M3 9.5 5 4h14l2 5.5a2.5 2.5 0 0 1-4.5 1.5 2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-4.5 0A2.5 2.5 0 0 1 3 9.5z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
)

export const UserCogIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="3.8" />
    <path d="M3.5 20c.6-3.6 3.2-5.8 6.5-5.8 1 0 1.9.2 2.7.6" />
    <circle cx="17.5" cy="17.5" r="2" />
    <path d="M17.5 13.8v1.7M17.5 19.5v1.7M21.2 17.5h-1.7M15.5 17.5h-1.7" />
  </Svg>
)

export const BriefcaseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
  </Svg>
)

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
  </Svg>
)

export const CardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </Svg>
)

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c.7-4 3.7-6.5 7.5-6.5s6.8 2.5 7.5 6.5" />
  </Svg>
)

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16.5 5.5 12 10 7.5M5.5 12H15" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Svg className="size-4 shrink-0" {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

// --- Feedback ----------------------------------------------------------------

export const InfoIcon = (p: IconProps) => (
  <Svg className={small} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8h.01" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg className={small} {...p}>
    <path d="M10.3 4.1 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.1a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 16.8h.01" />
  </Svg>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Svg className={small} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg className="size-3.5 shrink-0" strokeWidth={2.4} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    <path d="M5.5 5h13L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z" />
  </Svg>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Svg className="size-4 shrink-0" {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
)
