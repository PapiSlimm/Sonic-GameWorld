import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge, Button, cn, DataTable, LicenseBadge, Panel, PriceTag, ScoreRing, StatTile, Tabs, tokens } from './index.js';
import preset from './tailwind-preset.js';

describe('ui', () => {
  it('cn merges conflicting classes', () => {
    expect(cn('p-2', 'p-4', false && 'x')).toBe('p-4');
  });
  it('tokens match contract', () => {
    expect(tokens.colors.bg).toBe('#05070B');
    expect(tokens.colors.accent).toBe('#38F5C8');
    expect(tokens.colors.accent2).toBe('#7C5CFF');
    const colors = (preset.theme?.extend as { colors: Record<string, unknown> }).colors;
    expect(colors['danger']).toBe('#FF4D6D');
  });
  it('renders components server-side', () => {
    const html = renderToStaticMarkup(
      <Panel title="HUD">
        <Button variant="primary">Go</Button>
        <Badge tone="accent">live</Badge>
        <PriceTag cents={1999} />
        <LicenseBadge status="YELLOW" reasons={['attribution']} />
        <ScoreRing value={82} label="rep" />
        <StatTile label="Sales" value="1.2k" delta={4.2} />
        <Tabs defaultValue="a">
          <Tabs.List><Tabs.Trigger value="a">A</Tabs.Trigger><Tabs.Trigger value="b">B</Tabs.Trigger></Tabs.List>
          <Tabs.Content value="a">panel a</Tabs.Content>
        </Tabs>
        <DataTable columns={[{ key: 'n', header: 'Name', accessor: (r: { n: string }) => r.n }]} rows={[{ n: 'x' }]} rowKey={(r) => r.n} />
      </Panel>,
    );
    expect(html).toContain('Go');
    expect(html).toContain('$19.99');
    expect(html).toContain('Check terms');
    expect(html).toContain('panel a');
    expect(html).toContain('>82<');
  });
});
