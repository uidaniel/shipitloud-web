import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'ShipItLoud: You built it. Ship it loud.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Social header from the PRD: tagline on ink with "loud." on a lime highlight.
export default async function OpengraphImage() {
  const svg = await readFile(join(process.cwd(), 'app', 'icon.svg'));
  const icon = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#0D0D12', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#F5F5F2', fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} width={56} height={56} alt="" />
          <div style={{ display: 'flex' }}>ShipIt<span style={{ color: '#C6FF3D' }}>Loud</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', color: '#F5F5F2', fontSize: 112, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>
          <div>You built it.</div>
          <div style={{ display: 'flex', color: '#8A8A93' }}>
            Ship it&nbsp;<span style={{ background: '#C6FF3D', color: '#0D0D12', padding: '0 12px' }}>loud.</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
