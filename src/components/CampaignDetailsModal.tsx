"use client";
import React from "react";
import Image from "next/image";

interface CampaignDetailsModalProps {
  onClose: () => void;
}

export default function CampaignDetailsModal({ onClose }: CampaignDetailsModalProps) {
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
        <div className="pixel-window relative max-w-3xl w-[90vw] max-h-[90vh] overflow-hidden">
          {/* Inner content panel */}
          <div className="pixel-window__inner p-6 overflow-y-auto max-h-[85vh]">
            {/* Title */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <h1 className="text-2xl md:text-3xl font-extrabold text-white text-center" style={{ paddingLeft: '2px', paddingRight: '2px', marginTop: '0px', marginBottom: '0px', paddingTop: '3px', paddingBottom: '3px', verticalAlign: 'bottom' }}>
              Seek to Earn Campaign Details
            </h1>
            </div>

            {/* Intro Text */}
            <div className="space-y-4 text-[#cbf99f] text-sm md:text-base leading-relaxed mb-6">
              <p>
                The Seek to Earn campaign is well underway, with 3000+ players actively competing for prizes! 
              </p>

            </div>

            {/* Reward Distribution */}
            <div className="space-y-4 text-[#cbf99f] text-sm md:text-base leading-relaxed">
              <div>
                <p className="font-extrabold text-lg mb-3 text-white">Reward Distribution:</p>
                <div className="space-y-3 ml-2">
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>1st Place:</span> Sony PS5* + 100,000 $BUDS + 1:1 NFT from Bakeland: Origins</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>2nd Place:</span> Nintendo Switch 2* + 50,000 $BUDS + Bakeland: Origins Free Mint</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>3rd Place:</span> Solana Seeker + 30,000 $BUDS + Bakeland: Origins Free Mint</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>4th Place:</span> Solana Seeker + 10,000 $BUDS + Bakeland: Origins Free Mint</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>Rank 5-20:</span> 10,000 $BUDS + Bakeland: Origins Free Mint</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>Rank 21-100:</span> 5,000 $BUDS + Bakeland: Origins GTD WL</p>
                  </div>
                  <div className="border-l-2 border-[#cbf99f]/30 pl-4">
                    <p className="font-extrabold text-base mb-1"><span style={{ color: '#a3e635' }}>Rank 101-500:</span> Bakeland: Origins GTD WL</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#cbf99f]/20">
                <p className="font-extrabold text-base mb-2 text-white">Campaign End Date:</p>
                <p className="mb-4">The Seek to Earn campaign will end on <span style={{ color: 'yellow' }}>28th Feb 12:00 UTC**</span></p>
                
                <p className="mb-2">These details will also be made available on <a href="https://rewards.bakeland.xyz/" target="_blank" rel="noopener noreferrer" className="text-yellow-300 hover:underline">https://rewards.bakeland.xyz/</a> to all participants.</p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#cbf99f]/20 space-y-2 text-xs opacity-80">
                <p>* We will also provide an option to claim rewards in USDC</p>
                <p>** Bakeland: Origins is our upcoming NFT collection minting soon after the end of the Seek-to-Earn campaign. Details will be shared in the coming days!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
