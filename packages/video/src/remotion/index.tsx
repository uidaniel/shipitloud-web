import { Composition, registerRoot } from 'remotion';
import { Demo } from './Demo';
import { Beats } from './Beats';
import { FPS, VIDEO_FORMATS, beatsFrames, durationFrames, type BeatsProps, type DemoProps } from '../types';

const sample: DemoProps = {
  name: 'Balans', host: 'balans.ng', logo: null,
  theme: { bg: '#10231c', fg: '#F7F7F4', muted: '#A3A3B1', accent: '#fdbf2f', onAccent: '#0D0D12' },
  hook: 'Still chasing clients to pay you?', cta: 'Get paid faster', shots: [{ caption: 'Send an invoice from WhatsApp' }],
};

const beatsSample: BeatsProps = {
  name: 'Balans', host: 'balans.ng', logo: null, theme: sample.theme,
  beats: [{ layout: 'title', text: 'POV: the app is done and nobody knows' }, { layout: 'end', text: 'Ship it loud' }],
};

function Root() {
  return (
    <>
      {Object.entries(VIDEO_FORMATS).map(([id, f]) => (
        <Composition key={id} id={`demo-${id}`} component={Demo} fps={FPS} width={f.width} height={f.height} defaultProps={sample}
          durationInFrames={durationFrames(sample.shots.length)}
          calculateMetadata={({ props }) => ({ durationInFrames: durationFrames(props.shots.length) })} />
      ))}
      {(['story', 'square'] as const).map((id) => (
        <Composition key={`beats-${id}`} id={`beats-${id}`} component={Beats} fps={FPS} width={VIDEO_FORMATS[id].width} height={VIDEO_FORMATS[id].height} defaultProps={beatsSample}
          durationInFrames={beatsFrames(beatsSample.beats)}
          calculateMetadata={({ props }) => ({ durationInFrames: beatsFrames(props.beats) })} />
      ))}
    </>
  );
}

registerRoot(Root);
