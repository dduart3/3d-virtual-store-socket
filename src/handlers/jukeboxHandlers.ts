import { Server, Socket } from "socket.io";
import { UserManager } from "../managers/UserManager";
import ytdl from "@distube/ytdl-core";
import ytsr from "@distube/ytsr";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Create music directory if it doesn't exist
const MUSIC_DIR = path.join(__dirname, "../../public/music");
const TEMP_DIR = path.join(__dirname, "../../public/temp");

if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
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

const cookies = [
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408336,
      "hostOnly": false,
      "httpOnly": false,
      "name": "__Secure-1PAPISID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "zZNkcekP8NiF-k7t/A7eRtbh8m0YhgObGb",
      "id": 1
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408569,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-1PSID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "g.a000vAiOD4IJOHjTmO0QiLc-qR08QGGlvtN2fR4mhHi5aSSED3gGvS36pTXcvh6rIWcSSTw6iwACgYKAbESARMSFQHGX2Mi_lL5Vz89PY9YeiLrS9zsKBoVAUF8yKqoDypvbE8TdcC2z10faz8I0076",
      "id": 2
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1774286971.714075,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-1PSIDCC",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "AKEyXzUqVeJCEwPQ6yMOxWqqu1P6sjF2wmWDWDH-G78inXFcF1nF4L-62cF9oqehNnu_m2j-Bg",
      "id": 3
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1774286628.604584,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-1PSIDTS",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "sidts-CjIB7pHptRThfS6vd1QTPQBqTIlXKrcpe0q8U_JnTsNWNVF0FN0Xxg02IaiIqSQFMIBiDxAA",
      "id": 4
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408365,
      "hostOnly": false,
      "httpOnly": false,
      "name": "__Secure-3PAPISID",
      "path": "/",
      "sameSite": "no_restriction",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "zZNkcekP8NiF-k7t/A7eRtbh8m0YhgObGb",
      "id": 5
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408598,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-3PSID",
      "path": "/",
      "sameSite": "no_restriction",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "g.a000vAiOD4IJOHjTmO0QiLc-qR08QGGlvtN2fR4mhHi5aSSED3gGKSes0innrqDAbxk-vfLXaAACgYKAU8SARMSFQHGX2MipHYJ62eg7IyGvpilSlcHHBoVAUF8yKpbOtUZ1qMiN5G6pqEiABq30076",
      "id": 6
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1774286971.714115,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-3PSIDCC",
      "path": "/",
      "sameSite": "no_restriction",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "AKEyXzV30pq3RIR7oxDCZ_YpoCe9od552SGeT8jMHpABen4rZkZchIUCMVI1M9YrzLU1cA1pgQ",
      "id": 7
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1774286628.604663,
      "hostOnly": false,
      "httpOnly": true,
      "name": "__Secure-3PSIDTS",
      "path": "/",
      "sameSite": "no_restriction",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "sidts-CjIB7pHptRThfS6vd1QTPQBqTIlXKrcpe0q8U_JnTsNWNVF0FN0Xxg02IaiIqSQFMIBiDxAA",
      "id": 8
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408275,
      "hostOnly": false,
      "httpOnly": false,
      "name": "APISID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": false,
      "session": false,
      "storeId": "0",
      "value": "2JvaKOZiNGOhiJST/A2Qaax6utK9iFXjGu",
      "id": 9
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1742751134,
      "hostOnly": false,
      "httpOnly": false,
      "name": "CONSISTENCY",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "AKreu9v9-vqACLUMo-_GCbDtHPgc5q7BS6rPNqpRbl2lpcYwzbni0pg4NJ0fT66PycPFjYs9rJqGAsj2E91kwcRrWsiyj2GrIIP4zUjNjpz9e64B1qlHa9DkNnE",
      "id": 10
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1742751760.308302,
      "hostOnly": false,
      "httpOnly": true,
      "name": "GPS",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "1",
      "id": 11
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408191,
      "hostOnly": false,
      "httpOnly": true,
      "name": "HSID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": false,
      "session": false,
      "storeId": "0",
      "value": "AId-ELltZmQJkt9RN",
      "id": 12
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.267828,
      "hostOnly": false,
      "httpOnly": true,
      "name": "LOGIN_INFO",
      "path": "/",
      "sameSite": "no_restriction",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "AFmmF2swRQIgNkm1EjG1GjVkfxFGciQrtyl2eNBd3D9EPw7fO7c-SXECIQDlg5wQKK5AU52VPkBeOzRZSrrsnWjCwClxi8nXExlFMg:QUQ3MjNmeVhac3dDLUFmdTNGUzgwZEliRDRUVmFKLW54alRjQ3VzXzlrTzNUUFluanZ4eUttM3RkSTdIZUZvZmhkSm12Q2tDRXBLNHpQZmh0bDczVzFFclpIRGJVM3hzOFJWUlhoUS1DbGVjUGpDWTlRcmV0ejB0YmN3Ymp0NVVkN2xJTzhFVDFTWld0b2pEemdZM25HWkRla0EtOWZWamJ3",
      "id": 13
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310797.478326,
      "hostOnly": false,
      "httpOnly": false,
      "name": "PREF",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "f4=4000000&tz=America.Caracas&f6=400&f7=100",
      "id": 14
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408307,
      "hostOnly": false,
      "httpOnly": false,
      "name": "SAPISID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "zZNkcekP8NiF-k7t/A7eRtbh8m0YhgObGb",
      "id": 15
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408541,
      "hostOnly": false,
      "httpOnly": false,
      "name": "SID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": false,
      "session": false,
      "storeId": "0",
      "value": "g.a000vAiOD4IJOHjTmO0QiLc-qR08QGGlvtN2fR4mhHi5aSSED3gGhNQMzwH8mbeTnCcbhwvt7wACgYKAYMSARMSFQHGX2MiE4QXWkf8riVxiyN6s20zuxoVAUF8yKonCa-CYxymi8PIfdJBTIFb0076",
      "id": 16
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1774286971.713996,
      "hostOnly": false,
      "httpOnly": false,
      "name": "SIDCC",
      "path": "/",
      "sameSite": "unspecified",
      "secure": false,
      "session": false,
      "storeId": "0",
      "value": "AKEyXzW5grweJi8UzbFIbOjYagqxiEDJRYG8UsZabqoFIC83VuQVwE1qgevFcUgRCsPtjsurdQ",
      "id": 17
  },
  {
      "domain": ".youtube.com",
      "expirationDate": 1777310026.408246,
      "hostOnly": false,
      "httpOnly": true,
      "name": "SSID",
      "path": "/",
      "sameSite": "unspecified",
      "secure": true,
      "session": false,
      "storeId": "0",
      "value": "A4G2X4EQmf9smYCR0",
      "id": 18
  }
]

