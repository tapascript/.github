import { google } from "googleapis";
import fs from "fs/promises";

// Logging helpers
const log = (msg) => console.log(`[YT WORKFLOW] ${msg}`);
const errorLog = (msg) => console.error(`[YT ERROR] ${msg}`);

// Env vars
const apiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.YOUTUBE_CHANNEL_ID;
const maxResults = 5;

// YouTube client
const youtube = google.youtube({
  version: "v3",
  auth: apiKey,
});

// Retry logic
const fetchLatestVideos = async (retries = 3, delay = 1000) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      log(`Fetching latest ${maxResults} videos from channel...`);

      const response = await youtube.search.list({
        part: "snippet",
        channelId,
        order: "date",
        type: "video",
        maxResults,
      });

      const videos = response.data.items.map((item) => ({
        title: item.snippet.title,
        videoId: item.id.videoId,
        thumbnail: item.snippet.thumbnails.medium.url,
        description: item.snippet.description,
      }));

      return videos;
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.message || "Unknown error";

      errorLog(`Attempt ${attempt + 1} failed: ${message}`);

      if (status === 429 || (status >= 500 && status < 600)) {
        if (attempt < retries - 1) {
          log(`Retrying after ${delay}ms...`);
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
        } else {
          errorLog("Max retries reached. Failing.");
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
};

const updateReadme = async (videos, readmePath) => {
  try {
    let readmeContent = await fs.readFile(readmePath, "utf-8");

    const startTag = "<!-- latest-videos -->";
    const endTag = "<!-- latest-videos-end -->";
    const startIdx = readmeContent.indexOf(startTag) + startTag.length;
    const endIdx = readmeContent.indexOf(endTag);

    if (startIdx === -1 || endIdx === -1) {
      throw new Error("Start or end tags not found in README.");
    }

    const videosMarkdown = `
<table border="0">
  ${videos
    .map(
      (video) => `
  <tr>
    <td style="padding: 10px; vertical-align: top;">
      <a href="https://www.youtube.com/watch?v=${
        video.videoId
      }" target="_blank">
        <img width="150" src="https://img.youtube.com/vi/${
          video.videoId
        }/mqdefault.jpg" alt="${video.title}">
      </a>
    </td>
    <td style="padding: 10px; vertical-align: top;">
      <a href="https://www.youtube.com/watch?v=${
        video.videoId
      }" target="_blank">
        <strong>${video.title}</strong>
      </a>
      <br/>
      <p>${video.description?.replace(/\n/g, " ").slice(0, 300).trim()}...</p>
    </td>
  </tr>
  `
    )
    .join("")}
</table>
`;

    readmeContent = `${readmeContent.substring(
      0,
      startIdx
    )}\n${videosMarkdown.trim()}\n${readmeContent.substring(endIdx)}`;

    await fs.writeFile(readmePath, readmeContent, "utf-8");
    log("✅ README successfully updated with latest videos.");
  } catch (error) {
    errorLog("Error updating README: " + error.message);
    throw error;
  }
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
