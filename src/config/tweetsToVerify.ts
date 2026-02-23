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
    id: "2019081859167371556",
    label: "Seeker token support",
    commentQuestId: "11",
    quoteQuestId: "12",
  },
  {
    id: "209197839",
    label: "Article",
    commentQuestId: "13",
    quoteQuestId: "14",
  },
];

