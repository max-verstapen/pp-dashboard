"use client";
import Image from "next/image";
import { useMemo, useState, useEffect, useRef } from "react";
import PixelButton from "../components/PixelButton";
import RightTabsPanel from "../components/RightTabsPanel";
import InfoBoard from "../components/InfoBoard";
import RewardsModal from "../components/RewardsModal";
import CampaignDetailsModal from "../components/CampaignDetailsModal";

// All available cards from the three folders
const nameTagCards = [
  "/Name tag/Green.gif",
  "/Name tag/Purple.gif",
  "/Name tag/Red.gif",
];

const skinCards = [
  "/Skin/Bulla.gif",
  "/Skin/Farmer I.gif",
  "/Skin/Farmer II.gif",
  "/Skin/Gremla.gif",
  "/Skin/Joy.gif",
  "/Skin/Lando.gif",
  "/Skin/Mr Dingleton.gif",
  "/Skin/Narc I.gif",
  "/Skin/Narc II.gif",
  "/Skin/Neon Monke.gif",
  "/Skin/Pepo.gif",
  "/Skin/Saga Monke.gif",
  "/Skin/Sprototard.gif",
  "/Skin/Stella.gif",
  "/Skin/Ted.gif",
  "/Skin/Wormilio.gif",
  "/Skin/Yeeterina.gif",
];

const budCards = [
  "/Buds/50BUDS.gif",
  "/Buds/250BUDS.gif",
  "/Buds/750BUDS.gif",
  "/Buds/2500BUDS.gif",
  "/Buds/10000BUDS.gif",
];

// Combined pool of all cards
const allCards = [...nameTagCards, ...skinCards, ...budCards];

// Function to randomly select and mix cards from all folders
function getRandomMixedCards(count: number): string[] {
  const shuffled = [...allCards];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Return the requested number of cards
  return shuffled.slice(0, count);
}

