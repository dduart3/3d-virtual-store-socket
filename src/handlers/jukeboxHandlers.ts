import { Server, Socket } from "socket.io";
import { UserManager } from "../managers/UserManager";
import ytsr from "@distube/ytsr";
import fs from "fs";
import path from "path";
import youtubeDl from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";
const cookiesFile = path.join(__dirname, "../../cookies.txt");

// Create music directory if it doesn't exist
const MUSIC_DIR = path.join(__dirname, "../../public/music");
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

// Define YouTube-DL response type
interface YouTubeDlResponse {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  formats: any[];
  extractor: string;
  webpage_url: string;
  // Add other properties as needed
}

// Jukebox state
interface Song {
  id: string;
  title: string;
  artist?: string;
  duration: string;
  thumbnail: string;
  url: string;
  filePath: string;
  addedBy: string;
}

let currentSong: Song | null = null;
let songQueue: Song[] = [];
let isProcessing = false;
let currentSongStartTime = 0;
let currentSongTimer: NodeJS.Timeout | null = null;
let currentVolume = 0.2; // Default volume (50%)

// For search results
interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: string;
  thumbnail: string;
  url: string;
}

// Rate limiting
const RATE_LIMIT = {
  minTimeBetweenSearches: 2000, // 2 seconds between searches
  maxResults: 5, // Maximum number of results to return
};

// Track last search time per user
const lastSearchTime: Record<string, number> = {};

