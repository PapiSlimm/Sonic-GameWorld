'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, Globe2, UploadCloud } from 'lucide-react';
import { Button, Panel, cn } from '@sonic-gameworld/ui';
import { uploadAsset } from '@sonic-gameworld/asset-sdk';
import { useApi, useResource } from '../../lib/api';
import { demoWorlds } from '../../lib/demo';
import { useWizardStore } from '../../lib/wizard-store';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadPanel() {
  const { client, status } = useApi();
  const { form, setUpload } = useWizardStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      if (status !== 'live') {
        // Offline demo: simulate the presigned upload + progress without hitting a network.
        for (let p = 0; p <= 100; p += 20) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 120));
          setProgress(p);
        }
        setUpload({ fileKey: `demo/${file.name}`, fileName: file.name, sizeBytes: file.size, assetId: `asset_demo_${Date.now()}` });
      } else {
        const result = await uploadAsset(client, file, { onProgress: (loaded, total) => setProgress(total > 0 ? Math.round((loaded / total) * 100) : null) });
        const asset = await client.assets.create({
          name: file.name.replace(/\.[^.]+$/, ''),
          fileKey: result.fileKey,
          fileName: result.fileName,
          sizeBytes: result.sizeBytes,
          contentType: result.contentType,
        });
        setUpload({ fileKey: result.fileKey, fileName: result.fileName, sizeBytes: result.sizeBytes, assetId: asset.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="2. Upload asset">
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-border p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <UploadCloud className="h-8 w-8 text-accent" />
        <p className="text-sm text-text">Drag a file here, or</p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} loading={busy}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".fbx,.glb,.gltf,.obj,.usd,.blend,.png,.jpg,.jpeg,.wav,.mp3,.mp4,.zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p className="text-xs text-muted">FBX, GLB, GLTF, OBJ, USD, BLEND, PNG, JPG, WAV, MP3, MP4, ZIP</p>
      </div>

      {progress !== null && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 font-hud text-xs text-muted">{progress}%</p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {form.assetFileKey && (
        <div className="mt-4 flex items-center gap-2 rounded-control border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {form.assetFileName} ({form.assetSizeBytes !== null ? formatBytes(form.assetSizeBytes) : ''}) uploaded
        </div>
      )}
    </Panel>
  );
}

function PickWorldPanel() {
  const { form, setWorldId } = useWizardStore();
  const res = useResource(
    'wizard:worlds',
    async (c) => {
      const page = await c.worlds.list({ limit: 50 });
      return page.items.map((w) => ({ id: w.id, name: w.name, description: w.description, thumbnailUrl: w.thumbnailUrl, entityCount: w.entityCount }));
    },
    demoWorlds,
  );

  return (
    <Panel title="2. Pick a world">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {res.data.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setWorldId(w.id)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-panel border p-4 text-left transition-colors',
              form.worldId === w.id ? 'border-accent bg-accent/10 shadow-glow' : 'border-border hover:border-accent/40',
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-text">
              <Globe2 className="h-4 w-4 text-accent" /> {w.name}
            </span>
            <span className="text-xs text-muted">{w.description}</span>
            <span className="font-hud text-[10px] uppercase tracking-wider text-muted">{w.entityCount} entities</span>
          </button>
        ))}
        {res.data.length === 0 && !res.loading && <p className="text-sm text-muted">No worlds found — create one in GameWorld Studio first.</p>}
      </div>
    </Panel>
  );
}

export function StepUpload() {
  const { form } = useWizardStore();
  return form.kind === 'ASSET' ? <UploadPanel /> : <PickWorldPanel />;
}
