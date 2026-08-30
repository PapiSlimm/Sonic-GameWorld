'use client';

import { PublishWizard } from '../../../../components/publish/PublishWizard';
import { useStudioStore } from '../../../../lib/store';

export default function PublishPage() {
  const document = useStudioStore((s) => s.document);
  if (!document) return null;
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <PublishWizard document={document} />
    </div>
  );
}