/* 

const agentOptions = {
  pipelining: 5,
  maxRedirections: 0,
  localAddress: "127.0.0.1",
};
*/

// agent should be created once if you don't want to change your cookie

export function setupJukeboxHandlers(
  io: Server,
  socket: Socket,
  userManager: UserManager
) {
  const agent = ytdl.createAgent(cookies);

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

      isProcessing = true;
      io.emit("jukebox:processing", true);

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

      console.log(`Descargando canción de YouTube: ${videoId}`);

      // Get video info
      const info = await ytdl.getInfo(videoUrl, { agent });
     
      // Find 360p format with both audio and video
      const format = ytdl.chooseFormat(info.formats, { 
        quality: 'highestaudio',
        filter: 'audioonly' 
      });
     
      if (!format) {
        throw new Error("No se encontró un formato compatible para este video");
      }
     
     
      // Generate unique filenames
      const tempVideoFile = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp4`);
      const finalMp3File = path.join(MUSIC_DIR, `${videoId}_${Date.now()}.mp3`);
      const publicMp3Path = `music/${path.basename(finalMp3File)}`;
     
      // Download the video with the specific format
      const videoStream = ytdl(videoUrl, { format: format, agent });
      const videoWriteStream = fs.createWriteStream(tempVideoFile);
     
      let downloadError = false;
     
      // Handle video download errors
      videoStream.on('error', (err) => {
        console.error("Error downloading video:", err);
        downloadError = true;
       
        // Clean up
        if (fs.existsSync(tempVideoFile)) {
          fs.unlinkSync(tempVideoFile);
        }
       
        isProcessing = false;
        io.emit("jukebox:processing", false);
       
        if (callback) {
          callback({
            success: false,
            error: "Error al descargar el video: " + err.message
          });
        }
      });
     
      videoWriteStream.on('error', (err) => {
        console.error("Error writing video file:", err);
        downloadError = true;
       
        // Clean up
        if (fs.existsSync(tempVideoFile)) {
          fs.unlinkSync(tempVideoFile);
        }
       
        isProcessing = false;
        io.emit("jukebox:processing", false);
       
        if (callback) {
          callback({
            success: false,
            error: "Error al guardar el video: " + err.message
          });
        }
      });
     
      // Pipe video to file
      videoStream.pipe(videoWriteStream);
     
      // When video download is complete, convert to MP3
      videoWriteStream.on('finish', () => {
        if (downloadError) return;
       
        console.log(`Video descargado, convirtiendo a MP3: ${info.videoDetails.title}`);
       
        // Convert video to MP3 using ffmpeg
        ffmpeg(tempVideoFile)
          .noVideo()
          .audioCodec('libmp3lame')
          .audioBitrate(192)
          .on('error', (err) => {
            console.error("Error converting to MP3:", err);
           
            // Clean up
            if (fs.existsSync(tempVideoFile)) {
              fs.unlinkSync(tempVideoFile);
            }
           
            isProcessing = false;
            io.emit("jukebox:processing", false);
           
            if (callback) {
              callback({
                success: false,
                error: "Error al convertir a MP3: " + err.message
              });
            }
          })
          .on('end', () => {
            console.log(`Conversión a MP3 completada: ${info.videoDetails.title}`);
           
            // Clean up temp video file
            if (fs.existsSync(tempVideoFile)) {
              fs.unlinkSync(tempVideoFile);
            }
           
            // Verify MP3 file exists and has content
            if (!fs.existsSync(finalMp3File) || fs.statSync(finalMp3File).size === 0) {
              console.error("MP3 conversion failed or file is empty");
             
              isProcessing = false;
              io.emit("jukebox:processing", false);
             
              if (callback) {
                callback({
                  success: false,
                  error: "La conversión a MP3 falló o el archivo está vacío"
                });
              }
              return;
            }
           
            // Create song object
            const song: Song = {
              id: videoId,
              title: info.videoDetails.title,
              artist: info.videoDetails.author.name,
              duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
              thumbnail: info.videoDetails.thumbnails[0]?.url || "",
              url: videoUrl,
              filePath: `/public/${publicMp3Path}`, // Public URL path
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
                message: "Canción añadida a la cola"
              });
            }
          })
          .save(finalMp3File);
      });
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
    socket.emit("jukebox:nowPlaying", currentSong ? {
      ...currentSong,
      startTime: currentSongStartTime
    } : null);

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
  });

  // Handle song ended event - we'll keep this for redundancy
  socket.on("jukebox:songEnded", () => {
    console.log("Client reported song ended");
    // We don't immediately start the next song here anymore
    // The server timer will handle it
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
        serverTime: currentTime
      });
    }
  });

  // Handle volume change
  socket.on("jukebox:setVolume", (data: { volume: number }) => {
    // Broadcast volume change to all clients
    io.emit("jukebox:volumeChange", { volume: data.volume });
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

    // Send system message about now
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
      startTime: currentSongStartTime // Add this to sync clients
    });

    // Update queue info
    updateClientsWithQueueInfo(io);

    // Calculate song duration in milliseconds
    const durationParts = currentSong.duration.split(":");
    let durationMs = 0;

    if (durationParts.length === 2) {
      // Format: MM:SS
      durationMs = (parseInt(durationParts[0]) * 60 + parseInt(durationParts[1])) * 1000;
    } else if (durationParts.length === 3) {
      // Format: HH:MM:SS
      durationMs = (parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2])) * 1000;
    }

    // Add a small buffer to ensure the song finishes playing
    durationMs += 2000;

    // Set a server-side timer for the next song
    currentSongTimer = setTimeout(() => {
      console.log(`Server timer: Song "${currentSong?.title}" finished playing after ${durationMs}ms`);
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

// Helper function to format duration in seconds to MM:SS format
function formatDuration(seconds: number): string {
  if (seconds < 3600) {
    // Format as MM:SS
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    // Format as HH:MM:SS
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }
}