export default function Home() {
  const initialCards = useMemo(() => getRandomMixedCards(8), []);

  const [cards, setCards] = useState<string[]>(initialCards);
  const [isShuffling, setIsShuffling] = useState(false);
  const [showInfoBoard, setShowInfoBoard] = useState(false);
  const [showRewardsModal, setShowRewardsModal] = useState(false);
  const [showCampaignDetailsModal, setShowCampaignDetailsModal] = useState(false);
  const shuffleSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Preload the shuffle sound
    shuffleSoundRef.current = new Audio("/main card reveal whoosh.mp3");
    shuffleSoundRef.current.preload = "auto";
    
    // Show campaign details modal on website open (once per session)
    const hasSeenCampaignDetails = sessionStorage.getItem("hasSeenCampaignDetails");
    if (!hasSeenCampaignDetails) {
      setShowCampaignDetailsModal(true);
    }
    
    // Check if user has seen the panels before
    const hasSeenPanels = localStorage.getItem("hasSeenInfoAndRewardsPanels");
    
    if (!hasSeenPanels) {
      // Show InfoBoard for first-time users
      setShowInfoBoard(true);
    }

    // Preload all card images for caching
    allCards.forEach((src) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
    });

    // Also preload using native Image API for additional caching
    allCards.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

  const handleInfoBoardClose = () => {
    setShowInfoBoard(false);
    // Show rewards modal after info board closes
    setShowRewardsModal(true);
  };

  const handleRewardsModalClose = () => {
    setShowRewardsModal(false);
    // Mark that user has seen both panels
    localStorage.setItem("hasSeenInfoAndRewardsPanels", "true");
  };

  const handleCampaignDetailsModalClose = () => {
    setShowCampaignDetailsModal(false);
    // Mark that user has seen campaign details for this session
    sessionStorage.setItem("hasSeenCampaignDetails", "true");
  };

  function handleShuffle() {
    // Play shuffle sound
    if (shuffleSoundRef.current) {
      shuffleSoundRef.current.currentTime = 0; // Reset to start
      shuffleSoundRef.current.play().catch((error) => {
        // Handle autoplay restrictions gracefully
        console.log("Audio play failed:", error);
      });
    }

    // Get new random mix of cards from all folders
    const next = getRandomMixedCards(8);
    setIsShuffling(true);
    // Wait for animation (0.6s) + max stagger (0.3s) + small buffer
    const totalDurationMs = 540;
    setTimeout(() => {
      setCards(next);
      setIsShuffling(false);
    }, totalDurationMs);
  }

  return (
    <div className="flex min-h-[100svh] items-center justify-center font-sans">
      {/* Campaign Details Modal */}
      {showCampaignDetailsModal && <CampaignDetailsModal onClose={handleCampaignDetailsModalClose} />}
      
      {/* Info Board Modal */}
      {showInfoBoard && <InfoBoard onClose={handleInfoBoardClose} />}
      
      {/* Rewards Modal */}
      {showRewardsModal && <RewardsModal onClose={handleRewardsModalClose} />}

      {/* Single-frame wrapper with equal T/B and equal L/R margins.
          On small screens: natural height so panels stack one after another.
          On large screens: fixed frame height with internal scrolling. */}
      <main className="mx-[4vw] mt-[4svh] mb-[4svh] w-[calc(100vw-8vw)] min-h-[80svh] lg:h-[80svh]">
        {/* Responsive frame: stack on small screens, two columns on larger screens */}
        <div className="grid w-full min-h-0 grid-cols-1 gap-4 lg:h-full lg:grid-cols-12">
          {/* LEFT column */}
          <section className="grid min-h-0 grid-rows-[2fr_1fr] gap-4 lg:h-full lg:col-span-7">
            {/* Upper left: logo, title, bullets */}
            <div className="panel overflow-y-auto p-6 md:p-8">
              <div className="flex flex-col items-start min-h-0" style={{ marginTop: '1px', marginBottom: '1px', marginLeft: '9px', marginRight: '9px' }}>
                <div className="mt-3 flex w-full items-center justify-between gap-3 overflow-hidden">
                  <img
                    src="/seek-to-earn.gif"
                    alt="SEEK TO EARN — EXCLUSIVE REWARDS!"
                    className="m-0 p-0 h-12 md:h-14 w-auto object-contain"
                    style={{ lineHeight: '28px', paddingRight: '0px', overflow: 'visible', marginTop: '7px', marginBottom: '7px' }}
                  />
                 
                </div>
                <ul className="mt-4 space-y-4">
                    <li>
                      <p className="font-extrabold tracking-wide text-xl text-[#cbf99f]" style={{ fontSize: '20px', fontFamily: 'RasterForge' }}>
                        Play The Game
                      </p>
                      <p className="text-zinc-100/90">
                        Complete in-game quests and work your way up the leaderboard!
                      </p>
                    </li>
                    <li>
                      <p className="font-extrabold tracking-wide text-xl text-[#cbf99f]" style={{ fontSize: '20px', fontFamily: 'RasterForge' }}>
                        Open Limited Edition Lootboxes
                      </p>
                      <p className="text-zinc-100/90">
                        Earn points every time you open a lootbox.
                      </p>
                      <p className="text-zinc-100/90">
                        The supply of premium lootboxes are capped at 10,000!
                      </p>
                    </li>
                    <li>
                      <p className="font-extrabold tracking-wide text-xl text-[#cbf99f]" style={{ fontSize: '20px', fontFamily: 'RasterForge' }}>
                        Create Valuable Content
                      </p>
                      <p className="text-zinc-100/90">
                        Post meaningful information about the vision, gameplay, and ongoing Seeker campaign on X
                      </p>
                      <p className="text-zinc-100/90">
                        Posts must tag @bakelandxyz to be eligible.
                      </p>
                    </li>
                    <li>
                      <p className="font-extrabold tracking-wide text-xl text-[#cbf99f]" style={{ fontSize: '20px', fontFamily: 'RasterForge' }}>
                        Invite Your Friends
                      </p>
                      <p className="text-zinc-100/90">
                        Invite your friends to play together and earn free reward boxes!
                      </p>
                    </li>
                </ul>
              </div>
            </div>

            {/* Bottom left: shuffle row */}
            <div className={`panel ${isShuffling ? "shuffle-anim" : ""}`}>
              <div className="flex flex-col items-center gap-4">
                <div className="flex w-full items-center justify-center gap-3 overflow-hidden">
                  {cards.map((src, idx) => (
                    <div
                      key={src + idx}
                      className="card relative h-40 w-28 shrink-0 overflow-hidden rounded-md bg-black/30"
                    >
                      <Image
                        src={src}
                        alt={`Card ${idx + 1}`}
                        fill
                        sizes="112px"
                        className="object-cover"
                        priority={idx < 2}
                      />
                    </div>
                  ))}
                </div>
                <PixelButton onClick={handleShuffle} variant="tab" size="md">
                  SHUFFLE
                </PixelButton>
              </div>
            </div>
          </section>

          {/* RIGHT column */}
          <section className="w-full min-h-0 lg:h-full lg:col-span-5">
            <RightTabsPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