export function setupJukeboxHandlers(
  io: Server,
  socket: Socket,
  userManager: UserManager
) {
  // Send current jukebox state when a user connects
  socket.emit("jukebox:state", {
    currentSong,
    queue: songQueue.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      thumbnail: song.thumbnail,
      addedBy: song.addedBy,
      filePath: song.filePath,
    })),
    isProcessing,
  });

  // Handle YouTube search requests
  socket.on("jukebox:search", async (query: string, callback) => {
    try {
      const user = userManager.getUserBySocketId(socket.id);
      if (!user) return;
      console.log(`${user.username} está buscando: ${query}`);

      // Apply rate limiting
      const now = Date.now();
      if (
        lastSearchTime[user.id] &&
        now - lastSearchTime[user.id] < RATE_LIMIT.minTimeBetweenSearches
      ) {
        if (callback) {
          callback({
            success: false,
            error:
              "Por favor, espera un momento antes de realizar otra búsqueda.",
          });
        }
        return;
      }

      // Update last search time
      lastSearchTime[user.id] = now;

      // Validate query
      if (!query || typeof query !== "string" || query.length < 2) {
        if (callback) {
          callback({
            success: false,
            error: "La búsqueda debe tener al menos 2 caracteres.",
          });
        }
        return;
      }

      console.log(`Búsqueda de música por ${user.username}: "${query}"`);

      // Perform the search
      const searchResults = await ytsr(query, { limit: RATE_LIMIT.maxResults });

      // Format the results
      const formattedResults: SearchResult[] = searchResults.items
        .filter((item: { type: string }) => item.type === "video")
        .map((item: ytsr.Video) => {
          const video = item as ytsr.Video;
          return {
            id: video.id,
            title: video.name,
            artist: video.author?.name || "Desconocido",
            duration: video.duration || "Desconocido",
            thumbnail: video.thumbnail || "",
            url: video.url,
          };
        });

      // Return results via callback
      if (callback) {
        callback({
          success: true,
          results: formattedResults,
        });
      }
    } catch (error) {
      console.error("Error en búsqueda de música:", error);

      if (callback) {
        callback({
          success: false,
          error: "Ocurrió un error al buscar canciones.",
        });
      }
    }
  });

  // Handle adding a song to the queue
  socket.on("jukebox:addSong", async (songData: any, callback) => {
    try {
      const user = userManager.getUserBySocketId(socket.id);
      if (!user) return;

      console.log(`${user.username} está añadiendo una canción a la cola`);

      let videoId: string;
      let videoUrl: string;

      // Handle direct URL or video ID
      if (songData.url && songData.url.includes("youtube.com")) {
        // Extract video ID from URL
        const urlObj = new URL(songData.url);
        videoId = urlObj.searchParams.get("v") || "";
        videoUrl = songData.url;
      } else if (songData.id) {
        // Use provided video ID
        videoId = songData.id;
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      } else {
        throw new Error("URL o ID de video inválido");
      }

      if (!videoId) {
        throw new Error("No se pudo extraer el ID del video");
      }

      // Generate filename based only on videoId
      const mp3Filename = `${videoId}.mp3`;
      const finalMp3File = path.join(MUSIC_DIR, mp3Filename);
      const publicMp3Path = `/public/music/${mp3Filename}`;

      // Check if the file already exists
      const fileExists =
        fs.existsSync(finalMp3File) && fs.statSync(finalMp3File).size > 0;

      let videoInfo: YouTubeDlResponse;

      if (fileExists) {
        console.log(`El archivo ya existe para ${videoId}, omitiendo descarga`);

        // We still need to get video info for metadata
        isProcessing = true;
        io.emit("jukebox:processing", true);

        videoInfo = (await youtubeDl(videoUrl, {
          dumpSingleJson: true,
          noWarnings: true,
          callHome: false,
          preferFreeFormats: true,
          youtubeSkipDashManifest: true,
          cookies: cookiesFile,
        })) as YouTubeDlResponse;
      } else {
        console.log(`Descargando audio de YouTube: ${videoId}`);

        isProcessing = true;
        io.emit("jukebox:processing", true);

        // Get video info first to extract metadata
        videoInfo = (await youtubeDl(videoUrl, {
          dumpSingleJson: true,
          noWarnings: true,
          callHome: false,
          preferFreeFormats: true,
          youtubeSkipDashManifest: true,
          cookies: cookiesFile,
        })) as YouTubeDlResponse;

        // Download audio directly as MP3 using youtube-dl-exec
        await youtubeDl(videoUrl, {
          extractAudio: true,
          audioFormat: "mp3",
          audioQuality: 0, // Best quality
          output: finalMp3File,
          noWarnings: true,
          callHome: false,
          preferFreeFormats: true,
          youtubeSkipDashManifest: true,
          cookies: cookiesFile,
          ...(ffmpegPath ? { ffmpegLocation: ffmpegPath } : {}), // Only add if not null
        });

        // Verify MP3 file exists and has content
        if (
          !fs.existsSync(finalMp3File) ||
          fs.statSync(finalMp3File).size === 0
        ) {
          throw new Error("La descarga de audio falló o el archivo está vacío");
        }

        console.log(`Descarga de audio completada: ${videoInfo.title}`);
      }

      // Format duration
      const durationInSeconds = videoInfo.duration;
      const formattedDuration = formatDuration(durationInSeconds);

      // Create song object
      const song: Song = {
        id: videoId,
        title: videoInfo.title,
        artist: videoInfo.uploader || "Desconocido",
        duration: formattedDuration,
        thumbnail: videoInfo.thumbnail || "",
        url: videoUrl,
        filePath: publicMp3Path, // Public URL path
        addedBy: songData.addedBy || user.username,
      };

      // Add to queue
      songQueue.push(song);

      // Send system message to chat
      const chatMessage = {
        id: `system-jukebox-${Date.now()}`,
        sender: "Sistema",
        content: `${song.addedBy} ha añadido "${song.title}" a la cola de reproducción.`,
        type: "system",
        timestamp: Date.now(),
        read: false,
      };

      io.emit("chat:message", chatMessage);

      // If no song is playing, start playing this one
      if (!currentSong) {
        startNextSong(io);
      } else {
        // Just update the queue for all clients
        updateClientsWithQueueInfo(io);
      }

      isProcessing = false;
      io.emit("jukebox:processing", false);

      // Return success to the client
      if (callback) {
        callback({
          success: true,
          message: fileExists
            ? "Canción añadida a la cola (desde caché)"
            : "Canción añadida a la cola",
        });
      }
    } catch (error) {
      console.error("Error al añadir canción:", error);
      isProcessing = false;
      io.emit("jukebox:processing", false);

      if (callback) {
        callback({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Error al procesar la canción",
        });
      }
    }
  });

  // Handle get state requests
  socket.on("jukebox:getState", () => {
    socket.emit(
      "jukebox:nowPlaying",
      currentSong
        ? {
            ...currentSong,
            startTime: currentSongStartTime,
          }
        : null
    );

    socket.emit(
      "jukebox:queueUpdate",
      songQueue.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
        thumbnail: song.thumbnail,
        addedBy: song.addedBy,
        filePath: song.filePath,
      }))
    );

    socket.emit("jukebox:processing", isProcessing);
    socket.emit("jukebox:volumeChange", { volume: currentVolume });
  });

  // Handle sync request for clients joining mid-song
  socket.on("jukebox:sync", () => {
    if (currentSong && currentSongStartTime > 0) {
      // Calculate how far into the song we are
      const currentTime = Date.now();
      const elapsedTime = currentTime - currentSongStartTime;

      socket.emit("jukebox:sync", {
        song: {
          id: currentSong.id,
          title: currentSong.title,
          artist: currentSong.artist,
          duration: currentSong.duration,
          thumbnail: currentSong.thumbnail,
          url: currentSong.url,
          filePath: currentSong.filePath,
          addedBy: currentSong.addedBy,
        },
        elapsedTime: elapsedTime,
        serverTime: currentTime,
      });
    }
  });

  // Handle volume change
  socket.on("jukebox:setVolume", (data: { volume: number }) => {
    // Store the current volume
    currentVolume = data.volume;

    // Broadcast volume change to all clients
    io.emit("jukebox:volumeChange", { volume: currentVolume });
  });

  socket.on("jukebox:getVolume", () => {
    // Send the current volume to the client that requested it
    socket.emit("jukebox:volumeChange", { volume: currentVolume });
  });
}

