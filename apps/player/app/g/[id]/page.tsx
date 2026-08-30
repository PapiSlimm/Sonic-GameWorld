import type { Metadata } from 'next';
import { PlayClient } from './PlayClient';

export const metadata: Metadata = {
  title: 'Play — GameWorld Play',
};

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayClient gameId={id} />;
}
