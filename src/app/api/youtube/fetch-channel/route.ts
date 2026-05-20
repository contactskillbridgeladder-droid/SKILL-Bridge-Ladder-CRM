import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });
    }

    // Clean handle or channel ID from URL
    let cleaned = url.trim();
    let queryTarget = "";

    if (cleaned.includes("youtube.com/channel/")) {
      const parts = cleaned.split("youtube.com/channel/");
      queryTarget = "channel/" + parts[1].split("/")[0].split("?")[0];
    } else if (cleaned.includes("youtube.com/@")) {
      const parts = cleaned.split("youtube.com/@");
      queryTarget = "@" + parts[1].split("/")[0].split("?")[0];
    } else if (cleaned.startsWith("@")) {
      queryTarget = cleaned;
    } else if (cleaned.startsWith("UC") && cleaned.length === 24) {
      queryTarget = "channel/" + cleaned;
    } else {
      queryTarget = cleaned.includes("youtube.com/") ? "@" + cleaned.split("youtube.com/")[1].split("/")[0] : "@" + cleaned;
    }

    // Fetch Main page to get channel details
    const mainUrl = `https://www.youtube.com/${queryTarget}`;
    const mainRes = await fetch(mainUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    const mainHtml = await mainRes.text();

    // Extract metadata via meta tags
    const titleMatch = mainHtml.match(/<meta property="og:title" content="([^"]+)"/) || mainHtml.match(/<title>([^<]+)<\/title>/);
    const avatarMatch = mainHtml.match(/<meta property="og:image" content="([^"]+)"/) || mainHtml.match(/link rel="image_src" href="([^"]+)"/);
    
    let channelName = titleMatch ? titleMatch[1] : "YouTube Channel";
    // Replace html entities
    channelName = channelName.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    let avatarUrl = avatarMatch ? avatarMatch[1] : "";
    let subscriberCount = "";

    // Try to match subscriber count text in HTML (e.g. "1.24M subscribers")
    const subMatch = mainHtml.match(/"subscriberCountText":\s*\{\s*"simpleText":\s*"([^"]+)"/i) || 
                     mainHtml.match(/"simpleText":\s*"([^"]+subscribers)"/i) ||
                     mainHtml.match(/([0-9.]+[KMB]? subscribers)/i);
    if (subMatch) {
      subscriberCount = subMatch[1];
    }

    // Fetch Videos tab to get long videos
    const videosUrl = `https://www.youtube.com/${queryTarget}/videos`;
    const videosRes = await fetch(videosUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    });
    const videosHtml = await videosRes.text();

    // Fetch Shorts tab to get short videos
    const shortsUrl = `https://www.youtube.com/${queryTarget}/shorts`;
    const shortsRes = await fetch(shortsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    });
    const shortsHtml = await shortsRes.text();

    // Extract videos from ytInitialData
    const videosList: any[] = [];
    const shortsList: any[] = [];

    function parseYtInitialData(htmlText: string) {
      const match = htmlText.match(/var ytInitialData\s*=\s*({[\s\S]*?});/);
      if (!match) return null;
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        return null;
      }
    }

    const videosJson = parseYtInitialData(videosHtml);
    const shortsJson = parseYtInitialData(shortsHtml);

    function recursiveFind(obj: any, results: any[], type: "long" | "short") {
      if (!obj) return;
      if (typeof obj === "object") {
        // Long video renderer
        if (obj.gridVideoRenderer || obj.videoRenderer) {
          const r = obj.gridVideoRenderer || obj.videoRenderer;
          const videoId = r.videoId;
          const title = r.title?.runs?.[0]?.text || r.title?.simpleText;
          const thumbnail = r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const duration = r.lengthText?.simpleText || "";
          if (videoId && title && type === "long") {
            if (!results.some(v => v.videoId === videoId)) {
              results.push({ videoId, title, thumbnail, duration, type });
            }
          }
        }
        // Reel / Short renderer
        if (obj.reelItemRenderer) {
          const r = obj.reelItemRenderer;
          const videoId = r.videoId;
          const title = r.headline?.simpleText || r.headline?.runs?.[0]?.text;
          const thumbnail = r.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          if (videoId && title && type === "short") {
            if (!results.some(v => v.videoId === videoId)) {
              results.push({ videoId, title, thumbnail, duration: "", type });
            }
          }
        }
        for (const key in obj) {
          recursiveFind(obj[key], results, type);
        }
      }
    }

    if (videosJson) {
      recursiveFind(videosJson, videosList, "long");
    }
    if (shortsJson) {
      recursiveFind(shortsJson, shortsList, "short");
    }

    // RSS fallback if videos list is empty
    if (videosList.length === 0) {
      const channelIdMatch = mainHtml.match(/itemprop="channelId"\s+content="([^"]+)"/) || 
                             mainHtml.match(/channel_id=([^"&]+)/) ||
                             mainHtml.match(/"channelId":"([^"]+)"/);
      if (channelIdMatch) {
        const cid = channelIdMatch[1];
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
        const rssRes = await fetch(rssUrl);
        const rssText = await rssRes.text();
        
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let m;
        while ((m = entryRegex.exec(rssText)) !== null) {
          const entryHtml = m[1];
          const title = (entryHtml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
          const videoId = (entryHtml.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/) || [])[1] || "";
          const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const isShort = title.toLowerCase().includes("short") || title.toLowerCase().includes("#shorts");
          
          if (videoId && title) {
            if (isShort) {
              shortsList.push({ videoId, title, thumbnail, duration: "", type: "short" });
            } else {
              videosList.push({ videoId, title, thumbnail, duration: "", type: "long" });
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      channel: {
        name: channelName,
        handle: queryTarget.startsWith("@") ? queryTarget : "@" + channelName.toLowerCase().replace(/\s+/g, ""),
        youtubeUrl: mainUrl,
        avatarUrl,
        subscriberCount
      },
      videos: videosList,
      shorts: shortsList
    });

  } catch (error: any) {
    console.error("fetch-channel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
