import { ComponentProps } from "react";

export function VoiceIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b82f6"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width={24} height={24} fill="white" />
      <circle cx={12} cy={12} r={10} />
      <path d="M5.969 4a9.12 9.12 0 0 1 12.061 0" />
      <path d="M8.01 7.55a6.27 6.27 0 0 1 8.026 0" />
      <path d="M10.02 11.11a3.42 3.42 0 0 1 3.962 0" />
      <line x1={12} y1={15} x2={12} y2={15} />
      <rect x={8} y={17} width={8} height={2} rx={1} />
    </svg>
  );
}