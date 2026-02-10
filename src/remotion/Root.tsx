import { Composition } from "remotion";
import { Main } from "./MyComp/Main";
import {
  COMP_NAME,
  defaultMyCompProps,
  DURATION_IN_FRAMES,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../../types/constants";
import { NextLogo } from "./MyComp/NextLogo";
import { KaraokeComposition } from "./KaraokeComposition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={COMP_NAME}
        component={Main}
        durationInFrames={DURATION_IN_FRAMES}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={defaultMyCompProps}
      />
      <Composition
        id="NextLogo"
        component={NextLogo}
        durationInFrames={300}
        fps={30}
        width={140}
        height={140}
        defaultProps={{
          outProgress: 0,
        }}
      />
      <Composition
        id="KaraokeVideo"
        component={KaraokeComposition}
        durationInFrames={30 * 30} // Default, will be overridden by calculateMetadata
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          audioSrc: "",
          captions: [],
          backgroundType: "black",
          fps: 30,
          durationInFrames: 30 * 30,
        }}
        calculateMetadata={({ props }) => {
          // Use durationInFrames from props if provided
          const duration = props.durationInFrames || 30 * 30;
          return { durationInFrames: duration };
        }}
      />
    </>
  );
};
