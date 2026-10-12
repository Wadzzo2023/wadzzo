import { Pause, Play } from "lucide-react";
import ReactPlayer from "react-player";
import { useState } from "react";

interface CustomPlayerProps {
  url: string;
}

/** A video/audio player with a single play/pause button instead of native controls. */
export default function CustomPlayer({ url }: CustomPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-md">
      <ReactPlayer
        src={url}
        playing={isPlaying}
        controls={false}
        width="100%"
        height="100%"
        className="react-player"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
        <button
          type="button"
          className="rounded-full bg-white/70 p-4 transition-colors hover:bg-white/90"
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? <Pause size={32} /> : <Play size={32} />}
        </button>
      </div>
    </div>
  );
}
