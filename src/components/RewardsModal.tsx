"use client";
import React from "react";
import Image from "next/image";

interface RewardsModalProps {
  onClose: () => void;
}

export default function RewardsModal({ onClose }: RewardsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Title */}
      <h2 className="text-3xl md:text-4xl font-extrabold text-[#cbf99f] mb-6 text-center" style={{ backgroundImage: 'linear-gradient(90deg, rgba(59, 247, 140, 1) 0%, rgba(101, 251, 181, 1) 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
        Exclusive Rewards
      </h2>

      {/* Reward GIF */}
      <div className="max-w-4xl w-[90vw] max-h-[70vh] flex items-center justify-center relative">
        {/* Close button - positioned relative to image */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-10 h-10 flex items-center justify-center hover:opacity-80 transition-opacity"
          aria-label="Close"
        >
          <Image
            src="/assets/close.png"
            alt="Close"
            width={24}
            height={24}
            className="w-full h-full object-contain"
            style={{ lineHeight: '23px', paddingTop: '0px', paddingBottom: '0px' }}
          />
        </button>
        <Image
          src="/reward.gif"
          alt="Rewards"
          width={800}
          height={600}
          className="w-full h-auto object-contain pixel-icon"
          style={{ borderWidth: '2px', borderColor: 'rgba(0, 0, 0, 1)', borderStyle: 'solid', borderImage: 'linear-gradient(90deg, rgba(82, 255, 148, 1) 0%, rgba(189, 255, 209, 1) 100%) 1', lineHeight: '23px', paddingTop: '0px', paddingBottom: '0px' }}
          unoptimized
        />
      </div>
    </div>
  );
}
