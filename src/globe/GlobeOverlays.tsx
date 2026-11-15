import { BodyInset } from '../fx/BodyInset';
import { HeatLegend } from '../fx/HeatLegend';
import { Intro } from '../fx/Intro';
import { GlobeHud } from './GlobeHud';

/**
 * Everything drawn over the globe that needs Cesium or three.js. Loaded lazily so the
 * rails and panels paint before the 3D libraries finish downloading.
 */
export default function GlobeOverlays({ desktop, selectedId }: { desktop: boolean; selectedId: string | null }) {
  return (
    <>
      <GlobeHud />
      <Intro />
      {desktop && <BodyInset />}
      {desktop && !selectedId && <HeatLegend className="absolute bottom-[104px] left-4" />}
    </>
  );
}
