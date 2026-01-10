# Twitter Social Tasks Implementation

This document describes the implementation of two Twitter/X social tasks for the Bakeland dashboard:

1. **Follow @bakelandxyz on X** (25 PP reward) - One-time claimable
2. **Post a Gameplay Clip on X** (150 PP reward) - One-time claimable

## Overview

The implementation includes:
- API endpoints to verify Twitter social tasks using twitterapi.io
- Frontend UI updates to display dynamic social task status
- Integration with existing player-points system for task completion tracking

## Environment Variables Required

Add the following to your `.env.local` file:

```bash
# Twitter API Key from twitterapi.io
TWITTER_API_KEY=your_twitterapi_io_api_key_here

# Alternative env variable name (also supported)
TWITTERAPI_IO_API_KEY=your_twitterapi_io_api_key_here
```

## API Endpoints Created

### 1. `/api/social/twitter/verify` (POST)

Verifies Twitter social tasks by checking:
- If user follows @bakelandxyz
- If user has posted about Bakeland gameplay

**Request Body:**
```json
{
  "xHandle": "username",  // User's X/Twitter handle (without @)
  "taskType": "follow" | "gameplay_post"
}
```

**Response:**
```json
{
  "verified": true/false,
  "error": "optional error message",
  "tweetUrl": "optional URL to qualifying tweet"
}
```

### 2. `/api/social/twitter/tasks/status` (GET)

Gets the completion status of Twitter social tasks for a user.

**Query Parameters:**
- `address` - User's wallet address

**Response:**
```json
{
  "tasks": [
    {
      "id": "FOLLOW_BAKELAND_X",
      "title": "Follow @bakelandxyz on X",
      "reward": 25,
      "completed": false,
      "canVerify": true,
      "xHandle": "user_handle"
    },
    {
      "id": "POST_GAMEPLAY_X",
      "title": "Post a Gameplay Clip on X",
      "reward": 150,
      "completed": false,
      "canVerify": true,
      "xHandle": "user_handle"
    }
  ]
}
```

### 3. `/api/social/twitter/tasks/claim` (POST)

Verifies and claims a social task reward (for backend integration).

**Request Body:**
```json
{
  "address": "wallet_address",
  "xHandle": "username",
  "taskId": "FOLLOW_BAKELAND_X" | "POST_GAMEPLAY_X"
}
```

## Frontend Changes

### RightTabsPanel.tsx

The `DailyContent` component has been updated to:
- Dynamically load social task completion status
- Display "Verify" button for tasks that can be verified
- Show task completion status from backend
- Handle task verification flow

**Task IDs:**
- `FOLLOW_BAKELAND_X` - Follow @bakelandxyz task
- `POST_GAMEPLAY_X` - Post gameplay clip task
- `REFER_FRIEND` - Refer a friend task (existing, tracked separately)

## Backend Integration

### Configuring Tasks in Backend API

To make these tasks claimable, you need to configure them in your backend API:

1. **Add Task Definitions:**
   - Task ID: `FOLLOW_BAKELAND_X`
     - Title: "Follow @bakelandxyz on X"
     - Reward: 25 PP
     - Type: One-time
   
   - Task ID: `POST_GAMEPLAY_X`
     - Title: "Post a Gameplay Clip on X"
     - Reward: 150 PP
     - Type: One-time

2. **Implement Task Claiming Endpoint:**
   
   When a user clicks "Verify" and verification succeeds, the frontend will show a success message. 
   You should implement a backend endpoint to actually award the points, for example:
   
   ```
   POST /api/player-points/{address}/tasks/{taskId}/claim
   ```
   
   This endpoint should:
   - Verify the task hasn't been claimed before (check completed tasks)
   - Call `/api/social/twitter/verify` to verify the task
   - If verified, add the task to completed tasks and award PP
   - Return success/error response

3. **Alternative: Auto-claim on Verification:**
   
   You can modify the frontend's `handleVerifyTask` function to call your backend claiming endpoint directly after successful verification.

## Twitter API Integration (twitterapi.io)

The implementation uses [twitterapi.io](https://twitterapi.io) for Twitter/X API access.

### Endpoints Used:

1. **Get User Info by Username:**
   - `GET /v2/user/by/username/{username}`
   - Used to get user IDs for verification

2. **Get User Followings:**
   - `GET /v2/user/{userId}/following`
   - Used to check if user follows @bakelandxyz

3. **Get User Tweets:**
   - `GET /v2/user/{userId}/tweets?count=50`
   - Used to search for gameplay posts

### Authentication:

The implementation supports multiple authentication methods:
- API key in `X-API-Key` header (preferred)
- API key as query parameter `api_key=...`
- Bearer token (can be enabled if needed)

**Note:** You may need to adjust the endpoint paths and authentication method based on your specific twitterapi.io subscription plan and API documentation.

## Verification Logic

### Follow Verification:
1. Gets user ID from X handle
2. Gets @bakelandxyz user ID
3. Fetches user's following list
4. Checks if @bakelandxyz is in the following list

### Gameplay Post Verification:
1. Gets user ID from X handle
2. Fetches user's last 50 tweets
3. Searches for tweets that:
   - Mention @bakelandxyz (in text or mentions)
   - Contain gameplay-related keywords (bakeland, gameplay, game, playing, bakker, footage, clip, video, stream)
   - OR contain media (images/videos)

## Testing

1. **Set up environment variables:**
   ```bash
   TWITTER_API_KEY=your_key_here
   ```

2. **Test verification endpoints:**
   ```bash
   # Test follow verification
   curl -X POST http://localhost:3000/api/social/twitter/verify \
     -H "Content-Type: application/json" \
     -d '{"xHandle": "test_user", "taskType": "follow"}'
   
   # Test gameplay post verification
   curl -X POST http://localhost:3000/api/social/twitter/verify \
     -H "Content-Type: application/json" \
     -d '{"xHandle": "test_user", "taskType": "gameplay_post"}'
   ```

3. **Test task status:**
   ```bash
   curl "http://localhost:3000/api/social/twitter/tasks/status?address=wallet_address"
   ```

## Troubleshooting

### API Key Issues:
- Ensure `TWITTER_API_KEY` is set in `.env.local`
- Check that your twitterapi.io API key is valid
- Verify your API key has access to the required endpoints

### Endpoint Issues:
- If endpoints return 404, check the twitterapi.io documentation for correct endpoint paths
- You may need to adjust the base URL or endpoint structure based on your plan

### Authentication Issues:
- Try different authentication methods (header vs query parameter)
- Check twitterapi.io documentation for your specific authentication requirements

### Verification Not Working:
- Ensure user has connected their X account (xHandle is linked in backend)
- Check that user actually follows @bakelandxyz or has posted gameplay content
- Review API response structure - twitterapi.io response format may vary

## Next Steps

1. **Get twitterapi.io API Key:**
   - Sign up at https://twitterapi.io
   - Get your API key from the dashboard
   - Add it to `.env.local`

2. **Configure Backend:**
   - Add the two task definitions to your backend
   - Implement task claiming endpoint
   - Test the full flow

3. **Test End-to-End:**
   - Connect X account
   - Complete the social tasks
   - Verify tasks are claimable and rewards are awarded

4. **Adjust as Needed:**
   - Modify verification logic if needed
   - Adjust endpoint paths based on actual twitterapi.io API
   - Fine-tune gameplay post detection criteria
