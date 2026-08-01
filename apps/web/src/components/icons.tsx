import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </IconFrame>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 2.8 19h18.4L12 3Z" />
      <path d="M12 9v4M12 16.5h.01" />
    </IconFrame>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m9 5 7 7-7 7" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m5 12 4 4L19 6" />
    </IconFrame>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 5h14v10H9l-4 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </IconFrame>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6 2.5h8l4 4V21H6V2.5Z" />
      <path d="M14 2.5v5h4M9 12h6M9 16h6" />
    </IconFrame>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3 6.5h7l2 2h9v10.5H3V6.5Z" />
      <path d="M3 6.5V4h6l2 2.5" />
    </IconFrame>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" />
    </IconFrame>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M3 9h18M9 3v18M9 15h12" />
    </IconFrame>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="6" rx="1.5" width="6" x="4" y="4" />
      <rect height="6" rx="1.5" width="6" x="14" y="4" />
      <rect height="6" rx="1.5" width="6" x="4" y="14" />
      <rect height="6" rx="1.5" width="6" x="14" y="14" />
    </IconFrame>
  );
}

export function DeviceIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="14" rx="2" width="18" x="3" y="4" />
      <path d="M8 21h8M12 18v3" />
    </IconFrame>
  );
}

export function FlowIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="5" rx="1.2" width="6" x="3" y="3" />
      <rect height="5" rx="1.2" width="6" x="15" y="16" />
      <path d="M9 5.5h3a3 3 0 0 1 3 3v7.5M15 18.5h-3a3 3 0 0 1-3-3V8" />
    </IconFrame>
  );
}

export function RunsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </IconFrame>
  );
}

export function ScheduleIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h6" />
    </IconFrame>
  );
}

export function SiteIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h4M7 16h7" />
    </IconFrame>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m9 6 9 6-9 6V6Z" />
    </IconFrame>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconFrame>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 3h13l3 3v15H4V3Z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </IconFrame>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" />
    </IconFrame>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </IconFrame>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7 2-.7Z" />
    </IconFrame>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4L21 12l-4.4 1.5a5 5 0 0 0-3.4 3.4L12 21l-1.2-4.1a5 5 0 0 0-3.4-3.4L3 12l4.4-1.5a5 5 0 0 0 3.4-3.4L12 3Z" />
    </IconFrame>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
