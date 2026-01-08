"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import PixelButton from "../components/PixelButton";
import RightTabsPanel from "../components/RightTabsPanel";

export default function Home() {
  const initialCards = useMemo(
    () => [
      "/assets/cards/card1.gif",
      "/assets/cards/card7.gif",
      "/assets/cards/card3.gif",
      "/assets/cards/card4.gif",
      "/assets/cards/card5.gif",
      "/assets/cards/card6.gif",
    ],
    []
  );

  const [cards, setCards] = useState<string[]>(initialCards);
  const [isShuffling, setIsShuffling] = useState(false);

  function handleShuffle() {
    // Fisher-Yates shuffle
    const next = [...cards];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
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
      {/* Single-frame wrapper with equal T/B and equal L/R margins.
          Side margins are slightly smaller than top/bottom. */}
      <main className="mx-[4vw] mt-[4svh] mb-[4svh] h-[80svh] w-[calc(100vw-8vw)]">
        {/* Two-column frame */}
        <div className="grid h-full w-full min-h-0 grid-cols-12 gap-4">
          {/* LEFT column */}
          <section className="col-span-7 grid min-h-0 grid-rows-[2fr_1fr] gap-4">
            {/* Upper left: logo, title, bullets */}
            <div className="panel overflow-y-auto">
              <div className="flex flex-col items-start min-h-0">
                <div className="mt-3 flex w-full items-center justify-between gap-3 overflow-hidden">
                  <img
                    src="/seek-to-earn.gif"
                    alt="SEEK TO EARN — EXCLUSIVE REWARDS!"
                    className="m-0 p-0 h-12 md:h-14 w-auto object-contain"
                  />
                 
                </div>
                <ul className="mt-4 space-y-4">
                    <li>
                      <p className="font-extrabold tracking-wide text-xl md:text-2xl text-[#cbf99f]">
                        Play The Game
                      </p>
                      <p className="text-zinc-100/90">
                        Complete in-game quests and work your way up the leaderboard!
                      </p>
                    </li>
                    <li>
                      <p className="font-extrabold tracking-wide text-xl md:text-2xl text-[#cbf99f]">
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
                      <p className="font-extrabold tracking-wide text-xl md:text-2xl text-[#cbf99f]">
                        Create Valuable Content
                      </p>
                      <p className="text-zinc-100/90">
                        Post meaningful information about the vision, gameplay, and ongoing Seeker campaign on X
                      </p>
                      <p className="text-zinc-100/90">
                        Posts must tag @bakelandxyz to be considered.
                      </p>
                    </li>
                    <li>
                      <p className="font-extrabold tracking-wide text-xl md:text-2xl text-[#cbf99f]">
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
          <section className="col-span-5 min-h-0">
            <RightTabsPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
