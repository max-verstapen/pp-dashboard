export type TweetToVerify = {
  id: string;
  label?: string;
};

/**
 * Tweets shown in the "Verify post engagement" panel.
 *
 * Add new tweets to the END of this array — the UI renders last-to-first
 * so newly added tweets appear at the top.
 */
export const TWEETS_TO_VERIFY: TweetToVerify[] = [
  { id: "2019081859167371556", label: "Seeker token payment" },
];

