import { ComponentProps } from "react";

export function MicrophoneIcon(props: ComponentProps<"svg">) {
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
      <path d="M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M8 21l8 0" />
      <path d="M12 17l0 4" />
      <line x1={3} y1={9} x2={3} y2={13} />
      <line x1={5} y1={7} x2={5} y2={15} />
      <line x1={7} y1={9} x2={7} y2={13} />
      <line x1={17} y1={9} x2={17} y2={13} />
      <line x1={19} y1={7} x2={19} y2={15} />
      <line x1={21} y1={9} x2={21} y2={13} />
    </svg>
  );
}