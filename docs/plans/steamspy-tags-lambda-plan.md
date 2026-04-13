# Implementation Plan: SteamSpy Tags via Secondary Hydration Lambda

## Context and Goals
We want to enrich our Steam library data with community tags (and potentially other metadata) from SteamSpy. SteamSpy provides this data via a public API, but enforces a strict **1 request per second** rate limit.

Instead of modifying the primary Steam proxy Lambda to handle this synchronously or using DynamoDB, we will use an S3-to-S3 hydration pattern with a secondary background Lambda.

## The Architecture
- **Storage:** The existing S3 cache bucket.
- **Old Data:** Stored at `appdetails/${appid}.json.gz` (populated by the main Lambda).
- **New Data (Hydrated):** Stored at `appDetailsWithTags/${appid}.json.gz` (populated by the new Hydrator Lambda).
- **Compute:** A new secondary AWS Lambda function (`steamspy-hydrator`) that fetches SteamSpy data, merges it with the base Steam API data, and writes the new file.

---

## Phase 1: Manual Invocation MVP
**Goal:** Verify the data fetching, merging, and S3 writing logic works end-to-end for a single app before we automate anything.

1. **Create the Hydrator Lambda (Terraform & Code):**
   - Provision a new Lambda function in Terraform with access to the S3 bucket.
   - Code the handler to accept a manual payload containing an `appid` (e.g., `{"appid": 10}`).
2. **Resilient Fetching (Rate Limit & Noise):**
   - Implement **exponential backoff and retry** for SteamSpy requests. Since exit IPs might be shared or noisy, a simple 1.1s delay isn't enough; we need to catch HTTP 429s and wait longer.
3. **Execution Flow:**
   - Read `appdetails/${appid}.json.gz` from S3.
   - Fetch data from `https://steamspy.com/api.php?request=appdetails&appid=${appid}`.
   - Merge the SteamSpy data (specifically `tags`, and optionally review scores/owners) into the original JSON object.
   - **Handling Failures/Missing Data:**
     - If SteamSpy returns a non-retryable error (e.g., 404) or missing data, log the full response message and URI to CloudWatch.
     - In these cases, **still write** the original Steam API contents to `appDetailsWithTags/${appid}.json.gz`. This "marks it as processed" so the deduper doesn't try it again.
   - Compress and write the merged (or fallback) object to `appDetailsWithTags/${appid}.json.gz`.
4. **Validation:**
   - Manually invoke the Lambda via the AWS Console or CLI.
   - Verify we can easily retrieve and parse the execution logs from CloudWatch.
   - Download the resulting file from S3 and verify the schema looks correct.

## Phase 2: Automated Batch Hydration
**Goal:** Automate the hydrator to sweep the bucket and process missing games in batches, respecting the 1 request/second rate limit.

1. **Triggering Mechanism:**
   - Trigger the Hydrator Lambda asynchronously. This could be done by the primary Lambda when the `batch-appdetails` endpoint is hit, or run on a cron schedule via EventBridge.
2. **Bucket Traversal & Deduping:**
   - The Hydrator calls `ListObjectsV2` on the S3 bucket for the `appdetails/` prefix.
   - The Hydrator calls `ListObjectsV2` for the `appDetailsWithTags/` prefix.
   - It compares the two lists to find `appids` that exist in the base folder but are missing from the hydrated folder.
3. **Sequential Fetching:**
   - Take a batch of missing `appids` (e.g., up to 200).
   - Loop through them sequentially.
   - For each: Fetch from S3 -> Fetch from SteamSpy -> Merge -> Write to S3.
   - **Crucial:** Implement a strict `await sleep(1100)` (1.1 seconds) between SteamSpy requests.
   - At 1.1s per request, a batch of 200 will take roughly 3.6 - 4 minutes, fitting comfortably inside a standard 5-minute or 15-minute Lambda timeout.

## Phase 3: Recursive Queueing (Optional/Advanced)
**Goal:** Fully automate the hydration of a massive library without hitting Lambda timeout limits.

- At the end of a batch execution, if the Hydrator detects there are still remaining unhydrated `appids` in its deduplicated list, it asynchronously invokes itself (passing the remaining list in the event payload, or just telling itself to run again).
- This creates a self-winding loop that eventually finishes when `appdetails/` and `appDetailsWithTags/` are synchronized.

## Phase 4: Read from the Hydrated Cache
**Goal:** Serve the enriched data back to the client.

1. **Update Primary Lambda (`services/cache.js`):**
   - Modify `getFromCache(appid)` to check `appDetailsWithTags/${appid}.json.gz` first.
   - If found, return it.
   - If not found, fall back to fetching `appdetails/${appid}.json.gz`.
2. **Client-Side Buildout:**
   - Once data is flowing, update the `SteamGameData` TypeScript interfaces on the client.
   - We can then implement the UI sorting/filtering based on the new `tags` property without having made any new client-side API requests.

---

## Watch-Outs and Clarifications

1. **S3 List Pagination:** `ListObjectsV2` returns a maximum of 1,000 keys per page. We will need to handle pagination (using `ContinuationToken`) to get the full list of both directories if the user has more than 1,000 cached games.
2. **Missing SteamSpy Data (The "Infinite Loop" Risk):** Some obscure or delisted games exist on Steam but have no data on SteamSpy. If SteamSpy returns a 404 or empty data for an `appid`, we **must still write** a file to `appDetailsWithTags/${appid}.json.gz` (containing the original base Steam data). This prevents the deduper from repeatedly attempting to fetch dead apps. We will log the URI and error message for these cases to facilitate manual review.
3. **Trigger Architecture:** You mentioned having the primary lambda trigger the hydrator. We should use asynchronous invocation (e.g., `lambda.invoke({ InvocationType: 'Event' })`) so the primary Lambda can immediately return data to the user without waiting for the hydration sweep to finish.
4. **Data Merge Schema:** We should decide what exactly to merge. SteamSpy provides `tags`, but also `positive`/`negative` review counts, `owners`, and `ccu` (concurrent users). We should probably grab the tags and maybe the review ratio while we're at it, but keep the schema clean.
