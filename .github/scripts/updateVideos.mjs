import { google } from "googleapis";
import fs from "fs/promises";

const apiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.YOUTUBE_CHANNEL_ID;
const maxResults = 5;

const youtube = google.youtube({
  version: "v3",
  auth: apiKey,
});

const fetchLatestVideos = async () => {
  try {
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
    }));

    return videos;
  } catch (error) {
    console.error("Error fetching latest videos:", error.message);
    throw error;
  }
};

const updateReadme = async (videos) => {
  try {
    const readmePath = "README.md";
    let readmeContent = await fs.readFile(readmePath, "utf-8");

    const startTag = "<!-- latest-videos -->";
    const endTag = "<!-- latest-videos-end -->";
    const startIdx = readmeContent.indexOf(startTag) + startTag.length;
    const endIdx = readmeContent.indexOf(endTag);

    const videosMarkdown = videos
      .map(
        (video) =>
          `* [${video.title}](https://www.youtube.com/watch?v=${video.videoId})`
      )
      .join("\n");

    readmeContent = `${readmeContent.substring(
      0,
      startIdx
    )}\n${videosMarkdown}\n${readmeContent.substring(endIdx)}`;

    await fs.writeFile(readmePath, readmeContent, "utf-8");
    console.log("Updated README with latest videos.");
  } catch (error) {
    console.error("Error updating README:", error.message);
    throw error;
  }
};

const run = async () => {
  try {
    const videos = await fetchLatestVideos();
    await updateReadme(videos);
  } catch (error) {
    console.error("Workflow failed:", error.message);
    process.exit(1);
  }
};

run();
