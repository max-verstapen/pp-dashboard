"use client";
import React from "react";
import Image from "next/image";

interface InfoBoardProps {
  onClose: () => void;
}

export default function InfoBoard({ onClose }: InfoBoardProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative">
        {/* Close button - positioned outside the panel at top-right */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-20 w-10 h-10 flex items-center justify-center hover:opacity-80 transition-opacity"
          aria-label="Close"
        >
          <Image
            src="/assets/close.png"
            alt="Close"
            width={24}
            height={24}
            className="w-full h-full object-contain"
          />
        </button>
        <div className="pixel-window relative max-w-2xl w-[90vw] max-h-[90vh] overflow-hidden">
        {/* Inner content panel */}
        <div className="pixel-window__inner p-6 overflow-y-auto max-h-[85vh]">
          {/* Title */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white text-center" style={{ paddingLeft: '2px', paddingRight: '2px', marginTop: '0px', marginBottom: '0px', paddingTop: '3px', paddingBottom: '3px', verticalAlign: 'bottom' }}>
              How it Works
            </h1>
            <Image
              src="/assets/Green Icons Outlined/help.png"
              alt="Info"
              width={24}
              height={24}
              className="pixel-icon"
              style={{ width: '45px' }}
            />
          </div>

          {/* Content */}
          <div className="space-y-4 text-[#cbf99f] text-sm md:text-base leading-relaxed">
            <p>
              This campaign is exclusively designed to reward early participants in our ecosystem. Players can earn
              exclusive rewards and community roles via meaningful contributions as outlined below.
            </p>

            <p>
              The Seek to Earn pre-season campaign is focused on incentivizing tasks ranging from In-game activity,
              social activity, daily/weekly participation in our early economy.*
            </p>

            <div>
              <p className="font-extrabold text-lg mb-2">To participate:</p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><span style={{ color: 'yellow' }}>Install the game</span> on your Seeker via the dApp Store**</li>
                <li>Complete Game Tasks and Open Lootboxes to <span style={{ color: 'yellow' }}>win Play Points (PP)</span></li>
                <li>
                  <span style={{ color: 'yellow' }}>Post on Twitter/X</span> with the tag @bakelandxyz to earn points based on quality, engagement and effort.
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li>Evident "AI-slop" will be deemed ineligible.</li>
                    <li>We will filter for quality, engagement, and smart-follower reach to distribute points at our discretion.</li>
                  </ul>
                </li>
                <li><span style={{ color: 'yellow' }}>Invite friends</span> to earn points and unlock referral bonuses.</li>
              </ul>
            </div>

            <div>
              <p className="font-extrabold text-lg mb-2">Leaderboard Reward:</p>
              <p>The Top 100 leaderboard positions will be eligible for an exclusive drop!</p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#cbf99f]/20 space-y-1 text-xs opacity-80">
              <p>* All tasks are verified once every 24 hours. This frequency will increase in the coming days.</p>
              <p>** Kindly ensure the same wallet is connected across the game and the portal above.</p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
