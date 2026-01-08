import React from "react";

type PixelButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "green" | "tab";
  size?: "sm" | "md" | "lg";
};

export function PixelButton({
  children,
  variant = "green",
  size = "md",
  className = "",
  ...rest
}: PixelButtonProps) {
  return (
    <button
      data-variant={variant}
      data-size={size}
      className={`pixel-btn ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default PixelButton;



