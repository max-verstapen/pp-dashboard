import { NextResponse } from "next/server";

// One-Time Tasks matching backend constants with updated PP values
const placeholderTasks = [
  { id: "FIRMWARE_UPDATE", title: "Complete 'Firmware Update'", rewardPP: 10, done: false },
  { id: "GOTTA_GO_PLACES", title: "Complete 'Gotta Go Places'", rewardPP: 20, done: false },
  { id: "RAMEN_RUSH", title: "Complete 'Ramen Rush'", rewardPP: 15, done: false },
  { id: "HONEY_MEAD", title: "Complete 'Honey Mead'", rewardPP: 75, done: false },
  { id: "FRACTURED_REALMS", title: "Complete 'Fractured Realms'", rewardPP: 100, done: false },
  { id: "SOLANA_LOOTBOX", title: "Open a Solana Lootbox", rewardPP: 150, done: false },
  { id: "HONEYCUB_LOOTBOX", title: "Open a Honeycub Lootbox", rewardPP: 125, done: false },
];

export async function GET() {
  // In future, you can fetch real tasks here and return:
  // const tasks = await getTasksForUser(userId);
  return NextResponse.json(placeholderTasks);
}


