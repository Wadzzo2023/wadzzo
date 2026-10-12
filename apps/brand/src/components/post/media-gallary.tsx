"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Music,
  Film,
  ImageIcon,
  X,
  Forward,
  Rewind,
  MinusCircle,
  FastForward,
  Minimize2,
} from "lucide-react";
import { cn } from "@wadzzo/ui/lib/cn";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import type { MediaType } from "@wadzzo/db";
import { platformBranding } from "@wadzzo/platform/branding";

interface MediaItem {
  id: number;
  url: string;
  type: MediaType;
  title?: string | null;
  artist?: string | null;
  thumbnail?: string | null;
}

interface MediaGalleryProps {
  fullHeight?: boolean; // Optional prop to control height
  media: MediaItem[];
  initialIndex?: number;
  autoPlay?: boolean;
  onClose?: () => void;
}

export default function MediaGallery({
  media,
  initialIndex = 0,
  autoPlay = false,
  onClose,
  fullHeight,
}: MediaGalleryProps) {
  return (
    <MediaGalleryContent
      media={media}
      initialIndex={initialIndex}
      autoPlay={autoPlay}
      onClose={onClose}
      fullHeight={fullHeight}
    />
  );
}

function MediaGalleryContent({
  media,
  initialIndex = 0,
  autoPlay = false,
  onClose,
  fullHeight,
}: MediaGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Controls hide 3s after playback starts unless paused or hovered (in fullscreen, moving the mouse shows them again).
  const [timerHidden, setTimerHidden] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isVolumeSliderVisible, setIsVolumeSliderVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get current media item
  const currentMedia = media[currentIndex];

  // Reset playback state when changing media (adjusted during render, no extra pass)
  const [shownIndex, setShownIndex] = useState(currentIndex);
  if (shownIndex !== currentIndex) {
    setShownIndex(currentIndex);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  // Handle media element initialization and cleanup
  useEffect(() => {
    if (!media || media.length === 0 || !currentMedia) return;

    let isMounted = true;
    const audioCurrent = audioRef.current;
    const videoCurrent = videoRef.current;

    const currentMediaType = currentMedia.type;

    const initializeMedia = async () => {
      if (currentMediaType === "MUSIC" && audioCurrent) {
        audioCurrent.muted = isMuted;
        audioCurrent.volume = volume;

        if (isPlaying) {
          try {
            await audioCurrent.play();
          } catch (err) {
            console.error("Error playing audio:", err);
            if (isMounted) {
              setIsPlaying(false);
            }
          }
        }
      } else if (currentMediaType === "VIDEO" && videoCurrent) {
        videoCurrent.muted = isMuted;
        videoCurrent.volume = volume;

        if (isPlaying) {
          try {
            await videoCurrent.play();
          } catch (err) {
            console.error("Error playing video:", err);
            if (isMounted) {
              setIsPlaying(false);
            }
          }
        }
      }

      // Auto-play if needed
      if (autoPlay && !isPlaying) {
        setIsPlaying(true);

        if (currentMediaType === "MUSIC" && audioCurrent) {
          try {
            await audioCurrent.play();
          } catch (err) {
            console.error("Auto-play failed:", err);
            if (isMounted) {
              setIsPlaying(false);
            }
          }
        } else if (currentMediaType === "VIDEO" && videoCurrent) {
          try {
            await videoCurrent.play();
          } catch (err) {
            console.error("Auto-play failed:", err);
            if (isMounted) {
              setIsPlaying(false);
            }
          }
        }
      }
    };

    void initializeMedia();

    return () => {
      isMounted = false;
      if (audioCurrent) {
        audioCurrent.pause();
      }
      if (videoCurrent) {
        videoCurrent.pause();
      }
    };
  }, [media, currentIndex, isPlaying, isMuted, autoPlay, currentMedia, volume]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isInFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isInFullscreen);
      setTimerHidden(false);

      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Auto-hide controls - but keep them visible in fullscreen mode
  const controlsKey = `${isPlaying}-${isHovering}-${isFullscreen}`;
  const [shownControlsKey, setShownControlsKey] = useState(controlsKey);
  if (shownControlsKey !== controlsKey) {
    setShownControlsKey(controlsKey);
    setTimerHidden(false); // any change brings the controls back
  }
  const showControls = !isPlaying || (isHovering && !isFullscreen) || !timerHidden;
  useEffect(() => {
    if (!isPlaying || (isHovering && !isFullscreen)) return;
    controlsTimeoutRef.current = setTimeout(() => setTimerHidden(true), 3000);
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, isHovering, isFullscreen]);

  // Toggle play function
  const togglePlay = () => {
    if (!currentMedia) return;

    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (currentMedia.type === "MUSIC" && audioRef.current) {
      if (newIsPlaying) {
        void audioRef.current.play().catch((err) => {
          console.error("Error playing audio:", err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    } else if (currentMedia.type === "VIDEO" && videoRef.current) {
      if (newIsPlaying) {
        void videoRef.current.play().catch((err) => {
          console.error("Error playing video:", err);
          setIsPlaying(false);
        });
      } else {
        videoRef.current.pause();
      }
    }
  };

  // Toggle mute function
  const toggleMute = () => {
    const newIsMuted = !isMuted;
    setIsMuted(newIsMuted);

    if (currentMedia?.type === "MUSIC" && audioRef.current) {
      audioRef.current.muted = newIsMuted;
    } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
      videoRef.current.muted = newIsMuted;
    }
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    setVolume(newVolume);

    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }

    if (currentMedia?.type === "MUSIC" && audioRef.current) {
      audioRef.current.volume = newVolume;
    } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (playerRef.current) {
        try {
          void playerRef.current.requestFullscreen();
          setIsFullscreen(true);
          setTimerHidden(false);
        } catch (err) {
          console.error(
            `Error attempting to enable fullscreen: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      try {
        void document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.error(
          `Error attempting to exit fullscreen: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  const toggleMiniPlayer = () => {
    if (isFullscreen) {
      try {
        void document.exitFullscreen();
      } catch (err) {
        console.error(
          `Error attempting to exit fullscreen: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    const mediaElement = e.currentTarget;
    if (mediaElement?.duration) {
      const newProgress = (mediaElement.currentTime / mediaElement.duration) * 100;
      setProgress(newProgress);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement | HTMLAudioElement>) => {
    const mediaElement = e.currentTarget;
    if (mediaElement) {
      setDuration(mediaElement.duration);
    }
  };

  const handleMediaEnded = () => {
    setIsPlaying(false);
    handleNext();
  };

  const handleNext = () => {
    if (media.length <= 1) return;

    // Pause current media if playing
    if (isPlaying) {
      if (currentMedia?.type === "MUSIC" && audioRef.current) {
        audioRef.current.pause();
      } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
        videoRef.current.pause();
      }
    }

    setCurrentIndex((prevIndex) => (prevIndex + 1) % media.length);

    // Reset playback state
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  };

  const handlePrev = () => {
    if (media.length <= 1) return;

    // Pause current media if playing
    if (isPlaying) {
      if (currentMedia?.type === "MUSIC" && audioRef.current) {
        audioRef.current.pause();
      } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
        videoRef.current.pause();
      }
    }

    setCurrentIndex((prevIndex) => (prevIndex - 1 + media.length) % media.length);

    // Reset playback state
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;

    if (currentMedia?.type === "MUSIC" && audioRef.current) {
      audioRef.current.currentTime = newTime;
    } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const seekForward = () => {
    if (currentMedia?.type === "MUSIC" && audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.currentTime + 10,
        audioRef.current.duration,
      );
    } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.currentTime + 10,
        videoRef.current.duration,
      );
    }
  };

  const seekBackward = () => {
    if (currentMedia?.type === "MUSIC" && audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
    } else if (currentMedia?.type === "VIDEO" && videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Get media type icon
  const getMediaTypeIcon = (type: MediaType) => {
    switch (type) {
      case "IMAGE":
        return <ImageIcon className="text-muted-foreground h-5 w-5" />;
      case "VIDEO":
        return <Film className="text-muted-foreground h-5 w-5" />;
      case "MUSIC":
        return <Music className="text-muted-foreground h-5 w-5" />;
      default:
        return <ImageIcon className="text-muted-foreground h-5 w-5" />;
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullscreen) {
        switch (e.key) {
          case "ArrowLeft":
            handlePrev();
            break;
          case "ArrowRight":
            handleNext();
            break;
          case " ":
            e.preventDefault();
            togglePlay();
            break;
          case "Escape":
            if (document.fullscreenElement) {
              document.exitFullscreen().catch((err) => {
                console.error(`Error exiting fullscreen: ${err}`);
              });
            }
            break;
          case "f":
            toggleFullscreen();
            break;
          case "m":
            toggleMute();
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, currentIndex]);

  // Show controls when mouse moves in fullscreen
  const handleMouseMove = () => {
    if (isFullscreen) {
      setTimerHidden(false);

      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      // Only auto-hide controls if playing
      if (isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setTimerHidden(true);
        }, 3000);
      }
    }
  };

  if (!media || media.length === 0) return null;

  return (
    <div
      className={cn(
        "bg-muted relative flex h-full w-full flex-col",
        isFullscreen && "fixed inset-0 z-50 bg-black",
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
      ref={playerRef}
    >
      {/* Main media container */}
      <div className="bg-muted relative flex-1">
        {/* Close button for fullscreen */}
        {isFullscreen && onClose && (
          <button
            className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Position indicator */}
        {media.length > 1 && (
          <div className="absolute top-4 left-4 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white">
            {currentIndex + 1} / {media.length}
          </div>
        )}

        {/* Media content */}
        <div
          className={`bg-muted relative w-full ${isFullscreen ? "h-full" : fullHeight ? "h-[90vh]" : "h-[50vh]"}`}
        >
          {/* Navigation arrows - always visible in fullscreen, only on hover in normal mode */}
          {media.length > 1 && (showControls || isFullscreen) && (
            <>
              <button
                className="absolute top-1/2 left-2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:left-4 sm:h-10 sm:w-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handlePrev();
                }}
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                className="absolute top-1/2 right-2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 sm:right-4 sm:h-10 sm:w-10"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNext();
                }}
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </>
          )}

          {/* Media display */}
          <AnimatePresence mode="wait">
            {currentMedia && (
              <motion.div
                key={currentMedia.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex h-full w-full items-center justify-center"
                onClick={(e) => {
                  // Only toggle play for non-image media and don't capture clicks in fullscreen mode when clicking controls
                  if (
                    currentMedia.type !== "IMAGE" &&
                    !e.defaultPrevented &&
                    !(isFullscreen && (e.target as HTMLElement).closest("button"))
                  ) {
                    togglePlay();
                  }
                }}
              >
                <div className="relative flex h-full w-full items-center justify-center">
                  {currentMedia.type === "IMAGE" && (
                    <div className="flex h-full w-full items-center justify-center">
                      <img
                        src={currentMedia.url ?? "/placeholder.svg?height=720&width=1280"}
                        alt={currentMedia.title ?? "Image"}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}

                  {currentMedia.type === "VIDEO" && (
                    <div className="flex h-full w-full items-center justify-center">
                      <video
                        ref={videoRef}
                        src={currentMedia.url}
                        className="max-h-full max-w-full object-contain"
                        playsInline
                        muted={isMuted}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleMediaEnded}
                      />
                    </div>
                  )}

                  {currentMedia.type === "MUSIC" && (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-linear-to-br from-gray-200 to-gray-100 p-4">
                      <div className="relative mb-4 h-24 w-24 sm:h-32 sm:w-32 md:h-48 md:w-48">
                        <motion.div
                          animate={{ rotate: isPlaying ? 360 : 0 }}
                          transition={{
                            duration: 20,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "linear",
                          }}
                          className="border-border h-full w-full overflow-hidden rounded-full border-4"
                        >
                          <img
                            src={currentMedia.thumbnail ?? platformBranding.assets.logo}
                            alt={currentMedia.title ?? "Album Art"}
                            className="absolute inset-0 size-full object-cover"
                            sizes="(max-width: 768px) 96px, 192px"
                          />
                        </motion.div>
                      </div>
                      <div className="text-center">
                        <h3 className="mb-1 text-lg font-bold sm:text-xl">
                          {currentMedia.title ?? "Unknown Track"}
                        </h3>
                        <p className="text-muted-foreground text-sm sm:text-base">
                          {currentMedia.artist ?? "Unknown Artist"}
                        </p>
                      </div>
                      <audio
                        ref={audioRef}
                        src={currentMedia.url}
                        muted={isMuted}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleMediaEnded}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Play/Pause overlay button for video/audio */}
          {(currentMedia?.type === "VIDEO" || currentMedia?.type === "MUSIC") &&
            !isPlaying &&
            showControls && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 sm:h-16 sm:w-16"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                >
                  <Play className="h-6 w-6 sm:h-8 sm:w-8" />
                </button>
              </div>
            )}
        </div>
      </div>

      {isHovering && (
        <>
          {/* Custom controls bar - conditionally shown */}
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "z-20 bg-black/90 text-white",
                isFullscreen
                  ? "absolute right-0 bottom-0 left-0 p-4"
                  : "absolute right-0 bottom-0 left-0 p-4",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress bar */}
              {(currentMedia?.type === "VIDEO" || currentMedia?.type === "MUSIC") && (
                <div
                  className="mb-3 h-1 w-full cursor-pointer bg-black"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProgressBarClick(e);
                  }}
                  ref={progressBarRef}
                >
                  <div className="bg-destructive h-full" style={{ width: `${progress}%` }} />
                </div>
              )}

              <div className="flex items-center justify-between">
                {/* Left controls */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Play/Pause button */}
                  {(currentMedia?.type === "VIDEO" || currentMedia?.type === "MUSIC") && (
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 sm:h-8 sm:w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                    >
                      {isPlaying ? (
                        <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
                      ) : (
                        <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                      )}
                    </button>
                  )}

                  {/* Seek buttons - always visible in fullscreen */}
                  {(isFullscreen ||
                    currentMedia?.type === "VIDEO" ||
                    currentMedia?.type === "MUSIC") && (
                    <>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 sm:h-8 sm:w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          seekBackward();
                        }}
                      >
                        <Rewind className="h-3 w-3 sm:h-4 sm:w-4" />
                      </button>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 sm:h-8 sm:w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          seekForward();
                        }}
                      >
                        <FastForward className="h-3 w-3 sm:h-4 sm:w-4" />
                      </button>
                    </>
                  )}

                  {/* Time display */}
                  {(currentMedia?.type === "VIDEO" || currentMedia?.type === "MUSIC") && (
                    <div className="text-xs">
                      {formatTime((progress / 100) * duration)} / {formatTime(duration)}
                    </div>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Volume control */}
                  {(currentMedia?.type === "VIDEO" || currentMedia?.type === "MUSIC") && (
                    <div className="group relative flex items-center">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 sm:h-8 sm:w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute();
                        }}
                        onMouseEnter={() => setIsVolumeSliderVisible(true)}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setIsVolumeSliderVisible(!isVolumeSliderVisible);
                        }}
                      >
                        {isMuted ? (
                          <VolumeX className="h-3 w-3 sm:h-4 sm:w-4" />
                        ) : (
                          <Volume2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        )}
                      </button>

                      {/* Volume slider - positioned differently in fullscreen mode */}
                      {isVolumeSliderVisible && (
                        <div
                          className={cn(
                            "absolute z-50 rounded bg-black p-2 shadow-lg",
                            isFullscreen
                              ? "top-0 right-0 -translate-y-full"
                              : "right-0 bottom-full mb-2",
                          )}
                          onMouseEnter={() => setIsVolumeSliderVisible(true)}
                          onMouseLeave={() => setIsVolumeSliderVisible(false)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-20 accent-red-500 sm:w-24"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fullscreen toggle */}
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/10 sm:h-8 sm:w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                  >
                    {isFullscreen ? (
                      <Minimize className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : (
                      <Maximize className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </>
      )}

      {/* Thumbnails row - only in normal mode */}
      {!isFullscreen && media.length > 1 && (
        <div className="bg-muted absolute z-10 flex h-full flex-col items-center justify-start gap-2 overflow-x-auto p-2">
          {media.map((item, index) => (
            <div key={item.id} className="shrink-0">
              <button
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  "bg-muted flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded border-2",
                  index === currentIndex ? "border-destructive" : "border-transparent",
                )}
              >
                {item.type === "IMAGE" ? (
                  <img
                    src={item.url ?? "/placeholder.svg?height=60&width=60"}
                    alt={item.title ?? `Image ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : item.thumbnail ? (
                  <img
                    src={item.thumbnail ?? "/placeholder.svg?height=60&width=60"}
                    alt={item.title ?? `Media ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    {getMediaTypeIcon(item.type)}
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen instructions - only shown in fullscreen */}
      {isFullscreen && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 transform rounded-full bg-black/50 px-3 py-1 text-xs text-white opacity-70 transition-opacity duration-300">
          Use arrow keys to navigate, space to play/pause
        </div>
      )}
    </div>
  );
}