// Start playing the next song in the queue
function startNextSong(io: Server) {
  // Clear any existing timer
  if (currentSongTimer) {
    clearTimeout(currentSongTimer);
    currentSongTimer = null;
  }

  if (songQueue.length === 0) {
    currentSong = null;
    currentSongStartTime = 0;

    // Send system message that queue is empty
    const chatMessage = {
      id: `system-jukebox-${Date.now()}`,
      sender: "Sistema",
      content: "No queda ninguna canción en la cola.",
      type: "system",
      timestamp: Date.now(),
      read: false,
    };

    io.emit("chat:message", chatMessage);
    io.emit("jukebox:nowPlaying", null);

    return;
  }

  // Get the next song from the queue
  currentSong = songQueue.shift() || null;

  if (currentSong) {
    // Record the start time
    currentSongStartTime = Date.now();

    // Send system message about now playing
    const chatMessage = {
      id: `system-jukebox-${Date.now()}`,
      sender: "Sistema",
      content: `Reproduciendo "${currentSong.title}" añadida por ${currentSong.addedBy}.`,
      type: "system",
      timestamp: Date.now(),
      read: false,
    };
    io.emit("chat:message", chatMessage);

    // Notify clients about the now playing song with the start time
    io.emit("jukebox:nowPlaying", {
      id: currentSong.id,
      title: currentSong.title,
      artist: currentSong.artist,
      duration: currentSong.duration,
      thumbnail: currentSong.thumbnail,
      url: currentSong.url,
      filePath: currentSong.filePath,
      addedBy: currentSong.addedBy,
      startTime: currentSongStartTime, // Add this to sync clients
    });

    // Update queue info
    updateClientsWithQueueInfo(io);

    // Calculate song duration in milliseconds
    const durationParts = currentSong.duration.split(":");
    let durationMs = 0;

    if (durationParts.length === 2) {
      // Format: MM:SS
      durationMs =
        (parseInt(durationParts[0]) * 60 + parseInt(durationParts[1])) * 1000;
    } else if (durationParts.length === 3) {
      // Format: HH:MM:SS
      durationMs =
        (parseInt(durationParts[0]) * 3600 +
          parseInt(durationParts[1]) * 60 +
          parseInt(durationParts[2])) *
        1000;
    }

    // Add a small buffer to ensure the song finishes playing
    durationMs += 2000;

    // Set a server-side timer for the next song
    currentSongTimer = setTimeout(() => {
      console.log(
        `Server timer: Song "${currentSong?.title}" finished playing after ${durationMs}ms`
      );
      startNextSong(io);
    }, durationMs);
  }
}

// Update all clients with the current queue information
function updateClientsWithQueueInfo(io: Server) {
  io.emit(
    "jukebox:queueUpdate",
    songQueue.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      thumbnail: song.thumbnail,
      addedBy: song.addedBy,
      filePath: song.filePath,
    }))
  );
}

// Helper function to format duration in seconds to MM:SS forma

// Helper function to format duration in seconds to MM:SS format
function formatDuration(seconds: number): string {
  if (seconds < 3600) {
    // Format as MM:SS
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    // Format as HH:MM:SS
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
}
