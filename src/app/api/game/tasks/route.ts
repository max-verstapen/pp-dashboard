import { NextResponse } from "next/server";

// Placeholder tasks. Replace with actual data fetching later (DB/service call).
const placeholderTasks = [
  { id: "fw", title: "Complete 'Firmware Update'", rewardPP: 10, done: true },
  { id: "travel", title: "Complete 'Gotta Go Places'", rewardPP: 20, done: false },
  { id: "ramen", title: "Complete 'Ramen Rush'", rewardPP: 15, done: false },
  { id: "mead", title: "Complete 'Honey Mead'", rewardPP: 75, done: false },
  { id: "fractured", title: "Complete 'Fractured Realms'", rewardPP: 100, done: false },
  { id: "solana", title: "Open a Solana Lootbox", rewardPP: 100, done: false },
  { id: "honeycub", title: "Open a Honeycub Lootbox", rewardPP: 125, done: false },
];

export async function GET() {
  // In future, you can fetch real tasks here and return:
  // const tasks = await getTasksForUser(userId);
  return NextResponse.json(placeholderTasks);
}


