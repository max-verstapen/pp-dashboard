export type TweetToVerify = {
  id: string;
  label?: string;
  /** Quest ID for comment verification (prevents re-verification, used with quest API) */
  commentQuestId: string;
  /** Quest ID for quote verification (prevents re-verification, used with quest API) */
  quoteQuestId: string;
};


export const TWEETS_TO_VERIFY: TweetToVerify[] = [
  {
    id: "2027808435841208795",
    label: "crypto [as] an mmorpg",
    commentQuestId: "15",
    quoteQuestId: "16",
  },
];

