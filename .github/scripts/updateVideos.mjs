import { google } from "googleapis";
import fs from "fs/promises";

// Logging helpers
const log = (msg) => console.log(`[YT WORKFLOW] ${msg}`);
const errorLog = (msg) => console.error(`[YT ERROR] ${msg}`);

// Envs
const apiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.YOUTUBE_CHANNEL_ID;
const channelIdBangla = process.env.YOUTUBE_CHANNEL_ID_BANGLA;

// Constants
const VIDEOS_PER_CHANNEL = 3;
const EXPECTED_CHANNEL_COUNT = 2;

// YouTube client
const youtube = google.youtube({
  version: "v3",
  auth: apiKey,
});

const getUploadsPlaylistId = async (channelId) => {
  const res = await youtube.channels.list({
    part: "contentDetails",
    id: channelId,
  });

  const playlistId =
    res.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!playlistId) {
    throw new Error(`Could not find uploads playlist for channel ${channelId}`);
  }

  return playlistId;
};

const fetchFromUploadsPlaylist = async (playlistId) => {
  const res = await youtube.playlistItems.list({
    part: "snippet",
    playlistId,
    maxResults: VIDEOS_PER_CHANNEL,
  });

  return res.data.items.map((item) => ({
    title: item.snippet.title,
    videoId: item.snippet.resourceId.videoId,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
  }));
};

const fetchLatestVideos = async (retries = 3, delay = 1000) => {
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is missing");
  }

  const channels = [
    { id: channelId, label: "English" },
    { id: channelIdBangla, label: "Bangla" },
  ].filter((c) => c.id);

  // SAFETY ASSERTION
  if (channels.length !== EXPECTED_CHANNEL_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_CHANNEL_COUNT} channels, found ${channels.length}`,
    );
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      log(`Fetching ${VIDEOS_PER_CHANNEL} videos from each channel...`);

      const videosPerChannel = await Promise.all(
        channels.map(async (channel) => {
          const playlistId = await getUploadsPlaylistId(channel.id);
          const videos = await fetchFromUploadsPlaylist(playlistId);

          if (videos.length !== VIDEOS_PER_CHANNEL) {
            throw new Error(
              `Channel "${channel.label}" returned ${videos.length} videos`,
            );
          }

          return videos.map((v) => ({
            ...v,
            channel: channel.label,
          }));
        }),
      );

      const videos = videosPerChannel.flat();

      if (videos.length !== EXPECTED_CHANNEL_COUNT * VIDEOS_PER_CHANNEL) {
        throw new Error(
          `Expected ${EXPECTED_CHANNEL_COUNT * VIDEOS_PER_CHANNEL} total videos, got ${videos.length}`,
        );
      }

      // sort newest first across both channels
      return videos.sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
      );
    } catch (error) {
      const status = error?.response?.status;
      errorLog(`Attempt ${attempt + 1} failed: ${error.message}`);

      if (
        attempt < retries - 1 &&
        (status === 429 || (status >= 500 && status < 600))
      ) {
        log(`Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
};

const updateReadme = async (videos, readmePath) => {
  const startTag = "<!-- latest-videos -->";
  const endTag = "<!-- latest-videos-end -->";

  let content = await fs.readFile(readmePath, "utf-8");

  if (!content.includes(startTag) || !content.includes(endTag)) {
    throw new Error(`Tags missing in ${readmePath}`);
  }

  const table = `
<table>
${videos
  .map(
    (v) => `
<tr>
  <td width="160">
    <a href="https://www.youtube.com/watch?v=${v.videoId}">
      <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" width="150"/>
    </a>
  </td>
  <td>
    <a href="https://www.youtube.com/watch?v=${v.videoId}">
      <strong>${v.title}</strong>
    </a>
    <br/>
    ${v.description?.replace(/\n/g, " ").slice(0, 200)}...
  </td>
</tr>`,
  )
  .join("")}
</table>
`.trim();

  const updated = content.replace(
    new RegExp(`${startTag}[\\s\\S]*?${endTag}`, "m"),
    `${startTag}\n\n${table}\n\n${endTag}`,
  );

  await fs.writeFile(readmePath, updated, "utf-8");
  log(`Updated ${readmePath}`);
};

const run = async () => {
  try {
    const videos = await fetchLatestVideos();
    await updateReadme(videos, "profile/README.md");
    await updateReadme(videos, "README.md");
  } catch (error) {
    errorLog("Workflow failed: " + error.message);
    process.exit(1);
  }
};

run();
