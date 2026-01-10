"use client";
import React from "react";
import Image from "next/image";

interface RewardsModalProps {
  onClose: () => void;
}

export default function RewardsModal({ onClose }: RewardsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center hover:opacity-80 transition-opacity p-2"
        aria-label="Close"
      >
        <span className="text-[#dc2626] font-bold text-xl leading-none">
          X
        </span>
      </button>

      {/* Title */}
      <h2 className="text-3xl md:text-4xl font-extrabold text-[#cbf99f] mb-6 text-center">
        Exclusive Rewards
      </h2>

      {/* Reward GIF */}
      <div className="max-w-4xl w-[90vw] max-h-[70vh] flex items-center justify-center">
        <Image
          src="/reward.gif"
          alt="Rewards"
          width={800}
          height={600}
          className="w-full h-auto object-contain pixel-icon"
          unoptimized
        />
      </div>
    </div>
  );
}
