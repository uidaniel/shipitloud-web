import { Composition, registerRoot } from 'remotion';
import { Demo } from './Demo';
import { FPS, VIDEO_FORMATS, durationFrames, type DemoProps } from '../types';

const sample: DemoProps = {
  name: 'Balans', host: 'balans.ng', logo: null,
  theme: { bg: '#10231c', fg: '#F7F7F4', muted: '#A3A3B1', accent: '#fdbf2f', onAccent: '#0D0D12' },
  hook: 'Still chasing clients to pay you?', cta: 'Get paid faster', shots: [{ caption: 'Send an invoice from WhatsApp' }],
};

function Root() {
  return (
    <>
      {Object.entries(VIDEO_FORMATS).map(([id, f]) => (
        <Composition key={id} id={`demo-${id}`} component={Demo} fps={FPS} width={f.width} height={f.height} defaultProps={sample}
          durationInFrames={durationFrames(sample.shots.length)}
          calculateMetadata={({ props }) => ({ durationInFrames: durationFrames(props.shots.length) })} />
      ))}
    </>
  );
}

registerRoot(Root);
